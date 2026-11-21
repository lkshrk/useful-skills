#!/usr/bin/env python3
"""Standard-library checks against a generated Auctionator fixture in a temporary directory."""
import datetime as dt
import json
from pathlib import Path
import subprocess
import sys
import tempfile

sys.dont_write_bytecode = True
from writs import SCAN_DAY_0, cbor_decode, load_writs, money, parse_lua, prices, rank

SCRIPT = Path(__file__).resolve().parent / "writs.py"
TODAY = (dt.datetime.now() - SCAN_DAY_0).days


def head(major, n):
    if n < 24:
        return bytes([major << 5 | n])
    for info, size in ((24, 1), (25, 2), (26, 4), (27, 8)):
        if n < 1 << (8 * size):
            return bytes([major << 5 | info]) + n.to_bytes(size, "big")
    raise ValueError(n)


def cbor(value):
    if isinstance(value, int):
        return head(0, value)
    if isinstance(value, str):
        data = value.encode()
        return head(2, len(data)) + data
    if isinstance(value, dict):
        return head(5, len(value)) + b"".join(cbor(k) + cbor(v) for k, v in value.items())
    raise TypeError(value)


def lua_bytes(data):
    return '"' + "".join(chr(b) if 32 <= b < 127 and chr(b) not in '"\\' else f"\\{b}" for b in data) + '"'


def entry(price, age=0):
    day = str(TODAY - age)
    return {"m": price, "h": {day: price}, "l": {day: price}, "a": {day: 1}}


def fixture(directory, realms):
    body = ",\n".join(f'["{name}"] = {lua_bytes(cbor(items))}' for name, items in realms.items())
    path = Path(directory) / "Auctionator.lua"
    path.write_bytes(("AUCTIONATOR_PRICE_DATABASE = {\n[\"__dbversion\"] = 8,\n" + body + ",\n}\n"
                      "AUCTIONATOR_CONFIG = {\n[\"x\"] = true,\n}\n").encode("latin-1"))
    return path


def run(*args):
    return subprocess.run([sys.executable, "-I", str(SCRIPT), *args], check=True, capture_output=True, text=True).stdout


rows = load_writs()
assert len(rows) == 150, len(rows)
assert {t: sum(r["tier"] == t for r in rows) for t in ("journeyman", "expert", "artisan")} == {"journeyman": 45, "expert": 60, "artisan": 45}
assert len({r["writ_id"] for r in rows}) == 150
assert all(r["qty"] >= 1 and r["rep"] in (75, 125, 200) for r in rows)
assert sum(bool(r["turnin_zone"]) for r in rows) == 131
assert all(r["turnin_zone"] for r in rows if r["turnin_x"])

artisan = [r for r in rows if r["tier"] == "artisan"]
expert = next(r for r in rows if r["tier"] == "expert")
a1, a2, a3 = artisan[0], artisan[1], artisan[2]
items = {
    str(a1["writ_id"]): entry(500), str(a1["item_id"]): entry(10000, age=3),
    str(a2["writ_id"]): entry(20000), f"g:{a2['item_id']}:45": entry(400), f"g:{a2['item_id']}:50": entry(300),
    str(a3["writ_id"]): entry(100),
    str(expert["writ_id"]): entry(100), str(expert["item_id"]): entry(100),
}
small = {str(a1["writ_id"]): entry(1)}

assert cbor_decode(cbor({"a": {"1": 2}, "m": 70000})) == {"a": {"1": 2}, "m": 70000}
assert parse_lua('X = {\n["k"] = "\\0\\255a",\n[1] = -2,\n}\n')["X"] == {b"k": b"\x00\xffa", 1: -2}
assert money(12345) == "1g 23s" and money(99) == "99c" and money(500) == "5s"

with tempfile.TemporaryDirectory() as tmp:
    path = fixture(tmp, {"Big Realm": items, "Small Realm": small})

    out = run("--file", str(path))
    assert "realm Big Realm" in out and "Tier artisan" in out and "latest scan" in out, out
    first = next(l for l in out.splitlines() if l.startswith("| 1 "))
    assert first.startswith(f"| 1 | {a2['writ']} |") and "2g 03s" in first, out
    assert first.endswith((f" {a2['turnin_zone']} {float(a2['turnin_x']):.1f}, {float(a2['turnin_y']):.1f} |" if a2["turnin_zone"] else " unknown |")), first
    assert f"{a1['writ']} (item)" in out and f"{a3['writ']} (item)" in out, out
    assert "(3d)" not in out

    data = json.loads(run("--file", str(path), "--sort", "rep", "--json"))[0]
    assert data["tier"] == "all" and data["results"][0]["writ_id"] == expert["writ_id"], data["results"][0]
    assert data["results"][0]["rep_per_gold"] == 125 / 0.02

    only = json.loads(run("--file", str(path), "--tier", "expert", "--json"))[0]
    assert [r["writ_id"] for r in only["results"]] == [expert["writ_id"]]

    small_out = json.loads(run("--file", str(path), "--realm", "Small Realm", "--json"))[0]
    assert small_out["realm"] == "Small Realm" and small_out["results"] == []

    old = fixture(tmp, {"Old Busy Realm": {str(i): entry(1, age=5) for i in range(1, 50)}, "Big Realm": items})
    assert json.loads(run("--file", str(old), "--json"))[0]["realm"] == "Big Realm"

    wow = Path(tmp) / "wow" / "_forever_" / "WTF" / "Account" / "ACC" / "SavedVariables"
    wow.mkdir(parents=True)
    (wow / "Auctionator.lua").write_bytes(path.read_bytes())
    assert "realm Big Realm" in run("--wow-dir", str(Path(tmp) / "wow"))

    bad = Path(tmp) / "bad.lua"
    bad.write_text("X = os.execute('true')\n")
    failed = subprocess.run([sys.executable, "-I", str(SCRIPT), "--file", str(bad)], capture_output=True, text=True)
    assert failed.returncode != 0 and "Unsupported Lua syntax" in failed.stderr and "Traceback" not in failed.stderr, failed.stderr

table, latest = prices(cbor({"1": entry(5, age=2), "2": entry(7), "3": entry(9, age=1)}))
assert table == {2: 7} and latest == TODAY

assert rank(rows, {}, "artisan", "price") == ([], [{"writ": r["writ"], "tier": "artisan", "missing": "writ and item"} for r in artisan])
print("wow-forever-writs checks passed")
