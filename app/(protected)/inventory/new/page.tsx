import { InventoryItemForm } from '@/components/inventory/InventoryItemForm';
import { inventoryQuery } from '@/lib/inventory/db';
import type { InventoryCategory, InventoryLocation } from '@/types/inventory';

export const runtime = 'nodejs';

async function getMasters() {
  const [categories, locations] = await Promise.all([
    inventoryQuery(
      `SELECT id::text as id, code, name, description, sort_order as "sortOrder", is_active as "isActive", created_at::text as "createdAt", updated_at::text as "updatedAt" FROM inventory.categories ORDER BY sort_order, name`,
    ),
    inventoryQuery(
      `SELECT id::text as id, code, name, description, sort_order as "sortOrder", is_active as "isActive", created_at::text as "createdAt", updated_at::text as "updatedAt" FROM inventory.locations ORDER BY sort_order, name`,
    ),
  ]);

  return { categories: categories.rows as unknown as InventoryCategory[], locations: locations.rows as unknown as InventoryLocation[] };
}

export default async function InventoryNewPage() {
  const { categories, locations } = await getMasters();

  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-semibold text-brand-text">在庫新規登録</h1>
      <InventoryItemForm
        mode="create"
        categories={categories}
        locations={locations}
        initialValue={{
          sku: '',
          name: '',
          note: '',
          categoryId: categories.find((x) => x.isActive)?.id ?? '',
          locationId: locations.find((x) => x.isActive)?.id ?? '',
          quantity: 0,
          unit: '',
          status: 'active',
          imageUrl: null,
          imagePath: null,
        }}
      />
    </div>
  );
}
