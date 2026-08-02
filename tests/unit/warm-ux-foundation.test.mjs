import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const read = (path) => readFile(path, "utf8");

test("warm semantic tokens and dark overrides are defined", async () => {
  const css = await read("src/app/globals.css");
  for (const value of [
    "--brand-pin: #03c75a",
    "--action-primary: #087a3e",
    "--background-warm: #fff9f1",
    "--text-main: #2b251f",
    "--border-subtle: #e7dccf",
  ])
    assert.match(css.toLowerCase(), new RegExp(value));
  assert.match(css, /prefers-color-scheme:\s*dark/);
});

test("icons are local SVGs and Text supports real headings", async () => {
  const [icon, text] = await Promise.all([
    read("src/shared/ui/Icon.tsx"),
    read("src/shared/ui/Text.tsx"),
  ]);
  assert.match(icon, /export type IconName/);
  assert.match(icon, /<svg/);
  assert.doesNotMatch(icon, /🏠|🗺️|⭐|👤/u);
  assert.match(text, /as\?:\s*"p"\s*\|\s*"span"\s*\|\s*"h1"/);
});

test("buttons expose 44px target and primary action token", async () => {
  const button = await read("src/shared/ui/Button.tsx");
  assert.match(button, /min-h-11/);
  assert.match(button, /bg-action-primary/);
  assert.match(button, /focus-visible/);
});
