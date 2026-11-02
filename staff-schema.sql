-- Choppers private staff app. Run in a dedicated Choppers Supabase project.
-- DO NOT apply to LKC, AMICA, or a shared database without owner approval.
create extension if not exists pgcrypto;

create table if not exists public.choppers_staff_users (
  id uuid primary key default gen_random_uuid(),
  barber_id text not null unique check (barber_id in ('liri','marouan','nick','victor')),
  display_name text not null check (length(display_name) between 2 and 60),
  username text not null unique check (username ~ '^[a-z][a-z0-9._-]{2,31}$'),
  password_hash text not null,
  phone_e164 text not null check (phone_e164 ~ '^\+[1-9][0-9]{8,14}$'),
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
alter table public.choppers_staff_users enable row level security;
revoke all on public.choppers_staff_users from public, anon, authenticated;
grant select, insert, update, delete on public.choppers_staff_users to service_role;

-- One atomic call allowance per staff member / appointment / 60 minute time bucket.
-- Do not store customer numbers or emails in call logs.
create table if not exists public.choppers_staff_call_limits (
  staff_id uuid not null references public.choppers_staff_users(id) on delete cascade,
  booking_id text not null,
  hour_bucket timestamptz not null,
  calls integer not null default 1 check (calls between 1 and 3),
  primary key (staff_id, booking_id, hour_bucket)
);
alter table public.choppers_staff_call_limits enable row level security;
revoke all on public.choppers_staff_call_limits from public, anon, authenticated;
grant select, insert, update, delete on public.choppers_staff_call_limits to service_role;

create table if not exists public.choppers_staff_call_audit (
  id uuid primary key default gen_random_uuid(),
  staff_id uuid not null references public.choppers_staff_users(id) on delete cascade,
  booking_id text not null,
  call_sid text,
  status text not null check (status in ('initiated','failed')),
  created_at timestamptz not null default now()
);
create index if not exists choppers_call_audit_staff_time on public.choppers_staff_call_audit(staff_id, created_at desc);
alter table public.choppers_staff_call_audit enable row level security;
revoke all on public.choppers_staff_call_audit from public, anon, authenticated;
grant select, insert, update, delete on public.choppers_staff_call_audit to service_role;

-- Atomic cap, invoked only via trusted server's service-role key.
create or replace function public.choppers_staff_reserve_call(p_staff_id uuid,p_booking_id text)
returns boolean
language plpgsql
security invoker
set search_path = public
as $$
declare v_count integer;
begin
  if p_booking_id is null or length(p_booking_id)>128 or p_staff_id is null then return false; end if;
  insert into public.choppers_staff_call_limits(staff_id,booking_id,hour_bucket,calls)
  values(p_staff_id,p_booking_id,date_trunc('hour',now()),1)
  on conflict (staff_id,booking_id,hour_bucket)
  do update set calls = public.choppers_staff_call_limits.calls+1
  where public.choppers_staff_call_limits.calls < 3
  returning calls into v_count;
  return v_count is not null;
end;$$;
revoke all on function public.choppers_staff_reserve_call(uuid,text) from public, anon, authenticated;
grant execute on function public.choppers_staff_reserve_call(uuid,text) to service_role;

-- Owner should periodically delete historical call metadata after retention review.
-- This SQL does not expose a public staff/customer data API.
