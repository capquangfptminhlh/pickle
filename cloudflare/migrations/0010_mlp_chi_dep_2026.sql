-- New tournament: Xé Túi Mù – MLP Chị Đẹp 20/10
-- Poster supplied by the organizer on 2026-10-06.
INSERT INTO tournaments(
  id,owner_user_id,name,slug,venue_name,start_at,end_at,status,public_visible,
  is_featured,featured_rank,contact_name,contact_phone,contact_email,
  prize_pool,entry_fee,poster_url,sponsor_package,created_at,updated_at
)
SELECT
  'tour-mlp-chi-dep-20261011',
  (SELECT id FROM app_users WHERE role='super_admin' AND active=1 ORDER BY created_at LIMIT 1),
  'Xé Túi Mù – MLP Chị Đẹp 20/10',
  'xe-tui-mu-mlp-chi-dep-20-10-2026',
  'Bình Lợi Pickleball – 171/4 Bình Lợi, Bình Lợi Trung, TP.HCM',
  '2026-10-11T16:00:00+07:00',
  '2026-10-11T18:00:00+07:00',
  'registration',
  1,
  1,
  100,
  'Hậu / Khoa',
  '0968 976 902 / 0947 669 929',
  NULL,
  'Vô địch: 1.000.000đ + 3 cúp + 3 HC; Á quân: 500.000đ + 3 cúp + 3 HC; Hạng ba: 300.000đ + 3 cúp + 3 HC; kèm quà NTT nếu có. Cơ cấu áp dụng khi có từ 8 team.',
  '200.000đ / VĐV',
  '/assets/tournaments/mlp-chi-dep-2026.webp',
  'highlight',
  CURRENT_TIMESTAMP,
  CURRENT_TIMESTAMP
WHERE NOT EXISTS(SELECT 1 FROM tournaments WHERE id='tour-mlp-chi-dep-20261011');

UPDATE tournaments SET
  name='Xé Túi Mù – MLP Chị Đẹp 20/10',
  venue_name='Bình Lợi Pickleball – 171/4 Bình Lợi, Bình Lợi Trung, TP.HCM',
  start_at='2026-10-11T16:00:00+07:00',
  end_at='2026-10-11T18:00:00+07:00',
  status='registration',
  public_visible=1,
  is_featured=1,
  featured_rank=100,
  contact_name='Hậu / Khoa',
  contact_phone='0968 976 902 / 0947 669 929',
  prize_pool='Vô địch: 1.000.000đ + 3 cúp + 3 HC; Á quân: 500.000đ + 3 cúp + 3 HC; Hạng ba: 300.000đ + 3 cúp + 3 HC; kèm quà NTT nếu có. Cơ cấu áp dụng khi có từ 8 team.',
  entry_fee='200.000đ / VĐV',
  poster_url='/assets/tournaments/mlp-chi-dep-2026.webp',
  sponsor_package='highlight',
  updated_at=CURRENT_TIMESTAMP
WHERE id='tour-mlp-chi-dep-20261011';

INSERT INTO divisions(
  id,tournament_id,name,event_type,format,best_of,points_to_win,win_by_two,
  advance_count,tie_break_mode,scoring_mode,minimum_rest_minutes,match_slot_minutes,active,updated_at
)
SELECT
  'division-mlp-chi-dep-20261011',
  'tour-mlp-chi-dep-20261011',
  'MLP Team Nữ – AB / BC / CA • 3 game × 9 điểm',
  'team',
  'round_robin',
  3,
  9,
  0,
  3,
  'head_to_head',
  'rally',
  10,
  20,
  1,
  CURRENT_TIMESTAMP
WHERE NOT EXISTS(SELECT 1 FROM divisions WHERE id='division-mlp-chi-dep-20261011');

UPDATE divisions SET
  name='MLP Team Nữ – AB / BC / CA • 3 game × 9 điểm',
  event_type='team',
  format='round_robin',
  best_of=3,
  points_to_win=9,
  win_by_two=0,
  scoring_mode='rally',
  updated_at=CURRENT_TIMESTAMP
WHERE id='division-mlp-chi-dep-20261011';

INSERT OR IGNORE INTO courts(id,tournament_id,name,sort_order,active,updated_at) VALUES
  ('court-mlp-chi-dep-01','tour-mlp-chi-dep-20261011','Sân 1',1,1,CURRENT_TIMESTAMP),
  ('court-mlp-chi-dep-02','tour-mlp-chi-dep-20261011','Sân 2',2,1,CURRENT_TIMESTAMP),
  ('court-mlp-chi-dep-03','tour-mlp-chi-dep-20261011','Sân 3',3,1,CURRENT_TIMESTAMP),
  ('court-mlp-chi-dep-04','tour-mlp-chi-dep-20261011','Sân 4',4,1,CURRENT_TIMESTAMP),
  ('court-mlp-chi-dep-05','tour-mlp-chi-dep-20261011','Sân 5',5,1,CURRENT_TIMESTAMP),
  ('court-mlp-chi-dep-06','tour-mlp-chi-dep-20261011','Sân 6',6,1,CURRENT_TIMESTAMP);
