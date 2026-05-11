-- Run once in Supabase SQL Editor if saving questionnaires returns an error (missing tables).
-- Safe to re-run: uses IF NOT EXISTS / IF NOT EXISTS patterns from schema.sql

create extension if not exists "pgcrypto";

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
