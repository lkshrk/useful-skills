#!/usr/bin/env python3
"""Rank WoW Forever Craftsman's Writs by Auctionator prices; reads saved data only, no Lua execution or network."""
import argparse
import datetime as dt
import glob
import json
import math
import os
from pathlib import Path
import re
import struct
import sys

SKILL = Path(__file__).resolve().parent.parent
DATA = SKILL / "assets" / "writs-forever.tsv"
TIERS = ("artisan", "expert", "journeyman", "all")
SCAN_DAY_0 = dt.datetime(2020, 1, 1)
COMMON_WOW_DIRS = (
    "C:/Program Files (x86)/World of Warcraft",
    "C:/Program Files/World of Warcraft",
    "/Applications/World of Warcraft",
    "~/Games/World of Warcraft",
    "~/.wine/drive_c/Program Files (x86)/World of Warcraft",
)

NUMBER = r"(?:0[xX][0-9a-fA-F]+|(?:\d+(?:\.\d*)?|\.\d+)(?:[eE][+-]?\d+)?)"
TOKEN = re.compile(r'''\s+|--[^\n]*|"(?:\\.|[^"\\])*"|'(?:\\.|[^'\\])*'|''' + NUMBER + r"|[A-Za-z_][A-Za-z_0-9]*|[{}\[\]=,;+-]", re.S)
ESCAPES = {"n": 10, "r": 13, "t": 9, "a": 7, "b": 8, "f": 12, "v": 11, "\\": 92, '"': 34, "'": 39, "\n": 10}


def parse_lua(text):
    """Literal saved-variable assignments only. Text is latin-1 decoded so strings keep their raw bytes."""
    tokens, offset = [], 0
    for match in TOKEN.finditer(text):
        if match.start() != offset:
            raise ValueError(f"Unsupported Lua syntax at offset {offset}")
        offset = match.end()
        token = match.group()
        if not token.isspace() and not token.startswith("--"):
            tokens.append(token)
    if offset != len(text):
        raise ValueError(f"Unsupported Lua syntax at offset {offset}")
    index = 0

    def take(expected=None):
        nonlocal index
        if index >= len(tokens):
            raise ValueError("Incomplete Lua data")
        token = tokens[index]
        index += 1
        if expected is not None and token != expected:
            raise ValueError(f"Expected {expected!r}, got {token!r}")
        return token

    def string(token):
        output = bytearray()
        for match in re.finditer(r"\\(\d{1,3}|.)|([^\\]+)", token[1:-1], re.S):
            escaped, plain = match.groups()
            if plain is not None:
                output.extend(plain.encode("latin-1"))
            elif escaped.isdigit() and int(escaped) <= 255:
                output.append(int(escaped))
            elif escaped in ESCAPES:
                output.append(ESCAPES[escaped])
            else:
                raise ValueError("Unsupported Lua string escape")
        return bytes(output)

    def value(depth=0):
        if depth > 100:
            raise ValueError("Lua data exceeds maximum nesting depth")
        token = take()
        if token == "{":
            result, ordinal = {}, 1
            while index < len(tokens) and tokens[index] != "}":
                if tokens[index] == "[":
                    take("["); key = value(depth + 1); take("]"); take("=")
                elif index + 1 < len(tokens) and tokens[index + 1] == "=":
                    key = take().encode("latin-1"); take("=")
                else:
                    key, ordinal = ordinal, ordinal + 1
                if type(key) not in (bytes, int, float) or key in result:
                    raise ValueError("Unsupported or duplicate Lua table key")
                result[key] = value(depth + 1)
                if index < len(tokens) and tokens[index] in (",", ";"):
                    take()
                elif index < len(tokens) and tokens[index] != "}":
                    raise ValueError("Expected table separator")
            take("}")
            return result
        if token.startswith(('"', "'")):
            return string(token)
        if token in ("true", "false", "nil"):
            return {"true": True, "false": False, "nil": None}[token]
        if token in ("-", "+"):
            number = value(depth + 1)
            if type(number) not in (int, float):
                raise ValueError("Sign before non-number")
            return -number if token == "-" else number
        if re.fullmatch(NUMBER, token):
            number = int(token, 16) if token.lower().startswith("0x") else float(token) if any(c in token for c in ".eE") else int(token)
            if not math.isfinite(number):
                raise ValueError("Non-finite number")
            return number
        raise ValueError("Non-literal Lua expression")

    result = {}
    while index < len(tokens):
        key = take()
        if not re.fullmatch(r"[A-Za-z_][A-Za-z_0-9]*", key) or key in result:
            raise ValueError("Invalid or duplicate root assignment")
        take("="); result[key] = value()
        if index < len(tokens) and tokens[index] == ";":
            take()
    return result


def cbor_decode(data):
    """Definite-length CBOR, the subset Auctionator's LibCBOR writes."""
    pos = 0

    def length(info):
        nonlocal pos
        if info < 24:
            return info
        size = {24: 1, 25: 2, 26: 4, 27: 8}.get(info)
        if size is None:
            raise ValueError("Unsupported CBOR length")
        value = int.from_bytes(data[pos:pos + size], "big")
        pos += size
        return value

    def item(depth=0):
        nonlocal pos
        if depth > 100 or pos >= len(data):
            raise ValueError("Malformed CBOR")
        head = data[pos]
        pos += 1
        major, info = head >> 5, head & 31
        if major == 7:
            if info in (20, 21, 22, 23):
                return {20: False, 21: True, 22: None, 23: None}[info]
            fmt = {25: ">e", 26: ">f", 27: ">d"}.get(info)
            if not fmt:
                raise ValueError("Unsupported CBOR simple value")
            size = struct.calcsize(fmt)
            value = struct.unpack(fmt, data[pos:pos + size])[0]
            pos += size
            return value
        n = length(info)
        if major == 0:
            return n
        if major == 1:
            return -1 - n
        if major in (2, 3):
            chunk = data[pos:pos + n]
            pos += n
            # LibCBOR writes every Lua string as a byte string; here they are all text.
            return chunk.decode("utf-8", "replace")
        if major == 4:
            return [item(depth + 1) for _ in range(n)]
        if major == 5:
            out = {}
            for _ in range(n):
                key = item(depth + 1)
                out[key] = item(depth + 1)
            return out
        if major == 6:
            return item(depth + 1)
        raise ValueError("Unsupported CBOR type")

    return item()


def item_id(key):
    if isinstance(key, int):
        return key
    match = re.match(r"(?:g:)?(\d+)", str(key))
    return int(match.group(1)) if match else None


def days(value):
    if isinstance(value, dict):
        return [int(k) for k in value if isinstance(k, (int, float)) or str(k).isdigit()]
    if isinstance(value, list):
        return [i for i, v in enumerate(value, 1) if v is not None]
    return []


def prices(blob):
    """Prices of items seen on the realm's latest scan day; anything older is no longer listed."""
    db = cbor_decode(blob)
    if not isinstance(db, dict):
        raise ValueError("Unexpected Auctionator price data")
    entries = []
    for key, entry in db.items():
        iid = item_id(key)
        seen = days(entry.get("h")) if isinstance(entry, dict) else []
        if iid is not None and seen and isinstance(entry.get("m"), (int, float)):
            entries.append((iid, int(entry["m"]), max(seen)))
    latest = max((day for _, _, day in entries), default=None)
    out = {}
    for iid, price, day in entries:
        if day == latest and (iid not in out or price < out[iid]):
            out[iid] = price
    return out, latest


def load_writs(path=DATA):
    rows = []
    with open(path, encoding="utf-8") as handle:
        header = None
        for line in handle:
            line = line.rstrip("\n")
            if not line or line.startswith("#"):
                continue
            fields = line.split("\t")
            if header is None:
                header = fields
                continue
            numeric = ("writ_id", "item_id", "qty", "rep", "quest_id", "skill")
            rows.append({k: int(v) if k in numeric and v.isdigit() else v for k, v in zip(header, fields)})
    return rows


def find_saved_variables(wow_dir=None):
    env_dir = os.environ.get("WOW_DIR")
    roots = [wow_dir] if wow_dir else [env_dir] if env_dir else list(COMMON_WOW_DIRS)
    found = []
    for root in roots:
        pattern = os.path.join(os.path.expanduser(root), "_forever_", "WTF", "Account", "*", "SavedVariables", "Auctionator.lua")
        found.extend(sorted(glob.glob(pattern)))
    return found


def rank(rows, table, tier, sort):
    priced, unpriced = [], []
    for row in rows:
        if tier != "all" and row["tier"] != tier:
            continue
        writ, item = table.get(row["writ_id"]), table.get(row["item_id"])
        if writ is None or item is None:
            missing = "writ and item" if writ is None and item is None else "writ" if writ is None else "item"
            unpriced.append({"writ": row["writ"], "tier": row["tier"], "missing": missing})
            continue
        total = writ + item * row["qty"]
        priced.append({**row, "writ_price": writ, "item_price": item * row["qty"], "total": total,
                       "rep_per_gold": row["rep"] / (total / 10000) if total else math.inf})
    key = (lambda r: -r["rep_per_gold"]) if sort == "rep" else (lambda r: r["total"])
    priced.sort(key=key)
    return priced, unpriced


def money(copper):
    gold, silver = copper // 10000, copper % 10000 // 100
    if gold:
        return f"{gold}g {silver:02d}s"
    return f"{silver}s" if silver else f"{copper % 100}c"


def turn_in(row):
    zone = row.get("turnin_zone")
    if not zone:
        return "unknown"
    x, y = row.get("turnin_x"), row.get("turnin_y")
    return f"{zone} {float(x):.1f}, {float(y):.1f}" if x and y else zone


def scan_date(day, today):
    date = (SCAN_DAY_0 + dt.timedelta(days=day)).strftime("%Y-%m-%d")
    return date if day >= today else f"{date}, {today - day} day(s) ago"


def report(source, realm, tier, sort, priced, unpriced, top):
    lines = [f"File saved {source['saved']}, realm {realm}, latest scan {source['scan']}. Tier {tier}, sorted by "
             f"{'reputation per gold' if sort == 'rep' else 'total price'}. {len(priced)} available, "
             f"{len(unpriced)} not in the latest scan.", ""]
    rep_col, tier_col = sort == "rep" or tier == "all", tier == "all"
    head = ("| # | Writ |" + (" Tier |" if tier_col else "") + " Item | Writ price | Item price | Total |"
            + (" Rep | Rep/gold |" if rep_col else "") + " Turn-in |")
    lines += [head, "|" + "---|" * (head.count("|") - 1)]
    for n, r in enumerate(priced[:top], 1):
        item = "same" if r["item"] == r["writ"] else r["item"]
        if r["qty"] > 1:
            item += f" x{r['qty']}"
        line = (f"| {n} | {r['writ']} |" + (f" {r['tier']} |" if tier_col else "")
                + f" {item} | {money(r['writ_price'])} | {money(r['item_price'])} | {money(r['total'])} |")
        if rep_col:
            line += f" {r['rep']} | {r['rep_per_gold']:.0f} |"
        line += f" {turn_in(r)} |"
        lines.append(line)
    if unpriced:
        lines += ["", "Not in the latest scan: " + ", ".join(f"{u['writ']} ({u['missing']})" for u in unpriced)]
    return "\n".join(lines)


def main(argv=None):
    parser = argparse.ArgumentParser(description=__doc__)
    where = parser.add_mutually_exclusive_group()
    where.add_argument("--file", help="Auctionator.lua (account SavedVariables)")
    where.add_argument("--wow-dir", help="World of Warcraft install folder containing _forever_")
    parser.add_argument("--tier", choices=TIERS, help="default: artisan, or all with --sort rep")
    parser.add_argument("--top", type=int, default=10)
    parser.add_argument("--sort", choices=("price", "rep"), default="price")
    parser.add_argument("--realm", help="default: the most recently scanned realm")
    parser.add_argument("--json", action="store_true")
    args = parser.parse_args(argv)
    tier = args.tier or ("all" if args.sort == "rep" else "artisan")

    files = [args.file] if args.file else find_saved_variables(args.wow_dir)
    if not files:
        sys.exit("No _forever_ Auctionator.lua found. Pass --file or --wow-dir, or set WOW_DIR.")
    today = (dt.datetime.now() - SCAN_DAY_0).days
    rows = load_writs()
    results = []
    for path in files:
        try:
            saved = parse_lua(Path(path).read_bytes().decode("latin-1")).get("AUCTIONATOR_PRICE_DATABASE")
        except (OSError, ValueError) as error:
            sys.exit(f"{path}: {error}")
        if not isinstance(saved, dict):
            sys.exit(f"{path}: no AUCTIONATOR_PRICE_DATABASE")
        realms = {}
        for name, blob in saved.items():
            if isinstance(blob, bytes) and name != b"__dbversion":
                label = name.decode("utf-8", "replace") if isinstance(name, bytes) else str(name)
                if args.realm and label != args.realm:
                    continue
                try:
                    table, latest = prices(blob)
                except (ValueError, IndexError, struct.error) as error:
                    sys.exit(f"{path}: realm {label}: {error}")
                if latest is not None:
                    realms[label] = (table, latest)
        if not realms:
            sys.exit(f"{path}: no price data" + (f" for realm {args.realm}" if args.realm else ""))
        realm = max(realms, key=lambda r: (realms[r][1], len(realms[r][0])))
        table, latest = realms[realm]
        priced, unpriced = rank(rows, table, tier, args.sort)
        source = {"file": str(path), "scan": scan_date(latest, today),
                  "saved": dt.datetime.fromtimestamp(os.path.getmtime(path)).strftime("%Y-%m-%d %H:%M")}
        results.append((source, realm, priced, unpriced))
    if args.json:
        print(json.dumps([{"source": s, "realm": r, "tier": tier, "sort": args.sort, "results": p[:args.top], "unpriced": u}
                          for s, r, p, u in results], indent=2, default=str))
    else:
        print("\n\n".join(report(s, r, tier, args.sort, p, u, args.top) for s, r, p, u in results))


if __name__ == "__main__":
    main()
