import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const migrationPath =
  "supabase/migrations/20260726050000_shelter_animal_imports.sql";
const routePath = "src/app/api/v1/internal/shelter-animals/import/route.ts";
const vercelPath = "vercel.json";

async function source(path) {
  return readFile(new URL(`../../${path}`, import.meta.url), "utf8");
}

test("shelter import migration locks the mapping table and RPC to service_role", async () => {
  const sql = await source(migrationPath);

  assert.match(
    sql,
    /create table if not exists public\.shelter_animal_imports/i
  );
  assert.match(
    sql,
    /revoke all on table public\.shelter_animal_imports[\s\S]*from public, anon, authenticated/i
  );
  assert.match(
    sql,
    /create or replace function public\.import_shelter_animal_sighting/i
  );
  assert.match(
    sql,
    /revoke all on function public\.import_shelter_animal_sighting[\s\S]*from public, anon, authenticated/i
  );
  assert.match(
    sql,
    /grant execute on function public\.import_shelter_animal_sighting[\s\S]*to service_role/i
  );
  assert.match(sql, /desertion_no text primary key/i);
});

test("weekly cron and cron-auth route are wired", async () => {
  const route = await source(routePath);
  const vercel = JSON.parse(await source(vercelPath));

  assert.match(route, /createCronAuthorizedValue/);
  assert.match(route, /runShelterAnimalImport/);
  assert.match(route, /DATA_GO_KR_SERVICE_KEY/);
  assert.match(route, /triggerEmbeddingsProcess/);

  assert.ok(
    vercel.crons.some(
      (cron) =>
        cron.path === "/api/v1/internal/shelter-animals/import" &&
        cron.schedule === "1 2 * * *"
    )
  );
  assert.deepEqual(vercel.regions, ["icn1"]);
});
