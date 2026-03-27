'use client';

import { FormEvent, useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import type { InventoryCategory, InventoryLocation } from '@/types/inventory';

type InventoryApiError = {
  error?: string;
};

const createErrorMessage: Record<string, string> = {
  INVALID_JSON: '送信データの形式が不正です。',
  INVALID_BODY: '入力内容に不備があります。',
  SKU_ALREADY_EXISTS: '同じ品目コード（SKU）が既に登録されています。',
  INVALID_CATEGORY_ID: '選択したカテゴリが無効です。再選択してください。',
  INVALID_LOCATION_ID: '選択した保管場所が無効です。再選択してください。',
  INVALID_REFERENCE: '参照データが不正です。入力内容をご確認ください。',
  CATEGORY_SCHEMA_MISMATCH: 'サーバー設定に不整合があります。管理者へ連絡してください。',
};

type InventoryFormValue = {
  id?: string;
  sku: string;
  name: string;
  note: string;
  categoryId: string;
  locationId: string;
  quantity: number;
  unit: string;
  status: 'active' | 'inactive';
  imageUrl: string | null;
  imagePath: string | null;
};

export function InventoryItemForm({
  mode,
  initialValue,
  categories,
  locations,
}: {
  mode: 'create' | 'edit';
  initialValue: InventoryFormValue;
  categories: InventoryCategory[];
  locations: InventoryLocation[];
}) {
  const router = useRouter();
  const [value, setValue] = useState(initialValue);
  const [uploading, setUploading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => setValue(initialValue), [initialValue]);

  const onUpload = async (file: File | null) => {
    if (!file) return;

    setUploading(true);
    setError('');

    try {
      const formData = new FormData();
      formData.append('file', file);

      const response = await fetch('/api/inventory/upload', {
        method: 'POST',
        body: formData,
        credentials: 'same-origin',
      });

      if (!response.ok) {
        throw new Error('UPLOAD_FAILED');
      }

      const data = (await response.json()) as { url: string; path: string };
      setValue((prev) => ({ ...prev, imageUrl: data.url, imagePath: data.path }));
    } catch {
      setError('画像アップロードに失敗しました。jpg/png/webp 5MB以下を確認してください。');
    } finally {
      setUploading(false);
    }
  };

  const onSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setSaving(true);
    setError('');

    try {
      const payload = {
        sku: value.sku,
        name: value.name,
        categoryId: value.categoryId,
        locationId: value.locationId,
        quantity: Number(value.quantity),
        unit: value.unit,
        status: value.status,
        note: value.note,
        imageUrl: value.imageUrl,
        imagePath: value.imagePath,
      };

      const response = await fetch(mode === 'create' ? '/api/inventory/items' : `/api/inventory/items/${value.id}`, {
        method: mode === 'create' ? 'POST' : 'PATCH',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(payload),
        credentials: 'same-origin',
      });

      if (!response.ok) {
        let apiError = 'SAVE_FAILED';
        try {
          const data = (await response.json()) as InventoryApiError;
          if (typeof data.error === 'string' && data.error.length > 0) {
            apiError = data.error;
          }
        } catch {
          // no-op
        }

        throw new Error(apiError);
      }

      const data = (await response.json()) as { id: string };
      router.push(mode === 'create' ? `/inventory/${data.id}` : `/inventory/${value.id}`);
      router.refresh();
    } catch (error) {
      const apiError = error instanceof Error ? error.message : 'SAVE_FAILED';
      setError(createErrorMessage[apiError] ?? '保存に失敗しました。入力内容をご確認ください。');
    } finally {
      setSaving(false);
    }
  };

  const onDelete = async () => {
    if (mode !== 'edit' || !value.id) return;
    if (!window.confirm('この在庫を削除します。よろしいですか？')) return;

    setDeleting(true);
    setError('');
    try {
      const response = await fetch(`/api/inventory/items/${value.id}`, {
        method: 'DELETE',
        credentials: 'same-origin',
      });
      if (!response.ok) throw new Error('FAILED');
      router.push('/inventory');
      router.refresh();
    } catch {
      setError('削除に失敗しました。');
      setDeleting(false);
    }
  };

  return (
    <form onSubmit={onSubmit} className="space-y-4 rounded-lg border border-brand-border bg-brand-surface p-4">
      <div className="grid gap-4 md:grid-cols-2">
        <label className="flex flex-col gap-1 text-sm text-brand-text">
          品目コード
          <input className="rounded border border-brand-border px-3 py-2" value={value.sku} onChange={(e) => setValue({ ...value, sku: e.target.value })} required />
        </label>

        <label className="flex flex-col gap-1 text-sm text-brand-text">
          品目名
          <input className="rounded border border-brand-border px-3 py-2" value={value.name} onChange={(e) => setValue({ ...value, name: e.target.value })} required />
        </label>

        <label className="flex flex-col gap-1 text-sm text-brand-text">
          カテゴリ
          <select className="rounded border border-brand-border px-3 py-2" value={value.categoryId} onChange={(e) => setValue({ ...value, categoryId: e.target.value })} required>
            <option value="">カテゴリを選択</option>
            {categories
              .filter((x) => x.isActive)
              .map((x) => (
                <option key={x.id} value={x.id}>
                  {x.name}
                </option>
              ))}
          </select>
        </label>

        <label className="flex flex-col gap-1 text-sm text-brand-text">
          保管場所
          <select className="rounded border border-brand-border px-3 py-2" value={value.locationId} onChange={(e) => setValue({ ...value, locationId: e.target.value })} required>
            <option value="">保管場所を選択</option>
            {locations
              .filter((x) => x.isActive)
              .map((x) => (
                <option key={x.id} value={x.id}>
                  {x.name}
                </option>
              ))}
          </select>
        </label>

        <label className="flex flex-col gap-1 text-sm text-brand-text">
          数量
          <input className="rounded border border-brand-border px-3 py-2" type="number" min={0} value={value.quantity} onChange={(e) => setValue({ ...value, quantity: Number(e.target.value) })} required />
        </label>

        <label className="flex flex-col gap-1 text-sm text-brand-text">
          単位
          <input className="rounded border border-brand-border px-3 py-2" value={value.unit} onChange={(e) => setValue({ ...value, unit: e.target.value })} />
        </label>

        <label className="flex flex-col gap-1 text-sm text-brand-text">
          ステータス
          <select className="rounded border border-brand-border px-3 py-2" value={value.status} onChange={(e) => setValue({ ...value, status: e.target.value as 'active' | 'inactive' })}>
            <option value="active">有効</option>
            <option value="inactive">無効</option>
          </select>
        </label>

        <label className="flex flex-col gap-1 text-sm text-brand-text">
          画像
          <input className="rounded border border-brand-border px-3 py-2" type="file" accept="image/jpeg,image/png,image/webp" onChange={(e) => onUpload(e.target.files?.[0] ?? null)} />
        </label>
      </div>

      <label className="flex flex-col gap-1 text-sm text-brand-text">
        メモ
        <textarea className="w-full rounded border border-brand-border px-3 py-2" rows={4} value={value.note} onChange={(e) => setValue({ ...value, note: e.target.value })} />
      </label>

      {value.imageUrl ? <img src={value.imageUrl} alt="uploaded" className="h-28 w-28 rounded object-cover" /> : null}
      {error ? <p className="text-sm text-red-600">{error}</p> : null}

      <div className="flex justify-between gap-3">
        {mode === 'edit' ? (
          <button type="button" onClick={onDelete} disabled={saving || uploading || deleting} className="rounded border border-red-600 px-4 py-2 text-sm text-red-600">
            {deleting ? '削除中...' : '削除'}
          </button>
        ) : <div />}
        <button type="submit" disabled={saving || uploading || deleting} className="rounded bg-brand-primary px-4 py-2 text-sm text-brand-primaryText">
          {uploading ? '画像アップロード中...' : saving ? '保存中...' : mode === 'create' ? '登録する' : '更新する'}
        </button>
      </div>
    </form>
  );
}
