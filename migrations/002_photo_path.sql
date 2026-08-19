-- Move check-in photos from base64-in-DB to filesystem paths.
ALTER TABLE checkins ADD COLUMN IF NOT EXISTS photo_path TEXT;
ALTER TABLE checkins DROP COLUMN IF EXISTS photo_base64;
