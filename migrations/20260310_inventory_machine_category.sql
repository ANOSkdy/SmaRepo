BEGIN;

ALTER TABLE inventory.items
  ALTER COLUMN category_id TYPE text
  USING category_id::text;

ALTER TABLE inventory.items
  DROP CONSTRAINT IF EXISTS items_category_id_fkey;

UPDATE inventory.items i
SET category_id = c.code
FROM inventory.categories c
WHERE i.category_id = c.id::text;

CREATE INDEX IF NOT EXISTS inventory_items_category_idx ON inventory.items(category_id);

COMMIT;
