'use client';

import { useEffect, useState } from 'react';
import type { MasterWorkType } from '@/types/master';

const CATEGORY_LABELS: Record<MasterWorkType['category'], string> = {
  operating: '稼働',
  regular: '常用',
  other: 'その他',
};

function formatDate(value: string | null) {
  if (!value) return '-';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '-';
  return date.toLocaleString('ja-JP');
}

export default function WorkTypesList() {
  const [items, setItems] = useState<MasterWorkType[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    let active = true;

    const fetchData = async () => {
      setLoading(true);
      setError('');
      try {
        const response = await fetch('/api/master/work-types', { cache: 'no-store', credentials: 'same-origin' });
        if (!response.ok) throw new Error('FAILED');
        const data = (await response.json()) as MasterWorkType[];
        if (!active) return;
        setItems(data);
      } catch {
        if (!active) return;
        setError('作業区分一覧の取得に失敗しました。');
      } finally {
        if (active) setLoading(false);
      }
    };

    fetchData();
    return () => {
      active = false;
    };
  }, []);

  if (loading) return <p className="text-sm text-brand-muted">読み込み中...</p>;
  if (error) return <p className="text-sm text-red-600">{error}</p>;
  if (!items.length) return <div className="rounded border border-dashed border-brand-border px-6 py-10 text-center text-sm text-brand-muted">データがありません。</div>;

  return (
    <>
      <div className="space-y-3 md:hidden">
        {items.map((item) => (
          <article key={item.id} className="rounded-lg border border-brand-border bg-brand-surface p-3 text-sm text-brand-text">
            <p className="font-medium">{item.name}</p>
            <p>区分: {CATEGORY_LABELS[item.category] ?? item.category}</p>
            <p>並び順: {item.sortOrder}</p>
            <p>有効: {item.active ? '有効' : '無効'}</p>
          </article>
        ))}
      </div>

      <div className="hidden overflow-x-auto rounded-lg border border-brand-border md:block">
        <table className="min-w-full divide-y divide-brand-border text-sm text-brand-text">
          <thead className="bg-brand-surface-alt text-left">
            <tr>
              <th className="px-3 py-2">作業コード</th>
              <th className="px-3 py-2">名称</th>
              <th className="px-3 py-2">区分</th>
              <th className="px-3 py-2">並び順</th>
              <th className="px-3 py-2">有効</th>
              <th className="px-3 py-2">作成日時</th>
              <th className="px-3 py-2">更新日時</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-brand-border bg-brand-surface">
            {items.map((item) => (
              <tr key={item.id}>
                <td className="px-3 py-2">{item.workCode ?? '-'}</td>
                <td className="px-3 py-2">{item.name}</td>
                <td className="px-3 py-2">{CATEGORY_LABELS[item.category] ?? item.category}</td>
                <td className="px-3 py-2">{item.sortOrder}</td>
                <td className="px-3 py-2">{item.active ? '有効' : '無効'}</td>
                <td className="px-3 py-2">{formatDate(item.createdAt)}</td>
                <td className="px-3 py-2">{formatDate(item.updatedAt)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </>
  );
}
