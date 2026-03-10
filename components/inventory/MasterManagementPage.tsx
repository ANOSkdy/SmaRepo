'use client';

import Link from 'next/link';
import { FormEvent, useCallback, useEffect, useState } from 'react';

type Master = {
  id: string;
  code: string;
  name: string;
  description: string | null;
  sortOrder: number;
  isActive: boolean;
};

export function MasterManagementPage({ title, endpoint }: { title: string; endpoint: '/api/inventory/categories' | '/api/inventory/locations' }) {
  const [rows, setRows] = useState<Master[]>([]);
  const [name, setName] = useState('');
  const [code, setCode] = useState('');
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);
  const isCategoryPage = endpoint === '/api/inventory/categories';

  const load = useCallback(async () => {
    const response = await fetch(endpoint, { cache: 'no-store', credentials: 'same-origin' });
    if (!response.ok) throw new Error('FAILED');
    setRows((await response.json()) as Master[]);
  }, [endpoint]);

  useEffect(() => {
    load().catch(() => setError('取得に失敗しました。'));
  }, [load]);

  const onCreate = async (e: FormEvent) => {
    e.preventDefault();
    if (isCategoryPage) return;
    setError('');
    setSaving(true);
    try {
      const response = await fetch(endpoint, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        credentials: 'same-origin',
        body: JSON.stringify({ code, name, sortOrder: rows.length, isActive: true }),
      });
      if (!response.ok) throw new Error('FAILED');
      setName('');
      setCode('');
      await load();
    } catch {
      setError('追加に失敗しました。');
    } finally {
      setSaving(false);
    }
  };

  const onRename = async (id: string, next: string) => {
    if (isCategoryPage) return;
    setError('');
    try {
      const response = await fetch(`${endpoint}/${id}`, {
        method: 'PATCH',
        headers: { 'content-type': 'application/json' },
        credentials: 'same-origin',
        body: JSON.stringify({ name: next }),
      });
      if (!response.ok) throw new Error('FAILED');
      await load();
    } catch {
      setError('更新に失敗しました。');
    }
  };

  const onDelete = async (id: string) => {
    setError('');
    if (!window.confirm('削除します。よろしいですか？')) return;
    try {
      const response = await fetch(`${endpoint}/${id}`, {
        method: 'DELETE',
        credentials: 'same-origin',
      });
      if (response.status === 409) {
        setError('この保管場所は在庫で利用中のため削除できません。');
        return;
      }
      if (!response.ok) throw new Error('FAILED');
      await load();
    } catch {
      setError('削除に失敗しました。');
    }
  };

  return (
    <div className="space-y-6">
      <header className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-2xl font-semibold text-brand-text">{title}</h1>
        <Link href="/inventory" className="rounded border border-brand-border px-3 py-1.5 text-sm text-brand-text hover:bg-brand-surface-alt">
          戻る
        </Link>
      </header>

      <section className="rounded-lg border border-brand-border bg-brand-surface p-4">
        {isCategoryPage ? (
          <p className="text-sm text-brand-muted">カテゴリは machines マスター（machine_code / name）と連動しています。この画面では参照のみ可能です。</p>
        ) : (
          <form onSubmit={onCreate} className="grid gap-3 sm:grid-cols-2 lg:grid-cols-[1fr_1fr_auto]">
            <input
              className="w-full rounded border border-brand-border bg-brand-surface px-3 py-2 text-sm text-brand-text"
              placeholder="code"
              value={code}
              onChange={(e) => setCode(e.target.value)}
              required
            />
            <input
              className="w-full rounded border border-brand-border bg-brand-surface px-3 py-2 text-sm text-brand-text"
              placeholder="name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              required
            />
            <button
              disabled={saving}
              className="rounded border border-brand-primary bg-brand-primary px-4 py-2 text-sm font-medium text-brand-primaryText"
            >
              {saving ? '追加中...' : '追加'}
            </button>
          </form>
        )}

        {error ? <p className="mt-3 text-sm text-red-600">{error}</p> : null}
      </section>

      <section className="rounded-lg border border-brand-border bg-brand-surface">
        <ul className="divide-y divide-brand-border">
          {rows.map((row) => (
            <li key={row.id} className="flex flex-col gap-2 p-3 sm:flex-row sm:items-center sm:justify-between">
              <div className="min-w-0">
                <p className="truncate text-sm font-medium text-brand-text">{row.name}</p>
                <p className="text-xs text-brand-muted">{row.code}</p>
              </div>
              {isCategoryPage ? null : (
                <div className="flex items-center gap-3">
                  <button
                    type="button"
                    className="self-start text-sm text-brand-primary underline sm:self-auto"
                    onClick={() => {
                      const renamed = window.prompt('新しい名称', row.name);
                      if (renamed && renamed !== row.name) {
                        onRename(row.id, renamed);
                      }
                    }}
                  >
                    名称変更
                  </button>
                  <button type="button" className="text-sm text-red-600 underline" onClick={() => onDelete(row.id)}>
                    削除
                  </button>
                </div>
              )}
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
}
