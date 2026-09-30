PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS app_users (
  id TEXT PRIMARY KEY,
  email TEXT NOT NULL UNIQUE,
  display_name TEXT NOT NULL,
  role TEXT NOT NULL CHECK (role IN ('super_admin','organizer','referee','club_manager','finance','player')),
  active INTEGER NOT NULL DEFAULT 1,
  password_hash TEXT NOT NULL,
  auth_version INTEGER NOT NULL DEFAULT 0,
  tournament_id_scope TEXT,
  club_id TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS clubs (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  slug TEXT NOT NULL UNIQUE,
  city TEXT,
  active INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS players (
  id TEXT PRIMARY KEY,
  user_id TEXT,
  club_id TEXT,
  created_by_user_id TEXT,
  full_name TEXT NOT NULL,
  nickname TEXT,
  gender TEXT CHECK (gender IN ('male','female','other')),
  rating REAL NOT NULL DEFAULT 3.0,
  phone TEXT,
  avatar_url TEXT,
  bio TEXT,
  dominant_hand TEXT CHECK (dominant_hand IN ('left','right')),
  birth_year INTEGER,
  active INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY(user_id) REFERENCES app_users(id) ON DELETE SET NULL,
  FOREIGN KEY(club_id) REFERENCES clubs(id) ON DELETE SET NULL,
  FOREIGN KEY(created_by_user_id) REFERENCES app_users(id) ON DELETE SET NULL
);

CREATE TABLE IF NOT EXISTS tournaments (
  id TEXT PRIMARY KEY,
  owner_user_id TEXT,
  name TEXT NOT NULL,
  slug TEXT NOT NULL UNIQUE,
  venue_name TEXT,
  start_at TEXT,
  end_at TEXT,
  status TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft','registration','live','completed','cancelled')),
  public_visible INTEGER NOT NULL DEFAULT 0,
  is_featured INTEGER NOT NULL DEFAULT 0,
  featured_rank INTEGER NOT NULL DEFAULT 0,
  contact_name TEXT,
  contact_phone TEXT,
  contact_email TEXT,
  prize_pool TEXT,
  entry_fee TEXT,
  poster_url TEXT,
  sponsor_package TEXT DEFAULT 'free',
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY(owner_user_id) REFERENCES app_users(id) ON DELETE SET NULL
);

CREATE TABLE IF NOT EXISTS divisions (
  id TEXT PRIMARY KEY,
  tournament_id TEXT NOT NULL,
  name TEXT NOT NULL,
  event_type TEXT NOT NULL DEFAULT 'doubles' CHECK (event_type IN ('singles','doubles','mixed_doubles','team')),
  format TEXT NOT NULL DEFAULT 'pool_to_knockout' CHECK (format IN ('round_robin','pool_to_knockout','single_elimination','double_elimination')),
  best_of INTEGER NOT NULL DEFAULT 3,
  points_to_win INTEGER NOT NULL DEFAULT 11,
  win_by_two INTEGER NOT NULL DEFAULT 1,
  advance_count INTEGER NOT NULL DEFAULT 2,
  active INTEGER NOT NULL DEFAULT 1,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY(tournament_id) REFERENCES tournaments(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS teams (
  id TEXT PRIMARY KEY,
  division_id TEXT NOT NULL,
  name TEXT NOT NULL,
  club_id TEXT,
  seed INTEGER,
  group_code TEXT,
  status TEXT NOT NULL DEFAULT 'active',
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY(division_id) REFERENCES divisions(id) ON DELETE CASCADE,
  FOREIGN KEY(club_id) REFERENCES clubs(id) ON DELETE SET NULL
);

CREATE TABLE IF NOT EXISTS team_players (
  team_id TEXT NOT NULL,
  player_id TEXT NOT NULL,
  PRIMARY KEY (team_id, player_id),
  FOREIGN KEY(team_id) REFERENCES teams(id) ON DELETE CASCADE,
  FOREIGN KEY(player_id) REFERENCES players(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS courts (
  id TEXT PRIMARY KEY,
  tournament_id TEXT NOT NULL,
  name TEXT NOT NULL,
  sort_order INTEGER NOT NULL DEFAULT 0,
  active INTEGER NOT NULL DEFAULT 1,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY(tournament_id) REFERENCES tournaments(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS matches (
  id TEXT PRIMARY KEY,
  division_id TEXT NOT NULL,
  court_id TEXT,
  referee_user_id TEXT,
  team_a_id TEXT,
  team_b_id TEXT,
  winner_team_id TEXT,
  stage TEXT NOT NULL DEFAULT 'Vòng bảng',
  round_no INTEGER,
  bracket_slot TEXT,
  next_match_id TEXT,
  next_match_side TEXT CHECK (next_match_side IN ('A','B')),
  loser_next_match_id TEXT,
  loser_next_match_side TEXT CHECK (loser_next_match_side IN ('A','B')),
  scheduled_at TEXT,
  started_at TEXT,
  completed_at TEXT,
  status TEXT NOT NULL DEFAULT 'scheduled' CHECK (status IN ('scheduled','ready','live','completed','walkover','cancelled')),
  current_score_a INTEGER NOT NULL DEFAULT 0,
  current_score_b INTEGER NOT NULL DEFAULT 0,
  result_reason TEXT,
  result_note TEXT,
  version INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY(division_id) REFERENCES divisions(id) ON DELETE CASCADE,
  FOREIGN KEY(court_id) REFERENCES courts(id) ON DELETE SET NULL,
  FOREIGN KEY(referee_user_id) REFERENCES app_users(id) ON DELETE SET NULL,
  FOREIGN KEY(team_a_id) REFERENCES teams(id) ON DELETE SET NULL,
  FOREIGN KEY(team_b_id) REFERENCES teams(id) ON DELETE SET NULL,
  FOREIGN KEY(winner_team_id) REFERENCES teams(id) ON DELETE SET NULL
);

CREATE TABLE IF NOT EXISTS match_sets (
  id TEXT PRIMARY KEY,
  match_id TEXT NOT NULL,
  set_no INTEGER NOT NULL,
  score_a INTEGER NOT NULL DEFAULT 0,
  score_b INTEGER NOT NULL DEFAULT 0,
  completed INTEGER NOT NULL DEFAULT 0,
  UNIQUE(match_id,set_no),
  FOREIGN KEY(match_id) REFERENCES matches(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS score_events (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  match_id TEXT NOT NULL,
  actor_user_id TEXT,
  event_type TEXT NOT NULL CHECK (event_type IN ('POINT','SET_FINISH','MATCH_FINISH','CORRECTION','UNDO')),
  payload TEXT NOT NULL DEFAULT '{}',
  match_version INTEGER NOT NULL,
  undone_at TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY(match_id) REFERENCES matches(id) ON DELETE CASCADE,
  FOREIGN KEY(actor_user_id) REFERENCES app_users(id) ON DELETE SET NULL
);

CREATE TABLE IF NOT EXISTS registrations (
  id TEXT PRIMARY KEY,
  division_id TEXT NOT NULL,
  team_id TEXT,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','approved','waitlist','cancelled')),
  payment_status TEXT NOT NULL DEFAULT 'unpaid' CHECK (payment_status IN ('unpaid','pending','paid','refunded')),
  amount REAL,
  checkin_token TEXT,
  checked_in_at TEXT,
  checked_in_by TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY(division_id) REFERENCES divisions(id) ON DELETE CASCADE,
  FOREIGN KEY(team_id) REFERENCES teams(id) ON DELETE SET NULL,
  FOREIGN KEY(checked_in_by) REFERENCES app_users(id) ON DELETE SET NULL
);

CREATE TABLE IF NOT EXISTS payment_records (
  id TEXT PRIMARY KEY,
  registration_id TEXT NOT NULL,
  method TEXT,
  reference_code TEXT,
  receipt_url TEXT,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','approved','rejected','refunded')),
  reviewed_by TEXT,
  reviewed_at TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY(registration_id) REFERENCES registrations(id) ON DELETE CASCADE,
  FOREIGN KEY(reviewed_by) REFERENCES app_users(id) ON DELETE SET NULL
);

CREATE TABLE IF NOT EXISTS sponsors (
  id TEXT PRIMARY KEY,
  tournament_id TEXT,
  name TEXT NOT NULL,
  logo_url TEXT,
  website_url TEXT,
  tier TEXT,
  sort_order INTEGER NOT NULL DEFAULT 0,
  FOREIGN KEY(tournament_id) REFERENCES tournaments(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS content_posts (
  id TEXT PRIMARY KEY,
  tournament_id TEXT,
  title TEXT NOT NULL,
  slug TEXT NOT NULL UNIQUE,
  excerpt TEXT,
  body TEXT,
  cover_url TEXT,
  status TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft','published','archived')),
  published_at TEXT,
  created_by TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY(tournament_id) REFERENCES tournaments(id) ON DELETE CASCADE,
  FOREIGN KEY(created_by) REFERENCES app_users(id) ON DELETE SET NULL
);

CREATE TABLE IF NOT EXISTS app_settings (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL DEFAULT '{}',
  updated_by TEXT,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY(updated_by) REFERENCES app_users(id) ON DELETE SET NULL
);

CREATE TABLE IF NOT EXISTS audit_logs (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  actor_user_id TEXT,
  entity_type TEXT NOT NULL,
  entity_id TEXT,
  action TEXT NOT NULL,
  before_data TEXT,
  after_data TEXT,
  reason TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY(actor_user_id) REFERENCES app_users(id) ON DELETE SET NULL
);

CREATE INDEX IF NOT EXISTS idx_app_users_scope ON app_users(tournament_id_scope);
CREATE INDEX IF NOT EXISTS idx_players_created_by ON players(created_by_user_id);
CREATE INDEX IF NOT EXISTS idx_players_rating ON players(rating DESC, full_name);
CREATE INDEX IF NOT EXISTS idx_divisions_tournament ON divisions(tournament_id);
CREATE INDEX IF NOT EXISTS idx_teams_division_group ON teams(division_id,group_code);
CREATE INDEX IF NOT EXISTS idx_matches_division_status ON matches(division_id,status);
CREATE INDEX IF NOT EXISTS idx_matches_court_time ON matches(court_id,scheduled_at);
CREATE INDEX IF NOT EXISTS idx_score_events_match ON score_events(match_id,created_at DESC);
CREATE INDEX IF NOT EXISTS idx_audit_entity ON audit_logs(entity_type,entity_id,created_at DESC);
