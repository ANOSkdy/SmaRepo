'use client';

import Link from 'next/link';
import { FormEvent, useEffect, useMemo, useState } from 'react';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import type { InventoryCategory, InventoryLocation } from '@/types/inventory';

type InventoryListItem = {
  id: string;
  sku: string;
  name: string;
  quantity: number;
  unit: string | null;
  imageUrl: string | null;
  updatedAt: string;
  categoryName: string;
  locationName: string;
};

function formatDateTime(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '-';
  return date.toLocaleString('ja-JP');
}

function toSafeImageUrl(value: string | null): string | null {
  if (!value) return null;
  try {
    const url = new URL(value);
    if (url.protocol !== 'http:' && url.protocol !== 'https:') {
      return null;
    }
    return value;
  } catch {
    return null;
  }
}

export default function InventoryPage() {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  const [items, setItems] = useState<InventoryListItem[]>([]);
  const [categories, setCategories] = useState<InventoryCategory[]>([]);
  const [locations, setLocations] = useState<InventoryLocation[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const defaultQ = searchParams.get('q') ?? '';
  const defaultCategoryId = searchParams.get('categoryId') ?? '';
  const defaultLocationId = searchParams.get('locationId') ?? '';

  const [q, setQ] = useState(defaultQ);
  const [categoryId, setCategoryId] = useState(defaultCategoryId);
  const [locationId, setLocationId] = useState(defaultLocationId);

  useEffect(() => {
    setQ(defaultQ);
    setCategoryId(defaultCategoryId);
    setLocationId(defaultLocationId);
  }, [defaultQ, defaultCategoryId, defaultLocationId]);

  const queryString = useMemo(() => {
    const params = new URLSearchParams();
    if (defaultQ.trim()) params.set('q', defaultQ.trim());
    if (defaultCategoryId) params.set('categoryId', defaultCategoryId);
    if (defaultLocationId) params.set('locationId', defaultLocationId);
    return params.toString();
  }, [defaultQ, defaultCategoryId, defaultLocationId]);

  useEffect(() => {
    let active = true;

    const fetchFilters = async () => {
      try {
        const [categoriesRes, locationsRes] = await Promise.all([
          fetch('/api/inventory/categories', { cache: 'no-store', credentials: 'same-origin' }),
          fetch('/api/inventory/locations', { cache: 'no-store', credentials: 'same-origin' }),
        ]);

        if (!categoriesRes.ok || !locationsRes.ok) {
          throw new Error('failed to fetch filters');
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
      }
    };

    fetchFilters();

    return () => {
      active = false;
    };
  }, []);

  useEffect(() => {
    let active = true;

    const fetchItems = async () => {
      setLoading(true);
      setError('');

      try {
        const response = await fetch(`/api/inventory/items${queryString ? `?${queryString}` : ''}`, {
          cache: 'no-store',
          credentials: 'same-origin',
        });

        if (!response.ok) {
          throw new Error('failed to fetch items');
        }

        const data = (await response.json()) as InventoryListItem[];
        if (!active) return;
        setItems(data);
      } catch {
        if (!active) return;
        setError('在庫一覧の取得に失敗しました。');
      } finally {
        if (active) {
          setLoading(false);
        }
      }
    };

    fetchItems();

    return () => {
      active = false;
    };
  }, [queryString]);

  const onSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const params = new URLSearchParams();

    if (q.trim()) params.set('q', q.trim());
    if (categoryId) params.set('categoryId', categoryId);
    if (locationId) params.set('locationId', locationId);

    const next = params.toString();
    router.push(next ? `${pathname}?${next}` : pathname);
  };

  return (
    <div className="space-y-6">
      <header className="flex items-center justify-between gap-2">
        <h1 className="text-2xl font-semibold text-brand-text">在庫一覧</h1>
        <div className="flex gap-3 text-sm">
          <Link href="/inventory/new" className="text-brand-primary underline">新規登録</Link>
          <Link href="/inventory/categories" className="text-brand-primary underline">カテゴリ管理</Link>
          <Link href="/inventory/locations" className="text-brand-primary underline">保管場所管理</Link>
        </div>
      </header>

      <section className="rounded-lg border border-brand-border bg-brand-surface p-4">
        <form onSubmit={onSubmit} className="grid gap-4 md:grid-cols-4">
          <label className="flex flex-col gap-2 text-sm font-medium text-brand-text md:col-span-2" htmlFor="inventory-q">
            検索
            <input
              id="inventory-q"
              type="search"
              value={q}
              onChange={(event) => setQ(event.currentTarget.value)}
              placeholder="品目名 / 品目コード"
              className="rounded border border-brand-border bg-brand-surface px-3 py-2 text-sm text-brand-text focus:border-brand-primary focus:outline-none focus:ring-1 focus:ring-brand-primary"
            />
          </label>

          <label className="flex flex-col gap-2 text-sm font-medium text-brand-text" htmlFor="inventory-category">
            カテゴリ
            <select
              id="inventory-category"
              value={categoryId}
              onChange={(event) => setCategoryId(event.currentTarget.value)}
              className="rounded border border-brand-border bg-brand-surface px-3 py-2 text-sm text-brand-text focus:border-brand-primary focus:outline-none focus:ring-1 focus:ring-brand-primary"
            >
              <option value="">すべて</option>
              {categories.map((category) => (
                <option key={category.id} value={category.id}>
                  {category.name}
                </option>
              ))}
            </select>
          </label>

          <label className="flex flex-col gap-2 text-sm font-medium text-brand-text" htmlFor="inventory-location">
            保管場所
            <select
              id="inventory-location"
              value={locationId}
              onChange={(event) => setLocationId(event.currentTarget.value)}
              className="rounded border border-brand-border bg-brand-surface px-3 py-2 text-sm text-brand-text focus:border-brand-primary focus:outline-none focus:ring-1 focus:ring-brand-primary"
            >
              <option value="">すべて</option>
              {locations.map((location) => (
                <option key={location.id} value={location.id}>
                  {location.name}
                </option>
              ))}
            </select>
          </label>

          <div className="md:col-span-4 flex justify-end">
            <button
              type="submit"
              className="rounded border border-brand-primary bg-brand-primary px-4 py-2 text-sm font-medium text-brand-primaryText transition hover:opacity-90"
            >
              絞り込み
            </button>
          </div>
        </form>
      </section>

      {error ? <p className="text-sm text-red-600">{error}</p> : null}

      {loading ? (
        <p className="text-sm text-brand-muted">読み込み中...</p>
      ) : items.length === 0 ? (
        <div className="rounded border border-dashed border-brand-border bg-brand-surface px-6 py-12 text-center text-sm text-brand-muted">
          条件に一致する在庫がありません。
        </div>
      ) : (
        <div className="overflow-x-auto rounded-lg border border-brand-border bg-brand-surface">
          <table className="min-w-full text-sm">
            <thead className="bg-brand-surface-alt text-left text-brand-text">
              <tr>
                <th className="px-3 py-2 font-semibold">画像</th>
                <th className="px-3 py-2 font-semibold">品目コード</th>
                <th className="px-3 py-2 font-semibold">品目名</th>
                <th className="px-3 py-2 font-semibold">カテゴリ</th>
                <th className="px-3 py-2 font-semibold">保管場所</th>
                <th className="px-3 py-2 font-semibold">数量</th>
                <th className="px-3 py-2 font-semibold">単位</th>
                <th className="px-3 py-2 font-semibold">更新日時</th>
              </tr>
            </thead>
            <tbody>
              {items.map((item) => {
                const imageUrl = toSafeImageUrl(item.imageUrl);
                return (
                  <tr key={item.id} className="border-t border-brand-border">
                    <td className="px-3 py-2">
                      {imageUrl ? (
                        <img
                          src={imageUrl}
                          alt={item.name}
                          loading="lazy"
                          className="h-12 w-12 rounded object-cover"
                          referrerPolicy="no-referrer"
                        />
                      ) : (
                        <div className="flex h-12 w-12 items-center justify-center rounded bg-brand-surface-alt text-xs text-brand-muted">
                          No Img
                        </div>
                      )}
                    </td>
                    <td className="px-3 py-2 text-brand-muted">{item.sku}</td>
                    <td className="px-3 py-2">
                      <Link href={`/inventory/${item.id}`} className="text-brand-primary underline">
                        {item.name}
                      </Link>
                    </td>
                    <td className="px-3 py-2">{item.categoryName}</td>
                    <td className="px-3 py-2">{item.locationName}</td>
                    <td className="px-3 py-2">{item.quantity}</td>
                    <td className="px-3 py-2">{item.unit ?? '-'}</td>
                    <td className="px-3 py-2 text-brand-muted">{formatDateTime(item.updatedAt)}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
