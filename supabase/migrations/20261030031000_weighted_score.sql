-- Reference values are adjustable before the event after a calibration run.
-- They determine the strength of the latency and RAM components; weights
-- alone cannot combine metrics expressed in different units fairly.
alter table public.settings
  add column if not exists latency_ref_ms numeric not null default 100,
  add column if not exists ram_ref_mb numeric not null default 256;

alter table public.settings
  add constraint scoring_settings_valid check (
    weight_accuracy >= 0 and weight_latency >= 0 and weight_ram >= 0
    and weight_accuracy + weight_latency + weight_ram > 0
    and latency_ref_ms > 0 and ram_ref_mb > 0
  );

drop function if exists public.get_leaderboard();
create function public.get_leaderboard()
returns table (
  team_id uuid, team_name text, score numeric, accuracy numeric,
  latency_ms numeric, peak_ram_mb numeric, model_size_mb numeric,
  completed_at timestamptz
)
language sql stable security definer set search_path = public as $$
  with cfg as (select * from public.settings where id = 1),
  scored as (
    select sub.team_id, t.name as team_name,
      100 * (
        cfg.weight_accuracy * sub.accuracy
        + cfg.weight_latency * cfg.latency_ref_ms / (cfg.latency_ref_ms + sub.latency_ms)
        + cfg.weight_ram * cfg.ram_ref_mb / (cfg.ram_ref_mb + sub.peak_ram_mb)
      ) / (cfg.weight_accuracy + cfg.weight_latency + cfg.weight_ram) as score,
      sub.accuracy, sub.latency_ms, sub.peak_ram_mb,
      sub.model_size_mb, sub.completed_at
    from public.submissions sub
    join public.teams t on t.id = sub.team_id
    cross join cfg
    where sub.status = 'completed'
      and sub.accuracy between 0 and 1
      and sub.latency_ms > 0 and sub.peak_ram_mb > 0
      and (not cfg.leaderboard_frozen or sub.completed_at <= cfg.frozen_at)
  ),
  best as (
    select distinct on (scored.team_id) scored.*
    from scored
    order by scored.team_id, scored.score desc, scored.accuracy desc,
      scored.latency_ms asc, scored.peak_ram_mb asc
  )
  select best.* from best, cfg
  where cfg.leaderboard_visible or public.has_role(auth.uid(), 'admin')
  order by best.score desc, best.accuracy desc, best.latency_ms asc,
    best.peak_ram_mb asc, best.team_id
$$;

revoke execute on function public.get_leaderboard() from public;
grant execute on function public.get_leaderboard() to anon, authenticated;
