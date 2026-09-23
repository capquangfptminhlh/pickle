-- Pickle Tour production data model (PostgreSQL)
create extension if not exists pgcrypto;

create table if not exists app_users (
  id uuid primary key default gen_random_uuid(),
  email text unique not null,
  display_name text not null,
  role text not null check (role in ('super_admin','organizer','referee','club_manager','player')),
  active boolean not null default true,
  created_at timestamptz not null default now()
);

create table if not exists clubs (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  slug text unique not null,
  city text,
  created_at timestamptz not null default now()
);

create table if not exists players (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references app_users(id) on delete set null,
  club_id uuid references clubs(id) on delete set null,
  full_name text not null,
  nickname text,
  gender text check (gender in ('male','female','other')),
  rating numeric(5,3),
  phone text,
  active boolean not null default true,
  created_at timestamptz not null default now()
);

create table if not exists tournaments (
  id uuid primary key default gen_random_uuid(),
  owner_user_id uuid references app_users(id),
  name text not null,
  slug text unique not null,
  venue_name text,
  start_at timestamptz,
  end_at timestamptz,
  status text not null default 'draft' check (status in ('draft','registration','live','completed','cancelled')),
  public_visible boolean not null default false,
  created_at timestamptz not null default now()
);

create table if not exists divisions (
  id uuid primary key default gen_random_uuid(),
  tournament_id uuid not null references tournaments(id) on delete cascade,
  name text not null,
  event_type text not null check (event_type in ('singles','doubles','mixed_doubles','team')),
  format text not null check (format in ('round_robin','pool_to_knockout','single_elimination','double_elimination')),
  best_of smallint not null default 3,
  points_to_win smallint not null default 11,
  win_by_two boolean not null default true,
  advance_count smallint not null default 2
);

create table if not exists teams (
  id uuid primary key default gen_random_uuid(),
  division_id uuid not null references divisions(id) on delete cascade,
  name text not null,
  club_id uuid references clubs(id) on delete set null,
  seed smallint,
  group_code text,
  status text not null default 'active'
);

create table if not exists team_players (
  team_id uuid not null references teams(id) on delete cascade,
  player_id uuid not null references players(id) on delete cascade,
  primary key (team_id, player_id)
);

create table if not exists courts (
  id uuid primary key default gen_random_uuid(),
  tournament_id uuid not null references tournaments(id) on delete cascade,
  name text not null,
  sort_order integer not null default 0,
  active boolean not null default true
);

create table if not exists matches (
  id uuid primary key default gen_random_uuid(),
  division_id uuid not null references divisions(id) on delete cascade,
  court_id uuid references courts(id) on delete set null,
  referee_user_id uuid references app_users(id) on delete set null,
  team_a_id uuid references teams(id) on delete set null,
  team_b_id uuid references teams(id) on delete set null,
  winner_team_id uuid references teams(id) on delete set null,
  stage text not null,
  round_no integer,
  bracket_slot text,
  next_match_id uuid references matches(id) on delete set null,
  next_match_side text check (next_match_side in ('A','B')),
  scheduled_at timestamptz,
  started_at timestamptz,
  completed_at timestamptz,
  status text not null default 'scheduled' check (status in ('scheduled','ready','live','completed','walkover','cancelled')),
  version integer not null default 1,
  created_at timestamptz not null default now()
);

create table if not exists match_sets (
  id uuid primary key default gen_random_uuid(),
  match_id uuid not null references matches(id) on delete cascade,
  set_no smallint not null,
  score_a smallint not null default 0 check (score_a >= 0),
  score_b smallint not null default 0 check (score_b >= 0),
  completed boolean not null default false,
  unique(match_id,set_no)
);

create table if not exists registrations (
  id uuid primary key default gen_random_uuid(),
  division_id uuid not null references divisions(id) on delete cascade,
  team_id uuid references teams(id) on delete set null,
  status text not null default 'pending' check (status in ('pending','approved','waitlist','cancelled')),
  payment_status text not null default 'unpaid' check (payment_status in ('unpaid','pending','paid','refunded')),
  amount numeric(12,2),
  created_at timestamptz not null default now()
);

create table if not exists rating_history (
  id uuid primary key default gen_random_uuid(),
  player_id uuid not null references players(id) on delete cascade,
  match_id uuid references matches(id) on delete set null,
  before_rating numeric(5,3),
  delta numeric(6,3),
  after_rating numeric(5,3),
  reason text,
  created_at timestamptz not null default now()
);

create table if not exists audit_logs (
  id bigserial primary key,
  actor_user_id uuid references app_users(id) on delete set null,
  entity_type text not null,
  entity_id text,
  action text not null,
  before_data jsonb,
  after_data jsonb,
  reason text,
  created_at timestamptz not null default now()
);

create index if not exists idx_matches_division_status on matches(division_id,status);
create index if not exists idx_matches_court_time on matches(court_id,scheduled_at);
create index if not exists idx_teams_division_group on teams(division_id,group_code);
create index if not exists idx_audit_entity on audit_logs(entity_type,entity_id,created_at desc);


-- Production auth/scoring extensions
alter table app_users add column if not exists password_hash text;
alter table app_users add column if not exists tournament_id_scope uuid;
alter table matches add column if not exists current_score_a smallint not null default 0 check (current_score_a >= 0);
alter table matches add column if not exists current_score_b smallint not null default 0 check (current_score_b >= 0);

create table if not exists score_events (
  id bigserial primary key,
  match_id uuid not null references matches(id) on delete cascade,
  actor_user_id uuid references app_users(id) on delete set null,
  event_type text not null check (event_type in ('POINT','SET_FINISH','MATCH_FINISH','CORRECTION','UNDO')),
  payload jsonb not null default '{}'::jsonb,
  match_version integer not null,
  created_at timestamptz not null default now()
);

create table if not exists sponsors (
  id uuid primary key default gen_random_uuid(),
  tournament_id uuid not null references tournaments(id) on delete cascade,
  name text not null,
  logo_url text,
  website_url text,
  tier text,
  sort_order integer not null default 0
);

create table if not exists payment_records (
  id uuid primary key default gen_random_uuid(),
  registration_id uuid not null references registrations(id) on delete cascade,
  method text,
  reference_code text,
  receipt_url text,
  status text not null default 'pending' check (status in ('pending','approved','rejected','refunded')),
  reviewed_by uuid references app_users(id) on delete set null,
  reviewed_at timestamptz,
  created_at timestamptz not null default now()
);

create table if not exists notifications (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references app_users(id) on delete cascade,
  type text not null,
  title text not null,
  body text,
  read_at timestamptz,
  created_at timestamptz not null default now()
);

create index if not exists idx_score_events_match on score_events(match_id, created_at desc);
create index if not exists idx_notifications_user on notifications(user_id, created_at desc);

alter table score_events add column if not exists undone_at timestamptz;
