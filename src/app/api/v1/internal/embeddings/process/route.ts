import { createServerSupabase } from "@/shared/supabase/server";
import { createEmbedding, serializeTraitsToText } from "@/shared/lib/embedding";

const MAX_RETRIES = 3;

/**
 * Worker: pending 또는 failed(retry_count < 3) 임베딩 건을 처리
 * POST /api/v1/internal/embeddings/process?batch=10
 * Cron 또는 fire-and-forget 호출용. CRON_SECRET 있으면 Authorization 검증 권장.
 */
export async function POST(request: Request) {
  const supabase = createServerSupabase();
  const { searchParams } = new URL(request.url);
  const batch = Math.min(
    Math.max(1, parseInt(searchParams.get("batch") || "10", 10)),
    20
  );

  // Optional: Cron 호출 시 검증 (로컬에서는 생략 가능)
  const authHeader = request.headers.get("Authorization");
  if (
    process.env.CRON_SECRET &&
    authHeader !== `Bearer ${process.env.CRON_SECRET}`
  ) {
    return new Response(
      JSON.stringify({ success: false, error: "Unauthorized" }),
      {
        status: 401,
        headers: { "Content-Type": "application/json" },
      }
    );
  }

  const { data: rows, error } = await supabase
    .from("embeddings")
    .select("id, entity_type, entity_id, retry_count")
    .or("status.eq.pending,and(status.eq.failed,retry_count.lt.3)")
    .order("updated_at", { ascending: true })
    .limit(batch);

  if (error || !rows?.length) {
    return new Response(
      JSON.stringify({
        success: true,
        processed: 0,
        message: "No pending items",
      }),
      { status: 200, headers: { "Content-Type": "application/json" } }
    );
  }

  let processed = 0;
  for (const row of rows) {
    try {
      let text: string;
      if (row.entity_type === "sighting") {
        const { data: sighting } = await supabase
          .from("sightings")
          .select("trait_species, trait_color, trait_size, note")
          .eq("id", row.entity_id)
          .single();
        if (!sighting) {
          await supabase
            .from("embeddings")
            .update({
              status: "failed",
              retry_count: (row.retry_count ?? 0) + 1,
            })
            .eq("id", row.id);
          continue;
        }
        text = serializeTraitsToText({
          traitSpecies: sighting.trait_species,
          traitColor: sighting.trait_color,
          traitSize: sighting.trait_size,
          note: sighting.note,
        });
      } else {
        const { data: lostPost } = await supabase
          .from("lost_posts")
          .select("trait_species, trait_color, trait_size, note")
          .eq("id", row.entity_id)
          .single();
        if (!lostPost) {
          await supabase.from("embeddings").delete().eq("id", row.id);
          continue;
        }
        text = serializeTraitsToText({
          traitSpecies: lostPost.trait_species,
          traitColor: lostPost.trait_color,
          traitSize: lostPost.trait_size,
          note: lostPost.note,
        });
      }

      const vector = await createEmbedding(text);

      const { error: updateErr } = await supabase
        .from("embeddings")
        .update({
          status: "ready",
          embedding: vector,
          retry_count: 0,
        })
        .eq("id", row.id);

      if (updateErr) throw updateErr;

      const table = row.entity_type === "sighting" ? "sightings" : "lost_posts";
      await supabase
        .from(table)
        .update({ embedding_status: "ready" })
        .eq("id", row.entity_id);

      processed++;
    } catch (err) {
      console.error(
        "[embeddings process]",
        row.entity_type,
        row.entity_id,
        err
      );
      const nextRetry = (row.retry_count ?? 0) + 1;
      await supabase
        .from("embeddings")
        .update({
          status: "failed",
          retry_count: nextRetry,
        })
        .eq("id", row.id);
    }
  }

  return new Response(JSON.stringify({ success: true, processed }), {
    status: 200,
    headers: { "Content-Type": "application/json" },
  });
}
