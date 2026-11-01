-- Run in Supabase SQL Editor using a project dedicated to the application or with appropriate controls.
-- All reads and writes are performed by server-side service-role credentials, not browser keys.
create table if not exists public.choppers_booking_config (
 id text primary key,
 settings jsonb not null,
 updated_at timestamptz not null default now()
);
alter table public.choppers_booking_config enable row level security;
revoke all on public.choppers_booking_config from anon, authenticated;
-- No policies for anon or authenticated. Service role bypasses RLS.
create or replace function public.choppers_touch_updated_at()
returns trigger language plpgsql as $$
begin new.updated_at=now();return new;end;$$;
drop trigger if exists choppers_booking_config_touch on public.choppers_booking_config;
create trigger choppers_booking_config_touch before update
on public.choppers_booking_config for each row execute function public.choppers_touch_updated_at();