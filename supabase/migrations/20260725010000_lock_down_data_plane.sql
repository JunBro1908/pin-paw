-- Browser roles use authenticated API routes for privileged data-plane writes.
-- Keep direct PostgREST access limited to the owner-scoped operations that the
-- current application actually performs.

alter table public.users enable row level security;
alter table public.embeddings enable row level security;
alter table public.idempotency_keys enable row level security;

revoke all on table public.users,
  public.embeddings,
  public.idempotency_keys,
  public.recommendation_cache
from anon, authenticated;

drop policy if exists "sightings_public_insert" on public.sightings;

revoke all on table public.sightings from anon;
revoke insert, update on table public.sightings from anon, authenticated;
grant select, delete on table public.sightings to authenticated;

revoke all on table public.lost_posts from anon;
revoke all on table public.lost_posts from authenticated;
grant select, insert, update, delete on table public.lost_posts
  to authenticated;

revoke all on table public.user_sighting_views from anon;
revoke all on table public.user_sighting_views from authenticated;
grant select, insert, update, delete on table public.user_sighting_views
  to authenticated;

revoke all on table public.lost_post_sighting_claims from anon;
revoke all on table public.lost_post_sighting_claims from authenticated;
grant select, insert, delete on table public.lost_post_sighting_claims
  to authenticated;

revoke all on function public.set_updated_at()
  from public, anon, authenticated, service_role;
alter function public.set_updated_at()
  set search_path = pg_catalog, public, extensions;

revoke all on function public.archive_old_records_28d()
  from public, anon, authenticated, service_role;
alter function public.archive_old_records_28d()
  set search_path = pg_catalog, public, extensions;
grant execute on function public.archive_old_records_28d()
  to service_role;

revoke all on function public.get_sighting_clusters(
  double precision,
  double precision,
  double precision,
  double precision,
  integer,
  boolean
) from public, anon, authenticated, service_role;
alter function public.get_sighting_clusters(
  double precision,
  double precision,
  double precision,
  double precision,
  integer,
  boolean
) set search_path = pg_catalog, public, extensions;
grant execute on function public.get_sighting_clusters(
  double precision,
  double precision,
  double precision,
  double precision,
  integer,
  boolean
) to service_role;

revoke all on function public.get_recommendations_for_lost_post(
  uuid,
  double precision,
  double precision,
  integer
) from public, anon, authenticated, service_role;
alter function public.get_recommendations_for_lost_post(
  uuid,
  double precision,
  double precision,
  integer
) set search_path = pg_catalog, public, extensions;
grant execute on function public.get_recommendations_for_lost_post(
  uuid,
  double precision,
  double precision,
  integer
) to service_role;

revoke all on function public.get_sighting_detail(uuid)
  from public, anon, authenticated, service_role;
alter function public.get_sighting_detail(uuid)
  set search_path = pg_catalog, public, extensions;
grant execute on function public.get_sighting_detail(uuid)
  to service_role;

revoke all on function public.get_my_sighting_center(uuid)
  from public, anon, authenticated, service_role;
alter function public.get_my_sighting_center(uuid)
  set search_path = pg_catalog, public, extensions;
grant execute on function public.get_my_sighting_center(uuid)
  to authenticated;

revoke all on function public.get_my_sightings_list(integer, integer)
  from public, anon, authenticated, service_role;
alter function public.get_my_sightings_list(integer, integer)
  set search_path = pg_catalog, public, extensions;
grant execute on function public.get_my_sightings_list(integer, integer)
  to authenticated;

revoke all on function public.get_my_lost_posts_with_location(integer)
  from public, anon, authenticated, service_role;
alter function public.get_my_lost_posts_with_location(integer)
  set search_path = pg_catalog, public, extensions;
grant execute on function public.get_my_lost_posts_with_location(integer)
  to authenticated;

revoke all on function public.get_my_lost_post_paths()
  from public, anon, authenticated, service_role;
alter function public.get_my_lost_post_paths()
  set search_path = pg_catalog, public, extensions;
grant execute on function public.get_my_lost_post_paths()
  to authenticated;
