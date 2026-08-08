-- One-time test data reset for the movement-v3 rollout.
-- Run this explicitly before `supabase db push`; it is intentionally not a migration.
-- Auth identities, public user profiles, organizations, and operational settings remain intact.
-- Storage objects must be removed through the Storage API so physical objects and metadata stay consistent.

truncate table
  public.recommendation_cache,
  public.embeddings,
  public.user_sighting_views,
  public.lost_post_sighting_claims,
  public.lost_post_status_history,
  public.notifications,
  public.shelter_animal_imports,
  public.sighting_mutation_audit,
  public.storage_cleanup_queue,
  public.content_reports,
  public.funnel_events,
  public.upload_intents,
  public.idempotency_keys,
  public.sightings,
  public.lost_posts
restart identity;
