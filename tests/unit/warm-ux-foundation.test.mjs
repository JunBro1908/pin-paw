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
  assert.match(icon, /strokeLinecap="round"/);
  assert.match(icon, /strokeLinejoin="round"/);
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

test("buttons expose semantic danger and quiet variants", async () => {
  const [button, css] = await Promise.all([
    read("src/shared/ui/Button.tsx"),
    read("src/app/globals.css"),
  ]);

  assert.match(
    button,
    /variant\?: "primary" \| "secondary" \| "danger" \| "quiet"/
  );
  assert.match(button, /danger:\s*"[^"]*text-danger-text/);
  assert.match(button, /quiet:\s*"[^"]*text-action-primary/);
  assert.match(css, /--danger-text:\s*#[0-9a-f]{6}/i);
  assert.match(css, /--color-danger-text:\s*var\(--danger-text\)/);
  assert.match(css, /--error:\s*var\(--danger-text\)/);
  assert.match(
    css,
    /prefers-color-scheme:\s*dark[\s\S]*--danger-text:\s*#[0-9a-f]{6}/i
  );
});

test("primary buttons use the action token when pressed", async () => {
  const button = await read("src/shared/ui/Button.tsx");
  assert.match(button, /active:bg-action-primary-hover/);
});

test("secondary buttons expose the semantic high-contrast boundary", async () => {
  const button = await read("src/shared/ui/Button.tsx");
  assert.match(
    button,
    /border border-action-primary bg-surface text-text-main hover:bg-surface-soft/
  );
});

test("bottom navigation uses product labels and outline icons", async () => {
  const layout = await read("src/app/(tabs)/layout.tsx");
  for (const label of ["제보", "지도", "찾기", "내 정보"])
    assert.match(layout, new RegExp(`label: "${label}"`));
  assert.match(layout, /icon: "paw"/);
  assert.match(layout, /icon: "user"/);
  assert.match(layout, /<Icon name=\{tab\.icon\}/);
  assert.match(layout, /aria-current=\{isActive \? "page"/);
  assert.doesNotMatch(layout, /🏠|🗺️|⭐|👤|text-blue/u);
});

test("home has a real h1 and secondary lost-registration link", async () => {
  const page = await read("src/app/(tabs)/page.tsx");
  assert.match(page, /<Text[^>]+as="h1"/);
  assert.match(page, /소중한 제보들이 모여, 유실견을 따듯한 가족의 품으로 안내해줍니다/);
  assert.match(page, /href="\/my\/lost-posts\/new"/);
  assert.match(page, /반려동물을 잃어버렸나요\?/);
  assert.doesNotMatch(page, /유실글 올리기/);
  assert.doesNotMatch(page, /flex-col items-center/);
  assert.match(page, /<Text variant="body" color="sub" className="mt-1">/);
  assert.doesNotMatch(page, /opacity-70/);
  assert.doesNotMatch(
    page,
    /짧은 제보 하나가 PinPaw에서 가족을 찾는 따뜻한 실마리가 됩니다/
  );
  assert.doesNotMatch(page, /쉽고 빠른 제보들이 모여/);
  assert.doesNotMatch(page, /유실 등록하기/);
});

test("global typography uses the approved Korean system font stack", async () => {
  const css = (await read("src/app/globals.css")).replace(/\s+/g, " ");
  const stack =
    '-apple-system, BlinkMacSystemFont, "Apple SD Gothic Neo", "Noto Sans KR", "Malgun Gothic", sans-serif';

  assert.ok(css.includes(`--font-sans: ${stack}`));
  assert.ok(css.includes(`font-family: ${stack}`));
});

test("lost-registration link exposes a 44px target", async () => {
  const page = await read("src/app/(tabs)/page.tsx");
  assert.match(
    page,
    /href="\/my\/lost-posts\/new"[\s\S]*?className="[^"]*inline-flex min-h-11 min-w-11 items-center justify-center/
  );
});

test("core-flow semantic color utilities map to declared tokens", async () => {
  const paths = [
    "src/app/(tabs)/layout.tsx",
    "src/app/(tabs)/page.tsx",
    "src/features/map/components/LocationPicker.tsx",
    "src/features/sightings/components/SightingEssentials.tsx",
    "src/features/sightings/components/SightingForm.tsx",
    "src/features/sightings/components/SightingOptionalDetails.tsx",
    "src/shared/ui/Button.tsx",
    "src/shared/ui/Text.tsx",
    "src/shared/ui/Toast.tsx",
  ];
  const [css, ...sources] = await Promise.all([
    read("src/app/globals.css"),
    ...paths.map(read),
  ]);
  const semanticToken =
    /\b(?:bg|text|border|outline|ring)-(brand-pin|action-[a-z-]+|background-warm|surface(?:-soft)?|text-(?:main|sub|caption)|border-subtle|accent-warm(?:-text)?|status-[a-z-]+|danger-text|error|primary(?:-soft)?)(?:\/\d+)?\b/g;
  const referenced = new Set(
    sources.flatMap((source) =>
      Array.from(source.matchAll(semanticToken), (match) => match[1])
    )
  );

  for (const token of referenced) {
    assert.match(
      css,
      new RegExp(`--color-${token}:\\s*var\\(--${token}\\)`),
      `${token} must map to a declared semantic color token`
    );
  }
});
