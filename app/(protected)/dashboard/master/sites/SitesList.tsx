'use client';

import { useEffect, useState } from 'react';
import type { MasterSite } from '@/types/master';

function formatDate(value: string | null) {
  if (!value) return '-';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '-';
  return date.toLocaleString('ja-JP');
}

export default function SitesList() {
  const [items, setItems] = useState<MasterSite[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    let active = true;

    const fetchData = async () => {
      setLoading(true);
      setError('');
      try {
        const response = await fetch('/api/master/sites', { cache: 'no-store', credentials: 'same-origin' });
        if (!response.ok) throw new Error('FAILED');
        const data = (await response.json()) as MasterSite[];
        if (!active) return;
        setItems(data);
      } catch {
        if (!active) return;
        setError('現場一覧の取得に失敗しました。');
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
            <p className="font-medium">{item.name ?? '-'}</p>
            <p>元請名: {item.clientName ?? '-'}</p>
            <p>有効: {item.active ? '有効' : '無効'}</p>
            <p>半径(m): {item.radiusM ?? '-'}</p>
            <p>経度: {item.longitude ?? '-'}</p>
            <p>緯度: {item.latitude ?? '-'}</p>
          </article>
        ))}
      </div>

      <div className="hidden overflow-x-auto rounded-lg border border-brand-border md:block">
        <table className="min-w-full divide-y divide-brand-border text-sm text-brand-text">
          <thead className="bg-brand-surface-alt text-left">
            <tr>
              <th className="px-3 py-2">コード</th>
              <th className="px-3 py-2">名称</th>
              <th className="px-3 py-2">元請名</th>
              <th className="px-3 py-2">有効</th>
              <th className="px-3 py-2">半径(m)</th>
              <th className="px-3 py-2">優先度</th>
              <th className="px-3 py-2">経度</th>
              <th className="px-3 py-2">緯度</th>
              <th className="px-3 py-2">作成日時</th>
              <th className="px-3 py-2">更新日時</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-brand-border bg-brand-surface">
            {items.map((item) => (
              <tr key={item.id}>
                <td className="px-3 py-2">{item.siteCode ?? '-'}</td>
                <td className="px-3 py-2">{item.name ?? '-'}</td>
                <td className="px-3 py-2">{item.clientName ?? '-'}</td>
                <td className="px-3 py-2">{item.active ? '有効' : '無効'}</td>
                <td className="px-3 py-2">{item.radiusM ?? '-'}</td>
                <td className="px-3 py-2">{item.priority ?? '-'}</td>
                <td className="px-3 py-2">{item.longitude ?? '-'}</td>
                <td className="px-3 py-2">{item.latitude ?? '-'}</td>
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
