create extension if not exists "pgcrypto";

create table if not exists companies (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  profile jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create table if not exists leads (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references companies(id) on delete cascade,
  name text,
  phone text,
  source text,
  status text not null default 'new' check (status in ('new','contacted','interested','not_interested')),
  created_at timestamptz not null default now()
);

create table if not exists calls (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references companies(id) on delete cascade,
  lead_id uuid references leads(id) on delete set null,
  session_id text,
  duration integer not null default 0,
  outcome text,
  transcript jsonb not null default '[]'::jsonb,
  summary text,
  created_at timestamptz not null default now()
);

alter table calls add column if not exists recording_user_path text;
alter table calls add column if not exists recording_agent_path text;
alter table calls add column if not exists lead_phone text;
alter table calls add column if not exists lead_name text;

create table if not exists agent_configs (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references companies(id) on delete cascade,
  agent_name text,
  tone text,
  language text,
  intro_template text,
  settings jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create table if not exists messages (
  id bigserial primary key,
  company_id uuid not null references companies(id) on delete cascade,
  lead_id uuid references leads(id) on delete set null,
  session_id text not null,
  role text not null,
  content text not null,
  created_at timestamptz not null default now()
);

create table if not exists users (
  id uuid primary key default gen_random_uuid(),
  email text not null unique,
  password_hash text not null,
  company_id uuid not null references companies(id) on delete cascade,
  role text not null default 'agent' check (role in ('admin','agent')),
  platform_role text check (platform_role in ('master_admin')),
  is_active boolean not null default true,
  created_at timestamptz not null default now()
);

alter table users add column if not exists platform_role text;
alter table users add column if not exists is_active boolean not null default true;

do $$
begin
  if exists (
    select 1
    from pg_constraint
    where conname = 'users_platform_role_check'
  ) then
    alter table users drop constraint users_platform_role_check;
  end if;
exception
  when undefined_table then null;
end $$;

alter table users
  add constraint users_platform_role_check
  check (platform_role is null or platform_role in ('master_admin'));

update users
set platform_role = 'master_admin'
where email = 'mteja0852@gmail.com';

create table if not exists projects (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references companies(id) on delete cascade,
  name text not null,
  type text,
  location text,
  description text,
  offer text,
  url text,
  keywords text[] not null default '{}',
  amenities text[] not null default '{}',
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists idx_users_company_id on users(company_id);
create index if not exists idx_leads_company_id on leads(company_id);
-- calls by company_id: left-prefix of idx_calls_company_created (company_id, created_at)
create index if not exists idx_calls_company_created on calls(company_id, created_at desc);
create index if not exists idx_messages_company_session_created on messages(company_id, session_id, created_at desc);
create index if not exists idx_projects_company_created on projects(company_id, created_at desc);

-- Questionnaires (workspace-scoped scripts / forms for agents)
create table if not exists questionnaires (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references companies(id) on delete cascade,
  name text not null,
  description text not null default '',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists questionnaire_questions (
  id uuid primary key default gen_random_uuid(),
  questionnaire_id uuid not null references questionnaires(id) on delete cascade,
  sort_order int not null default 0,
  question_type text not null default 'text' check (question_type in ('text', 'single_choice', 'multi_choice')),
  prompt text not null,
  options jsonb not null default '[]'::jsonb,
  is_required boolean not null default true,
  created_at timestamptz not null default now()
);

create index if not exists idx_questionnaires_company_updated on questionnaires(company_id, updated_at desc);
create index if not exists idx_questionnaire_questions_qid_order on questionnaire_questions(questionnaire_id, sort_order);
