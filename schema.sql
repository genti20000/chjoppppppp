-- Run in Supabase SQL Editor using a project dedicated to the application or with appropriate controls.
-- All reads and writes are performed by server-side service-role credentials, not browser keys.
create table if not exists public.choppers_booking_config (
 id text primary key,
 settings jsonb not null,
 updated_at timestamptz not null default now()
);
alter table public.choppers_booking_config enable row level security;
revoke all on public.choppers_booking_config from public, anon, authenticated;
-- Only trusted server-side access can read or update this owner preference table.
grant usage on schema public to service_role;
grant select, insert, update on public.choppers_booking_config to service_role;
-- No policies for anon or authenticated. Service role bypasses RLS.
create or replace function public.choppers_touch_updated_at()
returns trigger language plpgsql as $$
begin new.updated_at=now();return new;end;$$;
drop trigger if exists choppers_booking_config_touch on public.choppers_booking_config;
create trigger choppers_booking_config_touch before update
on public.choppers_booking_config for each row execute function public.choppers_touch_updated_at();
-- Ensure newly created table is discoverable through Supabase Data API.
notify pgrst, 'reload schema';
