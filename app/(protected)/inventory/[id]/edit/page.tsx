'use client';

import Link from 'next/link';
import { useParams } from 'next/navigation';
import { useEffect, useMemo, useState } from 'react';
import { InventoryItemForm } from '@/components/inventory/InventoryItemForm';
import type { InventoryCategory, InventoryLocation } from '@/types/inventory';

type InventoryItemDetail = {
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

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export default function InventoryEditPage() {
  const params = useParams<{ id: string }>();
  const id = params?.id ?? '';
  const isValidId = useMemo(() => UUID_PATTERN.test(id), [id]);

  const [item, setItem] = useState<InventoryItemDetail | null>(null);
  const [categories, setCategories] = useState<InventoryCategory[]>([]);
  const [locations, setLocations] = useState<InventoryLocation[]>([]);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!isValidId) {
      setLoading(false);
      setError('不正な在庫IDです。');
      return;
    }

    let active = true;

    const load = async () => {
      try {
        const [itemRes, categoriesRes, locationsRes] = await Promise.all([
          fetch(`/api/inventory/items/${id}`, { cache: 'no-store', credentials: 'same-origin' }),
          fetch('/api/inventory/categories', { cache: 'no-store', credentials: 'same-origin' }),
          fetch('/api/inventory/locations', { cache: 'no-store', credentials: 'same-origin' }),
        ]);

        if (itemRes.status === 404) {
          throw new Error('NOT_FOUND');
        }

        if (!itemRes.ok || !categoriesRes.ok || !locationsRes.ok) {
          throw new Error('FAILED');
        }

        const [itemData, categoriesData, locationsData] = await Promise.all([
          itemRes.json() as Promise<InventoryItemDetail>,
          categoriesRes.json() as Promise<InventoryCategory[]>,
          locationsRes.json() as Promise<InventoryLocation[]>,
        ]);

        if (!active) return;
        setItem(itemData);
        setCategories(categoriesData);
        setLocations(locationsData);
      } catch (e) {
        if (!active) return;
        setError(e instanceof Error && e.message === 'NOT_FOUND' ? '在庫データが見つかりません。' : 'データ取得に失敗しました。');
      } finally {
        if (active) setLoading(false);
      }
    };

    load();

    return () => {
      active = false;
    };
  }, [id, isValidId]);

  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-semibold text-brand-text">在庫編集</h1>

      {loading ? <p className="text-sm text-brand-muted">読み込み中...</p> : null}

      {!loading && error ? (
        <div className="space-y-3">
          <p className="text-sm text-red-600">{error}</p>
          <Link href="/inventory" className="text-sm text-brand-primary underline">
            在庫一覧に戻る
          </Link>
        </div>
      ) : null}

      {!loading && !error && item ? (
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
      ) : null}
    </div>
  );
}
