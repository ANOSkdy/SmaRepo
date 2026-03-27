-- Verify inventory item image columns are nullable in Preview/Production.
-- Expected: both rows return is_nullable = YES.
SELECT
  table_schema,
  table_name,
  column_name,
  is_nullable,
  data_type
FROM information_schema.columns
WHERE table_schema = 'inventory'
  AND table_name = 'items'
  AND column_name IN ('image_url', 'image_path')
ORDER BY column_name;
