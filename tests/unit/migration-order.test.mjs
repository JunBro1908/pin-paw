import assert from "node:assert/strict";
import { readdir, readFile } from "node:fs/promises";
import test from "node:test";

const migrationsDirectory = new URL(
  "../../supabase/migrations/",
  import.meta.url
);

async function migrationsInOrder() {
  const names = (await readdir(migrationsDirectory))
    .filter((name) => name.endsWith(".sql"))
    .sort();

  return Promise.all(
    names.map(async (name) => ({
      name,
      sql: await readFile(new URL(name, migrationsDirectory), "utf8"),
    }))
  );
}

function events(sql, pattern, type) {
  return [...sql.matchAll(pattern)].map((match) => ({
    type,
    name: match[1].toLowerCase(),
    index: match.index,
  }));
}

test("migration version prefixes are unique", async () => {
  const names = (await readdir(migrationsDirectory))
    .filter((name) => name.endsWith(".sql"))
    .sort();

  const versions = names.map((name) => {
    const version = name.split("_")[0];
    assert.match(
      version,
      /^\d{14}$/,
      `${name} must start with a 14-digit migration version`
    );
    return version;
  });

  const duplicates = [
    ...new Set(
      versions.filter(
        (version, index) => versions.indexOf(version) !== index
      )
    ),
  ];

  assert.deepEqual(
    duplicates,
    [],
    `duplicate migration versions: ${duplicates.join(", ")} (files: ${names
      .filter((name) => duplicates.includes(name.split("_")[0]))
      .join(", ")})`
  );
});

test("every altered public table is created by an earlier migration", async () => {
  const createdTables = new Set();

  for (const migration of await migrationsInOrder()) {
    const migrationEvents = [
      ...events(
        migration.sql,
        /\bcreate\s+table\s+(?:if\s+not\s+exists\s+)?public\.([a-z_][a-z0-9_]*)/gi,
        "create"
      ),
      ...events(
        migration.sql,
        /\balter\s+table\s+(?:if\s+exists\s+)?public\.([a-z_][a-z0-9_]*)/gi,
        "alter"
      ),
    ].sort((left, right) => left.index - right.index);

    for (const event of migrationEvents) {
      if (event.type === "create") {
        createdTables.add(event.name);
        continue;
      }

      assert.ok(
        createdTables.has(event.name),
        `${migration.name} alters public.${event.name} before the migration chain creates it`
      );
    }
  }
});

test("every altered public function is created by an earlier migration", async () => {
  const createdFunctions = new Set();

  for (const migration of await migrationsInOrder()) {
    const alteredFunctions = events(
      migration.sql,
      /\balter\s+function\s+public\.([a-z_][a-z0-9_]*)\s*\(/gi,
      "alter"
    );

    for (const event of alteredFunctions) {
      assert.ok(
        createdFunctions.has(event.name),
        `${migration.name} alters public.${event.name} before the migration chain creates it`
      );
    }

    for (const event of events(
      migration.sql,
      /\bcreate\s+(?:or\s+replace\s+)?function\s+public\.([a-z_][a-z0-9_]*)\s*\(/gi,
      "create"
    )) {
      createdFunctions.add(event.name);
    }
  }
});

test("historical migrations contain SQL or comments instead of stray placeholder text", async () => {
  for (const migration of await migrationsInOrder()) {
    const executableLines = migration.sql
      .split(/\r?\n/)
      .map((line) => line.trim())
      .filter((line) => line && !line.startsWith("--"));

    assert.doesNotMatch(
      executableLines.join("\n"),
      /^(?:그|TODO|TBD)$/im,
      `${migration.name} contains a non-SQL placeholder`
    );
  }
});

test("schema snapshot does not index the removed single embedding column", async () => {
  const schema = await readFile(
    new URL("../../supabase/schema.sql", import.meta.url),
    "utf8"
  );

  assert.doesNotMatch(
    schema,
    /\busing\s+ivfflat\s*\(\s*embedding\s+vector_cosine_ops/i
  );
});
