import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

test("my profile uses PawAvatar instead of a fixed green paw circle", async () => {
  const page = await readFile("src/app/(tabs)/my/page.tsx", "utf8");
  const avatar = await readFile("src/shared/ui/PawAvatar.tsx", "utf8");
  const colorLib = await readFile("src/shared/lib/paw-avatar-color.ts", "utf8");

  assert.match(page, /import \{ PawAvatar \} from "@\/shared\/ui\/PawAvatar"/);
  assert.match(page, /<PawAvatar userId=\{user\?\.id\}/);
  assert.match(page, /paw_color_key/);
  assert.doesNotMatch(
    page,
    /bg-primary-soft text-action-primary flex h-14 w-14[\s\S]*name="paw"/
  );

  assert.match(avatar, /resolvePawAvatarTone/);
  assert.match(avatar, /data-paw-color=\{tone\.key\}/);
  assert.match(avatar, /name="paw"/);

  assert.match(colorLib, /PAW_AVATAR_COLOR_KEYS/);
  assert.match(colorLib, /"pine"/);
  assert.match(colorLib, /"honey"/);
  assert.match(colorLib, /"coral"/);
  assert.doesNotMatch(colorLib, /key: "(purple|violet|indigo)"/);
});

test("oauth callback persists paw_color_key without blocking login on failure", async () => {
  const callback = await readFile("src/app/auth/callback/route.ts", "utf8");
  assert.match(callback, /resolvePawColorKey/);
  assert.match(callback, /paw_color_key/);
  assert.match(callback, /updateUser/);
  assert.match(callback, /metadataError/);
  assert.match(callback, /NextResponse\.redirect\(redirectUrl\)/);
});

test("migration stores paw_color_key and bootstraps on auth signup", async () => {
  const migration = await readFile(
    "supabase/migrations/20260803100000_user_paw_avatar_color.sql",
    "utf8"
  );
  assert.match(migration, /add column if not exists paw_color_key/);
  assert.match(migration, /paw_color_key_for_user/);
  assert.match(migration, /handle_new_user_paw_profile/);
  assert.match(migration, /on_auth_user_created_paw_profile/);
  assert.match(migration, /after insert on auth\.users/);
  assert.match(migration, /where paw_color_key is null/);
  for (const key of [
    "pine",
    "honey",
    "sky",
    "coral",
    "sage",
    "teal",
    "rose",
    "slate",
  ]) {
    assert.match(migration, new RegExp(`'${key}'`));
  }
});
