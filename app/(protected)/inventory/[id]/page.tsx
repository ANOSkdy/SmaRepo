'use client';

import Link from 'next/link';
import { useParams } from 'next/navigation';
import { useEffect, useMemo, useState } from 'react';

type InventoryDetailItem = {
  id: string;
  sku: string;
  name: string;
  description: string | null;
  quantity: number;
  unit: string | null;
  imageUrl: string | null;
  createdAt: string;
  updatedAt: string;
  categoryName: string;
  locationName: string;
};

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

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

export default function InventoryDetailPage() {
  const params = useParams<{ id: string }>();
  const id = params?.id ?? '';

  const [item, setItem] = useState<InventoryDetailItem | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const isValidId = useMemo(() => UUID_PATTERN.test(id), [id]);

  useEffect(() => {
    if (!isValidId) {
      setLoading(false);
      setError('不正な在庫IDです。');
      return;
    }

    let active = true;

    const fetchItem = async () => {
      setLoading(true);
      setError('');

      try {
        const response = await fetch(`/api/inventory/items/${id}`, {
          cache: 'no-store',
          credentials: 'same-origin',
        });

        if (response.status === 404) {
          throw new Error('NOT_FOUND');
        }

        if (!response.ok) {
          throw new Error('FAILED');
        }

        const data = (await response.json()) as InventoryDetailItem;
        if (!active) return;
        setItem(data);
      } catch (fetchError) {
        if (!active) return;
        setItem(null);
        setError(fetchError instanceof Error && fetchError.message === 'NOT_FOUND' ? '在庫データが見つかりません。' : '在庫詳細の取得に失敗しました。');
      } finally {
        if (active) {
          setLoading(false);
        }
      }
    };

    fetchItem();

    return () => {
      active = false;
    };
  }, [id, isValidId]);

  if (loading) {
    return <p className="text-sm text-brand-muted">読み込み中...</p>;
  }

  if (error || !item) {
    return (
      <div className="space-y-4">
        <p className="text-sm text-red-600">{error || '在庫データが見つかりません。'}</p>
        <Link href="/inventory" className="text-sm text-brand-primary underline">
          在庫一覧に戻る
        </Link>
      </div>
    );
  }

  const imageUrl = toSafeImageUrl(item.imageUrl);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold text-brand-text">在庫詳細</h1>
        <Link href="/inventory" className="text-sm text-brand-primary underline">
          在庫一覧へ
        </Link>
      </div>

      <section className="grid gap-6 rounded-lg border border-brand-border bg-brand-surface p-4 md:grid-cols-[280px_1fr]">
        <div>
          {imageUrl ? (
            <img src={imageUrl} alt={item.name} className="h-64 w-full rounded object-cover" referrerPolicy="no-referrer" />
          ) : (
            <div className="flex h-64 w-full items-center justify-center rounded bg-brand-surface-alt text-sm text-brand-muted">
              画像は登録されていません
            </div>
          )}
        </div>

        <dl className="grid grid-cols-1 gap-3 text-sm md:grid-cols-2">
          <div>
            <dt className="text-brand-muted">品目コード</dt>
            <dd className="font-medium text-brand-text">{item.sku}</dd>
          </div>
          <div>
            <dt className="text-brand-muted">品目名</dt>
            <dd className="font-medium text-brand-text">{item.name}</dd>
          </div>
          <div>
            <dt className="text-brand-muted">カテゴリ</dt>
            <dd className="font-medium text-brand-text">{item.categoryName}</dd>
          </div>
          <div>
            <dt className="text-brand-muted">保管場所</dt>
            <dd className="font-medium text-brand-text">{item.locationName}</dd>
          </div>
          <div>
            <dt className="text-brand-muted">数量</dt>
            <dd className="font-medium text-brand-text">{item.quantity}</dd>
          </div>
          <div>
            <dt className="text-brand-muted">単位</dt>
            <dd className="font-medium text-brand-text">{item.unit ?? '-'}</dd>
          </div>
          <div className="md:col-span-2">
            <dt className="text-brand-muted">メモ</dt>
            <dd className="whitespace-pre-wrap font-medium text-brand-text">{item.description?.trim() ? item.description : '-'}</dd>
          </div>
          <div>
            <dt className="text-brand-muted">作成日時</dt>
            <dd className="font-medium text-brand-text">{formatDateTime(item.createdAt)}</dd>
          </div>
          <div>
            <dt className="text-brand-muted">更新日時</dt>
            <dd className="font-medium text-brand-text">{formatDateTime(item.updatedAt)}</dd>
          </div>
        </dl>
      </section>
    </div>
  );
}
