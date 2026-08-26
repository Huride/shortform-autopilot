-- Shortform Autopilot SaaS — 초기 스키마 (Supabase SQL Editor 에서 실행)
-- auth.users 는 Supabase Auth 가 관리. 아래는 앱 데이터.

create table if not exists profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  plan text not null default 'free' check (plan in ('free','creator','autopilot')),
  credits int not null default 20,           -- 가입 보너스
  credits_reset_at timestamptz,
  created_at timestamptz not null default now()
);

create table if not exists user_keys (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  provider text not null check (provider in ('openai','elevenlabs')),
  key_encrypted text not null,               -- AES-256-GCM, 마스터키는 서버 env
  validated_at timestamptz,
  last_error text,
  unique (user_id, provider)
);

create table if not exists channels (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  config jsonb not null,                     -- channels/*.json 스키마 그대로
  archived boolean not null default false,
  created_at timestamptz not null default now()
);

create table if not exists jobs (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  channel_id uuid references channels(id) on delete set null,
  kind text not null default 'short',
  topic text not null,
  status text not null default 'pending'
    check (status in ('pending','scripted','voiced','rendered','uploaded','published','failed')),
  script jsonb,
  audio jsonb,
  video_url text,                            -- R2 presigned 대상 키
  error text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists jobs_user_status on jobs (user_id, status);
create index if not exists jobs_pending on jobs (status) where status in ('pending','scripted','voiced');

create table if not exists usage_events (
  id bigint generated always as identity primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  type text not null check (type in ('render','chat','image')),
  job_id uuid references jobs(id) on delete set null,
  credits int not null default 0,
  at timestamptz not null default now()
);

create table if not exists subscriptions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  pg text not null check (pg in ('lemonsqueezy','paddle','steppay','manual')),
  pg_customer_ref text,
  pg_subscription_ref text,
  plan text not null,
  status text not null default 'active' check (status in ('active','past_due','canceled')),
  current_period_end timestamptz,
  created_at timestamptz not null default now()
);

create table if not exists payment_events (
  id bigint generated always as identity primary key,
  pg_event_id text unique not null,          -- 웹훅 멱등성
  user_id uuid references auth.users(id) on delete set null,
  type text not null,
  payload jsonb not null,
  at timestamptz not null default now()
);

-- RLS: 본인 행만 접근. 워커는 service_role 키로 우회.
alter table profiles enable row level security;
alter table user_keys enable row level security;
alter table channels enable row level security;
alter table jobs enable row level security;
alter table usage_events enable row level security;
alter table subscriptions enable row level security;

create policy "own profile" on profiles for all using (auth.uid() = id);
create policy "own keys" on user_keys for all using (auth.uid() = user_id);
create policy "own channels" on channels for all using (auth.uid() = user_id);
create policy "own jobs" on jobs for all using (auth.uid() = user_id);
create policy "own usage" on usage_events for select using (auth.uid() = user_id);
create policy "own subs" on subscriptions for select using (auth.uid() = user_id);

-- 가입 시 프로필 자동 생성
create or replace function handle_new_user() returns trigger as $$
begin
  insert into profiles (id) values (new.id);
  return new;
end; $$ language plpgsql security definer;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created after insert on auth.users
  for each row execute function handle_new_user();
