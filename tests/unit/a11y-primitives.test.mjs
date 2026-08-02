import assert from "node:assert/strict";
import test from "node:test";
import { readFile } from "node:fs/promises";

test("root layout uses Korean lang and PinPaw metadata", async () => {
  const source = await readFile("src/app/layout.tsx", "utf8");
  assert.match(source, /lang=["']ko["']/);
  assert.match(source, /PinPaw/);
  assert.doesNotMatch(source, /Create Next App/);
});

test("Button exposes busy state for assistive tech", async () => {
  const source = await readFile("src/shared/ui/Button.tsx", "utf8");
  assert.match(source, /aria-busy=\{Boolean\(isLoading\)\}/);
  assert.match(source, /aria-live="polite"/);
});

test("Loading and Toast announce status changes with matching urgency", async () => {
  const loading = await readFile("src/shared/ui/Loading.tsx", "utf8");
  const toast = await readFile("src/shared/ui/Toast.tsx", "utf8");
  assert.match(loading, /role="status"/);
  assert.match(loading, /aria-live="polite"/);
  assert.match(toast, /role=\{type === "error" \? "alert" : "status"\}/);
  assert.match(
    toast,
    /aria-live=\{type === "error" \? "assertive" : "polite"\}/
  );
  assert.match(toast, /type\?\: "success" \| "error" \| "loading"/);
  assert.match(toast, /bg-action-primary text-action-on-primary/);
  assert.match(toast, /text-danger-text/);
  assert.doesNotMatch(toast, /bg-primary text-white|bg-red-500 text-white/);
});

test("tabs navigation exposes current page and skip link exists", async () => {
  const layout = await readFile("src/app/(tabs)/layout.tsx", "utf8");
  const globals = await readFile("src/app/globals.css", "utf8");
  assert.match(layout, /aria-label="주요 탐색"/);
  assert.match(layout, /aria-current=\{isActive \? "page" : undefined\}/);
  assert.match(layout, /메인 콘텐츠로 건너뛰기/);
  assert.match(globals, /:focus-visible/);
});
