BEGIN;

-- Align DB schema with UI/API behavior where image metadata is optional.
ALTER TABLE inventory.items
  ALTER COLUMN image_url DROP NOT NULL,
  ALTER COLUMN image_path DROP NOT NULL;

COMMIT;
