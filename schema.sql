-- EVU Recruitment: схема БД. Выполнить целиком в Supabase → SQL Editor.
create extension if not exists pgcrypto;

-- Публичные (несекретные) настройки рекрутинга. Единственная строка id = 1.
create table if not exists public.settings (
  id int primary key default 1 check (id = 1),
  recruitment_open boolean not null default false,
  closed_message text not null default 'Набор в EVU временно закрыт. Подача заявок недоступна.',
  success_message text not null default 'Ваша заявка принята и передана на рассмотрение. Ожидайте решения администрации.',
  rules_text text not null default E'Требования к кандидатам определяются руководством EVU.\nЗаявка заполняется полностью и честно.\nДля подачи нужен аккаунт Discord.\nПовторная подача возможна через 14 дней после отправки.',
  min_age int not null default 0 check (min_age between 0 and 99),
  notify_new boolean not null default true,
  notify_accepted boolean not null default true,
  notify_rejected boolean not null default true,
  notify_toggle boolean not null default true,
  notify_error boolean not null default true,
  updated_at timestamptz not null default now(),
  updated_by text
);
insert into public.settings (id) values (1) on conflict do nothing;

create table if not exists public.applications (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  discord_id text not null,
  discord_name text not null,
  roblox text not null,
  answers jsonb not null,
  status text not null default 'new' check (status in ('new','review','accepted','rejected','info')),
  notes jsonb not null default '[]'::jsonb,
  role_status text not null default 'none' check (role_status in ('none','granted','failed','pending')),
  role_error text not null default '',
  reviewed_by text,
  reviewed_at timestamptz,
  source text not null default 'web'
);
create index if not exists applications_created_idx on public.applications (created_at desc);
create index if not exists applications_discord_idx on public.applications (discord_id);

create table if not exists public.admins (
  discord_id text primary key,
  name text,
  role text not null check (role in ('viewer','reviewer','owner')),
  created_at timestamptz not null default now()
);

create table if not exists public.admin_log (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  admin_discord_id text,
  admin_name text,
  application_id uuid,
  action text not null,
  details jsonb not null default '{}'::jsonb
);
create index if not exists admin_log_created_idx on public.admin_log (created_at desc);
create index if not exists admin_log_app_idx on public.admin_log (application_id);

-- Состояние 14-дневного ограничения. Хранится на сервере по Discord ID
-- и НЕ зависит от удаления заявки администратором.
create table if not exists public.submission_locks (
  discord_id text primary key,
  locked_until timestamptz not null,
  last_application uuid
);

-- Атомарная попытка занять слот подачи: возвращает locked_until или NULL, если ещё действует блокировка.
create or replace function public.try_lock(p_discord text, p_days int)
returns timestamptz language plpgsql security definer set search_path = public as $$
declare r timestamptz;
begin
  insert into submission_locks (discord_id, locked_until)
  values (p_discord, now() + make_interval(days => p_days))
  on conflict (discord_id) do update set locked_until = excluded.locked_until
  where submission_locks.locked_until <= now()
  returning locked_until into r;
  return r;
end $$;

create or replace function public.release_lock(p_discord text)
returns void language sql security definer set search_path = public as
$$ delete from submission_locks where discord_id = p_discord $$;

-- ===== RLS: клиент (anon/authenticated) не имеет доступа ни к чему, кроме чтения настроек =====
alter table public.settings enable row level security;
alter table public.applications enable row level security;
alter table public.admins enable row level security;
alter table public.admin_log enable row level security;
alter table public.submission_locks enable row level security;

revoke all on public.applications, public.admins, public.admin_log, public.submission_locks from anon, authenticated;
revoke all on public.settings from anon, authenticated;
grant select on public.settings to anon, authenticated;
create policy "settings are public read" on public.settings for select to anon, authenticated using (true);

revoke execute on function public.try_lock(text, int) from public, anon, authenticated;
revoke execute on function public.release_lock(text) from public, anon, authenticated;
-- Все записи выполняют Edge Functions с service_role (он обходит RLS) после проверки JWT и прав.

-- ===== Первый владелец (подставьте СВОЙ Discord ID) =====
-- insert into public.admins (discord_id, name, role) values ('123456789012345678', 'Owner', 'owner');
