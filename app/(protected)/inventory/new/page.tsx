'use client';

import { useEffect, useState } from 'react';
import { InventoryItemForm } from '@/components/inventory/InventoryItemForm';
import type { InventoryCategory, InventoryLocation } from '@/types/inventory';

export default function InventoryNewPage() {
  const [categories, setCategories] = useState<InventoryCategory[]>([]);
  const [locations, setLocations] = useState<InventoryLocation[]>([]);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let active = true;

    const load = async () => {
      try {
        const [categoriesRes, locationsRes] = await Promise.all([
          fetch('/api/inventory/categories', { cache: 'no-store', credentials: 'same-origin' }),
          fetch('/api/inventory/locations', { cache: 'no-store', credentials: 'same-origin' }),
        ]);

        if (!categoriesRes.ok || !locationsRes.ok) {
          throw new Error('FAILED');
        }

        const [categoriesData, locationsData] = await Promise.all([
          categoriesRes.json() as Promise<InventoryCategory[]>,
          locationsRes.json() as Promise<InventoryLocation[]>,
        ]);

        if (!active) return;
        setCategories(categoriesData);
        setLocations(locationsData);
      } catch {
        if (!active) return;
        setError('カテゴリ・保管場所の取得に失敗しました。');
      } finally {
        if (active) setLoading(false);
      }
    };

    load();

    return () => {
      active = false;
    };
  }, []);

  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-semibold text-brand-text">在庫新規登録</h1>
      {error ? <p className="text-sm text-red-600">{error}</p> : null}
      {loading ? (
        <p className="text-sm text-brand-muted">読み込み中...</p>
      ) : (
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
      )}
    </div>
  );
}
