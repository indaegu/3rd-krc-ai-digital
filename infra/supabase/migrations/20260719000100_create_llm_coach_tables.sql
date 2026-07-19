create extension if not exists pgcrypto with schema extensions;

create table public.coach_cache (
  id uuid primary key default gen_random_uuid(),
  cache_key text not null unique,
  fact_schema_version text not null,
  prompt_version text not null,
  action_catalog_version text not null,
  provider text not null,
  model text not null,
  response_json jsonb not null,
  created_at timestamptz not null default now(),
  expires_at timestamptz not null,
  input_tokens integer check (input_tokens is null or input_tokens >= 0),
  output_tokens integer check (output_tokens is null or output_tokens >= 0),
  estimated_cost_usd numeric(10, 6)
    check (estimated_cost_usd is null or estimated_cost_usd >= 0),
  latency_ms integer check (latency_ms is null or latency_ms >= 0),
  validation_status text not null
    check (validation_status = 'valid'),
  generation_source text not null
    check (generation_source in ('anthropic_api', 'claude_max_seed', 'static')),
  constraint coach_cache_expiry_after_creation check (expires_at > created_at)
);

create index coach_cache_expires_at_idx
  on public.coach_cache (expires_at);

create table public.coach_generation_locks (
  cache_key text primary key,
  locked_until timestamptz not null,
  created_at timestamptz not null default now()
);

create index coach_generation_locks_locked_until_idx
  on public.coach_generation_locks (locked_until);

create table public.llm_usage (
  id bigint generated always as identity primary key,
  occurred_at timestamptz not null default now(),
  context_hash text not null,
  provider text not null,
  model text not null,
  input_tokens integer not null check (input_tokens >= 0),
  output_tokens integer not null check (output_tokens >= 0),
  estimated_cost_usd numeric(10, 6) not null
    check (estimated_cost_usd >= 0),
  latency_ms integer not null check (latency_ms >= 0),
  result_code text not null
);

create index llm_usage_occurred_at_idx
  on public.llm_usage (occurred_at);

alter table public.coach_cache enable row level security;
alter table public.coach_generation_locks enable row level security;
alter table public.llm_usage enable row level security;

revoke all on table public.coach_cache from anon, authenticated;
revoke all on table public.coach_generation_locks from anon, authenticated;
revoke all on table public.llm_usage from anon, authenticated;
