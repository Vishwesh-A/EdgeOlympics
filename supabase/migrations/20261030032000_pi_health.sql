-- Idle Pi workers report availability even before their first model run.
create table public.pi_workers (
  pi_id text primary key check (pi_id in ('pi-01', 'pi-02', 'pi-03', 'pi-04')),
  last_seen timestamptz not null default now()
);

grant select on public.pi_workers to authenticated;
grant all on public.pi_workers to service_role;
alter table public.pi_workers enable row level security;
create policy "organizers read pi health" on public.pi_workers for select to authenticated
  using (public.has_role(auth.uid(), 'admin'));

create function public.worker_seen(_pi_id text)
returns boolean language plpgsql security definer set search_path = public as $$
begin
  insert into public.pi_workers (pi_id, last_seen) values (_pi_id, now())
  on conflict (pi_id) do update set last_seen = excluded.last_seen;
  return true;
end $$;

revoke execute on function public.worker_seen(text) from anon, authenticated, public;
grant execute on function public.worker_seen(text) to service_role;
