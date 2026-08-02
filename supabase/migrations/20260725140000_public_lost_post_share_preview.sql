-- M2-04: public share preview for searching lost posts (no precise location / note).

create or replace function public.get_public_lost_post_share_preview(p_lost_post_id uuid)
returns table (
  id uuid,
  status text,
  pet_name text,
  lost_at timestamptz,
  trait_color text,
  trait_size text,
  trait_species text,
  trait_tags text[],
  cover_photo_key text,
  approx_lat double precision,
  approx_lng double precision
)
language sql
stable
security definer
set search_path = pg_catalog, public, extensions
as $$
  select
    lp.id,
    lp.status,
    lp.pet_name,
    lp.lost_at,
    lp.trait_color,
    lp.trait_size,
    lp.trait_species,
    lp.trait_tags,
    lp.cover_photo_key,
    case
      when lp.lost_location is null then null
      else (floor(st_y(lp.lost_location::geometry) / 0.05) + 0.5) * 0.05
    end as approx_lat,
    case
      when lp.lost_location is null then null
      else (floor(st_x(lp.lost_location::geometry) / 0.05) + 0.5) * 0.05
    end as approx_lng
  from public.lost_posts lp
  where lp.id = p_lost_post_id
    and lp.status = 'searching'
    and lp.hidden_at is null
    and lp.archived_at is null;
$$;

revoke all on function public.get_public_lost_post_share_preview(uuid)
  from public, anon, authenticated, service_role;
grant execute on function public.get_public_lost_post_share_preview(uuid)
  to anon, authenticated, service_role;

comment on function public.get_public_lost_post_share_preview(uuid) is
  'Public share/OG preview. Returns approximate grid center only; never note or owner identity.';
