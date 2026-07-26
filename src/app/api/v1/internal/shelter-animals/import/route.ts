import { extractColorTokens } from "@/shared/constants/traitColors";
import { createCronAuthorizedValue } from "@/shared/lib/cron-auth";
import { triggerEmbeddingsProcess } from "@/shared/lib/embeddings-worker";
import { getNaverSearchCredentials } from "@/shared/lib/naver-credentials";
import {
  isShelterProcessActive,
  runShelterAnimalImport,
} from "@/shared/lib/shelter-animal-import";
import { createRequestLogger } from "@/shared/lib/structured-log";
import { createServiceRoleSupabase } from "@/shared/supabase/server";

export const maxDuration = 300;

function createSightingPhotoKey(ext: "jpg" | "png"): string {
  const stamp = new Date().toISOString().slice(0, 10).replace(/-/g, "");
  return `sighting_photo/${stamp}/${crypto.randomUUID()}.${ext}`;
}

export async function GET(request: Request) {
  const logger = createRequestLogger(
    request,
    "/api/v1/internal/shelter-animals/import"
  );
  const authorization = createCronAuthorizedValue(
    process.env.CRON_SECRET,
    request.headers.get("Authorization"),
    createServiceRoleSupabase
  );
  if (!authorization.ok) {
    return Response.json(
      { success: false, error: authorization.error },
      { status: authorization.status }
    );
  }

  const supabase = authorization.value;
  const naverSearch = getNaverSearchCredentials();
  const result = await runShelterAnimalImport({
    serviceKey: process.env.DATA_GO_KR_SERVICE_KEY,
    naverClientId: naverSearch.clientId,
    naverClientSecret: naverSearch.clientSecret,
    listExistingDesertionNos: async (desertionNos) => {
      if (desertionNos.length === 0) return { ok: true, ids: new Set() };
      const { data, error } = await supabase
        .from("shelter_animal_imports")
        .select("desertion_no")
        .in("desertion_no", desertionNos);
      if (error) {
        logger.warn("shelter_import.list_existing_failed", { error });
        return { ok: false };
      }
      return {
        ok: true,
        ids: new Set(
          (data ?? []).map((row) => String(row.desertion_no)).filter(Boolean)
        ),
      };
    },
    uploadSightingPhoto: async ({ objectKey, bytes, contentType }) => {
      const { error } = await supabase.storage
        .from("sightings")
        .upload(objectKey, bytes, {
          contentType,
          upsert: false,
        });
      return { ok: error == null };
    },
    importSighting: async (input) => {
      const { data, error } = await supabase.rpc(
        "import_shelter_animal_sighting",
        {
          p_desertion_no: input.desertionNo,
          p_photo_keys: input.photoKeys,
          p_occurred_at: input.occurredAt,
          p_lat: input.lat,
          p_lng: input.lng,
          p_trait_color: input.traitColor,
          p_trait_size: input.traitSize,
          p_trait_species: input.traitSpecies,
          p_color_tokens: input.colorTokens,
          p_note: input.note,
          p_process_state: input.processState,
          p_location_source: input.locationSource,
          p_geocode_query: input.geocodeQuery,
          p_photo_source_url: input.photoSourceUrl,
        }
      );
      if (error || !data) {
        logger.warn("shelter_import.insert_failed", { error });
        return { ok: false };
      }
      const row = Array.isArray(data) ? data[0] : data;
      return { ok: true, sightingId: String(row.id) };
    },
    syncExisting: async ({ desertionNo, processState }) => {
      const { data: importRow, error: readError } = await supabase
        .from("shelter_animal_imports")
        .select("sighting_id")
        .eq("desertion_no", desertionNo)
        .maybeSingle();
      if (readError || !importRow?.sighting_id) {
        return { ok: false };
      }

      const { error: updateImportError } = await supabase
        .from("shelter_animal_imports")
        .update({
          process_state: processState,
          last_seen_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        })
        .eq("desertion_no", desertionNo);
      if (updateImportError) return { ok: false };

      const active = isShelterProcessActive(processState);
      if (active) {
        const { error } = await supabase
          .from("sightings")
          .update({ archived_at: null })
          .eq("id", importRow.sighting_id)
          .not("archived_at", "is", null);
        return { ok: error == null };
      }
      const { error } = await supabase
        .from("sightings")
        .update({ archived_at: new Date().toISOString() })
        .eq("id", importRow.sighting_id)
        .is("archived_at", null);
      return { ok: error == null };
    },
    createObjectKey: createSightingPhotoKey,
    extractColorTokens,
  });

  if (!result.ok) {
    logger.warn("shelter_import.failed", {
      reason: result.reason,
      summary: result.summary,
    });
    return Response.json(
      {
        success: false,
        error:
          result.reason === "not_configured"
            ? "DATA_GO_KR_SERVICE_KEY or Naver Search credentials missing"
            : "Shelter animal fetch failed",
        data: result.summary,
      },
      { status: result.reason === "not_configured" ? 503 : 502 }
    );
  }

  if (result.summary.created > 0) {
    triggerEmbeddingsProcess(logger);
  }

  logger.info("shelter_import.completed", { summary: result.summary });
  return Response.json({ success: true, data: result.summary });
}

export const POST = GET;
