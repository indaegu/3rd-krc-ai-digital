begin;

create extension if not exists pgtap with schema extensions;

select plan(12);

select has_table('public', 'coach_cache', 'coach_cache exists');
select has_table('public', 'coach_generation_locks', 'coach_generation_locks exists');
select has_table('public', 'llm_usage', 'llm_usage exists');

select has_column('public', 'coach_cache', 'cache_key', 'coach_cache has cache_key');
select has_column(
  'public',
  'coach_generation_locks',
  'locked_until',
  'coach_generation_locks has locked_until'
);
select has_column('public', 'llm_usage', 'estimated_cost_usd', 'llm_usage has cost');

select ok(
  (select relrowsecurity from pg_class where oid = 'public.coach_cache'::regclass),
  'coach_cache has RLS enabled'
);
select ok(
  (
    select relrowsecurity
    from pg_class
    where oid = 'public.coach_generation_locks'::regclass
  ),
  'coach_generation_locks has RLS enabled'
);
select ok(
  (select relrowsecurity from pg_class where oid = 'public.llm_usage'::regclass),
  'llm_usage has RLS enabled'
);

select is(
  (select count(*)::integer from pg_policies where tablename = 'coach_cache'),
  0,
  'coach_cache exposes no policy'
);
select is(
  (
    select count(*)::integer
    from pg_policies
    where tablename = 'coach_generation_locks'
  ),
  0,
  'coach_generation_locks exposes no policy'
);
select is(
  (select count(*)::integer from pg_policies where tablename = 'llm_usage'),
  0,
  'llm_usage exposes no policy'
);

select * from finish();

rollback;
