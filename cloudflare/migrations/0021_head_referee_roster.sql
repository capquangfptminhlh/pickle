-- Head referee is still a referee; the extra capability is only valid with a tournament scope.
ALTER TABLE app_users ADD COLUMN is_head_referee INTEGER NOT NULL DEFAULT 0 CHECK (is_head_referee IN (0,1));
