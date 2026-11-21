import { test } from "bun:test";
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";

test("forever writs ranks Auctionator prices from a generated fixture", () => {
  const script = fileURLToPath(
    new URL("../skills/wow-forever-writs/scripts/check_writs.py", import.meta.url),
  );
  execFileSync("python3", [script], { timeout: 30_000, stdio: "pipe" });
});
