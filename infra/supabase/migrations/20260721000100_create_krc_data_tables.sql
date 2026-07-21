create table public.reservoirs (
  fac_code text primary key check (fac_code ~ '^[0-9]{10}$'),
  name text not null,
  address text,
  sigun_code text not null generated always as (left(fac_code, 5)) stored,
  beneficiary_area numeric check (beneficiary_area is null or beneficiary_area >= 0),
  effective_storage numeric check (effective_storage is null or effective_storage >= 0),
  source_file text not null,
  source_updated_on date not null,
  loaded_at timestamptz not null default now()
);

create index reservoirs_representative_idx
  on public.reservoirs (sigun_code, beneficiary_area desc nulls last, fac_code asc);

create table public.reservoir_observations (
  fac_code text not null references public.reservoirs (fac_code),
  observed_on date not null,
  rate numeric check (rate is null or rate >= 0),        -- 100 초과 허용
  water_level numeric,
  source text not null check (source in ('daily_csv', 'waterlevel_api')),
  loaded_at timestamptz not null default now(),
  primary key (fac_code, observed_on)
);

create table public.regional_drought_daily (
  sigun_code text not null check (sigun_code ~ '^[0-9]{5}$'),
  observed_on date not null,
  sido_name text not null,
  sigun_name text not null,
  regional_rate numeric check (regional_rate is null or regional_rate >= 0),
  normal_rate numeric check (normal_rate is null or normal_rate >= 0),
  avg_ratio numeric not null check (avg_ratio >= 0),     -- 140.1 실측, 상한 없음
  official_stage text not null
    check (official_stage in ('정상', '관심', '주의', '경계', '심각')),
  loaded_at timestamptz not null default now(),
  primary key (sigun_code, observed_on)
);

create table public.official_outlooks (
  sigun_code text not null check (sigun_code ~ '^[0-9]{5}$'),
  published_on date not null,
  sido_name text not null,
  sigun_name text not null,
  current_level smallint not null check (current_level between 0 and 4),
  outlook_1m smallint not null check (outlook_1m between 0 and 4),
  outlook_2m smallint not null check (outlook_2m between 0 and 4),
  outlook_3m smallint not null check (outlook_3m between 0 and 4),
  loaded_at timestamptz not null default now(),
  primary key (sigun_code, published_on)
);

alter table public.reservoirs enable row level security;
alter table public.reservoir_observations enable row level security;
alter table public.regional_drought_daily enable row level security;
alter table public.official_outlooks enable row level security;

revoke all on table public.reservoirs from anon, authenticated;
revoke all on table public.reservoir_observations from anon, authenticated;
revoke all on table public.regional_drought_daily from anon, authenticated;
revoke all on table public.official_outlooks from anon, authenticated;
