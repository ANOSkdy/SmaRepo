BEGIN;

ALTER TABLE inventory.items
  DROP CONSTRAINT IF EXISTS items_category_id_fkey;

ALTER TABLE inventory.items
  ALTER COLUMN category_id TYPE text
  USING category_id::text;

UPDATE inventory.items i
SET category_id = m.machine_code
FROM inventory.categories c
JOIN public.machines m ON m.id = c.machine_id
WHERE i.category_id = c.id::text;

CREATE INDEX IF NOT EXISTS inventory_items_category_idx ON inventory.items(category_id);

COMMIT;
