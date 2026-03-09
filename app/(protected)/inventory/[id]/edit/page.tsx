import { notFound } from 'next/navigation';
import { InventoryItemForm } from '@/components/inventory/InventoryItemForm';
import { inventoryQuery } from '@/lib/inventory/db';
import type { InventoryCategory, InventoryLocation } from '@/types/inventory';

export const runtime = 'nodejs';

type ItemRow = {
  id: string;
  sku: string;
  name: string;
  description: string | null;
  categoryId: string;
  locationId: string;
  quantity: number;
  unit: string | null;
  imageUrl: string | null;
  imagePath: string | null;
  isActive: boolean;
};

async function getData(id: string) {
  const [itemResult, categories, locations] = await Promise.all([
    inventoryQuery<ItemRow>(
      `SELECT id::text as id, sku, name, description, category_id::text as "categoryId", location_id::text as "locationId", quantity, unit, image_url as "imageUrl", image_path as "imagePath", is_active as "isActive" FROM inventory.items WHERE id = $1::uuid LIMIT 1`,
      [id],
    ),
    inventoryQuery(
      `SELECT id::text as id, code, name, description, sort_order as "sortOrder", is_active as "isActive", created_at::text as "createdAt", updated_at::text as "updatedAt" FROM inventory.categories ORDER BY sort_order, name`,
    ),
    inventoryQuery(
      `SELECT id::text as id, code, name, description, sort_order as "sortOrder", is_active as "isActive", created_at::text as "createdAt", updated_at::text as "updatedAt" FROM inventory.locations ORDER BY sort_order, name`,
    ),
  ]);

  return { item: itemResult.rows[0], categories: categories.rows as unknown as InventoryCategory[], locations: locations.rows as unknown as InventoryLocation[] };
}

export default async function InventoryEditPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { item, categories, locations } = await getData(id);

  if (!item) notFound();

  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-semibold text-brand-text">在庫編集</h1>
      <InventoryItemForm
        mode="edit"
        categories={categories}
        locations={locations}
        initialValue={{
          id: item.id,
          sku: item.sku,
          name: item.name,
          note: item.description ?? '',
          categoryId: item.categoryId,
          locationId: item.locationId,
          quantity: item.quantity,
          unit: item.unit ?? '',
          status: item.isActive ? 'active' : 'inactive',
          imageUrl: item.imageUrl,
          imagePath: item.imagePath,
        }}
      />
    </div>
  );
}
