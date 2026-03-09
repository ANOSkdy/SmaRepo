-- Inventory MVP seed data (PR1)
-- Requires docs/sql/inventory_schema.sql applied first.

INSERT INTO inventory.categories (code, name, description, sort_order)
VALUES
  ('TOOLS', 'Tools', 'Hand tools and measuring instruments', 10),
  ('PARTS', 'Parts', 'Repair and replacement parts', 20),
  ('SAFETY', 'Safety', 'Protective and safety supplies', 30)
ON CONFLICT (code) DO NOTHING;

INSERT INTO inventory.locations (code, name, description, sort_order)
VALUES
  ('MAIN-WH', 'Main Warehouse', 'Primary stock location', 10),
  ('YARD-A', 'Yard A', 'Outdoor storage zone', 20),
  ('SERVICE-VAN', 'Service Van', 'Mobile stock for onsite work', 30)
ON CONFLICT (code) DO NOTHING;

INSERT INTO inventory.items (sku, name, description, category_id, location_id, quantity, unit, image_url, image_path)
SELECT
  seed.sku,
  seed.name,
  seed.description,
  c.id,
  l.id,
  seed.quantity,
  seed.unit,
  seed.image_url,
  seed.image_path
FROM (
  VALUES
    (
      'TOOL-001',
      'Adjustable Wrench',
      '250mm adjustable wrench',
      'TOOLS',
      'MAIN-WH',
      12,
      'pcs',
      'https://example.com/images/tool-001.jpg',
      'inventory/tool-001.jpg'
    ),
    (
      'PART-010',
      'Hydraulic Hose 3/8"',
      'Spare hose for hydraulic units',
      'PARTS',
      'YARD-A',
      30,
      'pcs',
      NULL,
      NULL
    ),
    (
      'SAFE-100',
      'Safety Gloves',
      'Cut-resistant safety gloves',
      'SAFETY',
      'SERVICE-VAN',
      24,
      'pairs',
      NULL,
      NULL
    )
) AS seed(sku, name, description, category_code, location_code, quantity, unit, image_url, image_path)
JOIN inventory.categories c ON c.code = seed.category_code
JOIN inventory.locations l ON l.code = seed.location_code
ON CONFLICT (sku) DO NOTHING;
