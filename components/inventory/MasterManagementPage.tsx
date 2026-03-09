'use client';

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
    setError('');
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
    }
  };

  const onRename = async (id: string, next: string) => {
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

  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-semibold text-brand-text">{title}</h1>
      <form onSubmit={onCreate} className="flex gap-2">
        <input className="rounded border px-3 py-2" placeholder="code" value={code} onChange={(e) => setCode(e.target.value)} required />
        <input className="rounded border px-3 py-2" placeholder="name" value={name} onChange={(e) => setName(e.target.value)} required />
        <button className="rounded bg-brand-primary px-4 py-2 text-sm text-brand-primaryText">追加</button>
      </form>
      {error ? <p className="text-sm text-red-600">{error}</p> : null}
      <ul className="space-y-2">
        {rows.map((row) => (
          <li key={row.id} className="flex items-center justify-between rounded border border-brand-border p-2">
            <span>{row.name} ({row.code})</span>
            <button className="text-sm text-brand-primary underline" onClick={() => {
              const renamed = window.prompt('新しい名称', row.name);
              if (renamed && renamed !== row.name) {
                onRename(row.id, renamed);
              }
            }}>名称変更</button>
          </li>
        ))}
      </ul>
    </div>
  );
}
