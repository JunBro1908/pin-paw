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
  assert.match(button, /min-w-11/);
  assert.match(button, /bg-action-primary/);
  assert.match(button, /focus-visible/);
});

test("primary buttons use the action token when pressed", async () => {
  const button = await read("src/shared/ui/Button.tsx");
  assert.match(button, /active:bg-action-primary-hover/);
});

test("secondary buttons use semantic high-contrast colors", async () => {
  const button = await read("src/shared/ui/Button.tsx");
  assert.match(
    button,
    /border border-border-subtle bg-surface-soft text-text-main hover:bg-border-subtle/
  );
});

test("bottom navigation uses product labels and outline icons", async () => {
  const layout = await read("src/app/(tabs)/layout.tsx");
  for (const label of ["제보", "지도", "확인", "내 활동"])
    assert.match(layout, new RegExp(`label: "${label}"`));
  assert.match(layout, /<Icon name=\{tab\.icon\}/);
  assert.match(layout, /aria-current=\{isActive \? "page"/);
  assert.doesNotMatch(layout, /🏠|🗺️|⭐|👤|text-blue/u);
});

test("home has a real h1 and secondary lost-registration link", async () => {
  const page = await read("src/app/(tabs)/page.tsx");
  assert.match(page, /<Text[^>]+as="h1"/);
  assert.match(page, /반려동물을 잃어버렸나요\?/);
  assert.match(page, /href="\/my\/lost-posts\/new"/);
});

test("lost-registration link exposes a 44px target", async () => {
  const page = await read("src/app/(tabs)/page.tsx");
  assert.match(
    page,
    /href="\/my\/lost-posts\/new"[\s\S]*?className="[^"]*inline-flex min-h-11 min-w-11 items-center justify-center/
  );
});
