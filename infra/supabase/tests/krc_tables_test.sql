begin;

create extension if not exists pgtap with schema extensions;

select plan(19);

select has_table('public', 'reservoirs', 'reservoirs exists');
select has_table('public', 'reservoir_observations', 'reservoir_observations exists');
select has_table('public', 'regional_drought_daily', 'regional_drought_daily exists');
select has_table('public', 'official_outlooks', 'official_outlooks exists');

select col_is_pk('public', 'reservoirs', 'fac_code', 'reservoirs pk is fac_code');
select col_is_pk(
  'public',
  'reservoir_observations',
  array['fac_code', 'observed_on'],
  'reservoir_observations pk is (fac_code, observed_on)'
);
select col_is_pk(
  'public',
  'regional_drought_daily',
  array['sigun_code', 'observed_on'],
  'regional_drought_daily pk is (sigun_code, observed_on)'
);
select col_is_pk(
  'public',
  'official_outlooks',
  array['sigun_code', 'published_on'],
  'official_outlooks pk is (sigun_code, published_on)'
);

select ok(
  (select relrowsecurity from pg_class where oid = 'public.reservoirs'::regclass),
  'reservoirs has RLS enabled'
);
select ok(
  (
    select relrowsecurity
    from pg_class
    where oid = 'public.reservoir_observations'::regclass
  ),
  'reservoir_observations has RLS enabled'
);
select ok(
  (
    select relrowsecurity
    from pg_class
    where oid = 'public.regional_drought_daily'::regclass
  ),
  'regional_drought_daily has RLS enabled'
);
select ok(
  (select relrowsecurity from pg_class where oid = 'public.official_outlooks'::regclass),
  'official_outlooks has RLS enabled'
);

select is(
  (select count(*)::integer from pg_policies where tablename = 'reservoirs'),
  0,
  'reservoirs exposes no policy'
);
select is(
  (
    select count(*)::integer
    from pg_policies
    where tablename = 'reservoir_observations'
  ),
  0,
  'reservoir_observations exposes no policy'
);
select is(
  (
    select count(*)::integer
    from pg_policies
    where tablename = 'regional_drought_daily'
  ),
  0,
  'regional_drought_daily exposes no policy'
);
select is(
  (select count(*)::integer from pg_policies where tablename = 'official_outlooks'),
  0,
  'official_outlooks exposes no policy'
);

insert into public.reservoirs
  (fac_code, name, address, beneficiary_area, source_file, source_updated_on)
values
  ('4423010045', '탑정', '충청남도 논산시', 5713, 'facility_spec.csv', '2026-01-01');

select is(
  (select sigun_code from public.reservoirs where fac_code = '4423010045'),
  left('4423010045', 5),
  'reservoirs.sigun_code is generated as left(fac_code, 5)'
);

select throws_ok(
  $$
    insert into public.regional_drought_daily
      (sigun_code, observed_on, sido_name, sigun_name, avg_ratio, official_stage)
    values ('44230', '2026-01-01', '충청남도', '논산시', 100, '알수없음')
  $$,
  '23514',
  'regional_drought_daily rejects unknown official_stage'
);

select throws_ok(
  $$
    insert into public.reservoir_observations (fac_code, observed_on, rate, source)
    values ('4423010045', '2026-01-01', 50, 'manual')
  $$,
  '23514',
  'reservoir_observations rejects unknown source'
);

select * from finish();

rollback;
