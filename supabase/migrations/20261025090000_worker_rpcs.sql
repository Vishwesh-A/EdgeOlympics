-- Migration: Worker RPCs and Columns for Prelim Checker and Edge Pi Runner
-- Columns for prelim worker isolation and requeue counts
alter table public.submissions add column if not exists requeue_count int not null default 0;
alter table public.submissions add column if not exists prelim_claimed_at timestamptz;
alter table public.submissions add column if not exists prelim_claimed_by text;

-- 1. PRELIM CLAIM
create or replace function public.claim_prelim_job(_worker_id text, _timeout_seconds int default 120)
returns table (
  id uuid,
  team_id uuid,
  file_path text,
  original_filename text,
  model_size_mb numeric
)
language plpgsql security definer set search_path = public as $$
declare
  _sub record;
begin
  select s.id, s.team_id, s.file_path, s.original_filename, s.model_size_mb
  into _sub
  from public.submissions s
  where s.status = 'pending_prelim'
    and (s.prelim_claimed_at is null or s.prelim_claimed_at < now() - (_timeout_seconds || ' seconds')::interval)
  order by s.created_at asc
  limit 1
  for update skip locked;

  if _sub.id is not null then
    update public.submissions
    set prelim_claimed_at = now(),
        prelim_claimed_by = _worker_id
    where public.submissions.id = _sub.id;

    return query select _sub.id, _sub.team_id, _sub.file_path, _sub.original_filename, _sub.model_size_mb;
  end if;
end;
$$;

-- 2. PRELIM PASS
create or replace function public.prelim_pass(_id uuid, _worker_id text)
returns boolean
language plpgsql security definer set search_path = public as $$
declare
  _updated int;
begin
  update public.submissions
  set status = 'queued_for_edge',
      prelim_claimed_at = null,
      prelim_claimed_by = null,
      error_log = null
  where id = _id
    and status = 'pending_prelim'
    and prelim_claimed_by = _worker_id;

  get diagnostics _updated = row_count;
  return _updated > 0;
end;
$$;

-- 3. PRELIM FAIL
create or replace function public.prelim_fail(_id uuid, _worker_id text, _error_log text)
returns boolean
language plpgsql security definer set search_path = public as $$
declare
  _updated int;
begin
  update public.submissions
  set status = 'failed_prelim',
      prelim_claimed_at = null,
      prelim_claimed_by = null,
      error_log = _error_log,
      completed_at = now()
  where id = _id
    and status = 'pending_prelim'
    and prelim_claimed_by = _worker_id;

  get diagnostics _updated = row_count;
  return _updated > 0;
end;
$$;

-- 4. EDGE PI CLAIM JOB
create or replace function public.claim_job(_pi_id text)
returns table (
  id uuid,
  team_id uuid,
  file_path text,
  original_filename text,
  model_size_mb numeric
)
language plpgsql security definer set search_path = public as $$
declare
  _sub record;
begin
  select s.id, s.team_id, s.file_path, s.original_filename, s.model_size_mb
  into _sub
  from public.submissions s
  where s.status = 'queued_for_edge'
  order by s.created_at asc
  limit 1
  for update skip locked;

  if _sub.id is not null then
    update public.submissions
    set status = 'running',
        pi_id = _pi_id,
        claimed_at = now(),
        last_heartbeat = now()
    where public.submissions.id = _sub.id;

    return query select _sub.id, _sub.team_id, _sub.file_path, _sub.original_filename, _sub.model_size_mb;
  end if;
end;
$$;

-- 5. HEARTBEAT
create or replace function public.heartbeat(_id uuid, _pi_id text)
returns boolean
language plpgsql security definer set search_path = public as $$
declare
  _updated int;
begin
  update public.submissions
  set last_heartbeat = now()
  where id = _id
    and status = 'running'
    and pi_id = _pi_id;

  get diagnostics _updated = row_count;
  return _updated > 0;
end;
$$;

-- 6. COMPLETE JOB
create or replace function public.complete_job(
  _id uuid,
  _pi_id text,
  _accuracy numeric,
  _latency_ms numeric,
  _peak_ram_mb numeric,
  _model_size_mb numeric,
  _notes text default null
)
returns boolean
language plpgsql security definer set search_path = public as $$
declare
  _updated int;
begin
  update public.submissions
  set status = 'completed',
      accuracy = _accuracy,
      latency_ms = _latency_ms,
      peak_ram_mb = _peak_ram_mb,
      model_size_mb = coalesce(_model_size_mb, public.submissions.model_size_mb),
      error_log = _notes,
      completed_at = now()
  where id = _id
    and status = 'running'
    and pi_id = _pi_id;

  get diagnostics _updated = row_count;
  if _updated = 0 then
    raise exception 'JOB_NOT_RUNNING_OR_PI_MISMATCH';
  end if;
  return true;
end;
$$;

-- 7. FAIL JOB
create or replace function public.fail_job(
  _id uuid,
  _pi_id text,
  _fail_status text,
  _error_log text
)
returns boolean
language plpgsql security definer set search_path = public as $$
declare
  _updated int;
begin
  if _fail_status not in ('failed_runtime', 'failed_timeout', 'failed_oom', 'disqualified') then
    raise exception 'INVALID_FAIL_STATUS';
  end if;

  update public.submissions
  set status = _fail_status,
      error_log = _error_log,
      completed_at = now()
  where id = _id
    and status = 'running'
    and pi_id = _pi_id;

  get diagnostics _updated = row_count;
  if _updated = 0 then
    raise exception 'JOB_NOT_RUNNING_OR_PI_MISMATCH';
  end if;
  return true;
end;
$$;

-- 8. REQUEUE STALE
create or replace function public.requeue_stale(_stale_seconds int default 60)
returns int
language plpgsql security definer set search_path = public as $$
declare
  _r record;
  _count int := 0;
begin
  for _r in
    select id, requeue_count
    from public.submissions
    where status = 'running'
      and last_heartbeat < now() - (_stale_seconds || ' seconds')::interval
    for update skip locked
  loop
    if _r.requeue_count < 2 then
      update public.submissions
      set status = 'queued_for_edge',
          pi_id = null,
          claimed_at = null,
          last_heartbeat = null,
          requeue_count = _r.requeue_count + 1
      where id = _r.id;
    else
      update public.submissions
      set status = 'failed_runtime',
          error_log = 'Stale job timed out after 2 requeues',
          completed_at = now()
      where id = _r.id;
    end if;
    _count := _count + 1;
  end loop;

  return _count;
end;
$$;

-- Permissions: Restrict RPCs to service_role only
revoke execute on function public.claim_prelim_job(text, int) from anon, authenticated, public;
revoke execute on function public.prelim_pass(uuid, text) from anon, authenticated, public;
revoke execute on function public.prelim_fail(uuid, text, text) from anon, authenticated, public;
revoke execute on function public.claim_job(text) from anon, authenticated, public;
revoke execute on function public.heartbeat(uuid, text) from anon, authenticated, public;
revoke execute on function public.complete_job(uuid, text, numeric, numeric, numeric, numeric, text) from anon, authenticated, public;
revoke execute on function public.fail_job(uuid, text, text, text) from anon, authenticated, public;
revoke execute on function public.requeue_stale(int) from anon, authenticated, public;

grant execute on function public.claim_prelim_job(text, int) to service_role;
grant execute on function public.prelim_pass(uuid, text) to service_role;
grant execute on function public.prelim_fail(uuid, text, text) to service_role;
grant execute on function public.claim_job(text) to service_role;
grant execute on function public.heartbeat(uuid, text) to service_role;
grant execute on function public.complete_job(uuid, text, numeric, numeric, numeric, numeric, text) to service_role;
grant execute on function public.fail_job(uuid, text, text, text) to service_role;
grant execute on function public.requeue_stale(int) to service_role;
