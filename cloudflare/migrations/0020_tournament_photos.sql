-- The preceding 0019 migration was deployed by an earlier gallery implementation.
-- No production photos existed when this replacement was prepared. Rebuild the
-- table so media is stored by private R2 key with audited soft deletion.
ALTER TABLE tournament_photos RENAME TO tournament_photos_legacy;

CREATE TABLE tournament_photos (
 id TEXT PRIMARY KEY,
 tournament_id TEXT NOT NULL REFERENCES tournaments(id) ON DELETE CASCADE,
 storage_key TEXT NOT NULL UNIQUE,
 content_type TEXT NOT NULL,
 caption TEXT NOT NULL DEFAULT '' CHECK(length(caption)<=300),
 created_by_user_id TEXT REFERENCES app_users(id) ON DELETE SET NULL,
 created_at TEXT NOT NULL DEFAULT (datetime('now')),
 removed_at TEXT,
 version INTEGER NOT NULL DEFAULT 1
);
DROP TABLE tournament_photos_legacy;
CREATE INDEX idx_tournament_photos_album ON tournament_photos(tournament_id,removed_at,created_at);
CREATE TABLE tournament_photo_guards (photo_id TEXT PRIMARY KEY, expected_version INTEGER NOT NULL);
CREATE TRIGGER tournament_photo_version_guard BEFORE INSERT ON tournament_photo_guards BEGIN
 SELECT CASE WHEN NOT EXISTS(SELECT 1 FROM tournament_photos WHERE id=NEW.photo_id AND version=NEW.expected_version AND removed_at IS NULL) THEN RAISE(ABORT,'PHOTO_VERSION_CONFLICT') END;
END;
