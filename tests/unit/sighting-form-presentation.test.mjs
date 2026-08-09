import assert from "node:assert/strict";
import test from "node:test";
import { readFile } from "node:fs/promises";
import {
  parseSeoulDateTimeLocal,
  toLocalDatetimeLocalString,
} from "../../src/shared/lib/date.ts";

test("formats datetime-local in Asia/Seoul regardless of host timezone", () => {
  // 2026-08-02 00:05 UTC == 09:05 Seoul
  const date = new Date("2026-08-02T00:05:00.000Z");
  assert.equal(toLocalDatetimeLocalString(date), "2026-08-02T09:05");
});

test("parses datetime-local strings as Seoul wall time", () => {
  const parsed = parseSeoulDateTimeLocal("2026-08-02T23:05");
  assert.ok(parsed);
  assert.equal(parsed.toISOString(), "2026-08-02T14:05:00.000Z");
});

test("sighting presentation delegates datetime-local formatting to Seoul helper", async () => {
  const source = await readFile(
    "src/features/sightings/lib/sighting-form-presentation.ts",
    "utf8"
  );
  assert.match(source, /toLocalDatetimeLocalString/);
  assert.match(source, /toLocalDateTimeInputValue/);
  assert.doesNotMatch(source, /getHours\(\)|toISOString\(\)\.slice/);
});

test("sighting presentation delegates location copy to the shared formatter", async () => {
  const source = await readFile(
    "src/features/sightings/lib/sighting-form-presentation.ts",
    "utf8"
  );
  assert.match(source, /formatLocationInputStatus/);
  assert.match(source, /LocationInputStatus/);
});
