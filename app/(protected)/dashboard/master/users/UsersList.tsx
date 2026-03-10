'use client';

import { useEffect, useState } from 'react';
import type { MasterUser } from '@/types/master';

function formatDate(value: string | null) {
  if (!value) return '-';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '-';
  return date.toLocaleString('ja-JP');
}

export default function UsersList() {
  const [items, setItems] = useState<MasterUser[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    let active = true;

    const fetchData = async () => {
      setLoading(true);
      setError('');
      try {
        const response = await fetch('/api/master/users', { cache: 'no-store', credentials: 'same-origin' });
        if (!response.ok) throw new Error('FAILED');
        const data = (await response.json()) as MasterUser[];
        if (!active) return;
        setItems(data);
      } catch {
        if (!active) return;
        setError('ユーザー一覧の取得に失敗しました。');
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
            <p>権限: {item.role}</p>
            <p>有効: {item.active ? '有効' : '無効'}</p>
            <p>休憩控除除外: {item.excludeBreakDeduction ? '対象外' : '対象'}</p>
          </article>
        ))}
      </div>

      <div className="hidden overflow-x-auto rounded-lg border border-brand-border md:block">
        <table className="min-w-full divide-y divide-brand-border text-sm text-brand-text">
          <thead className="bg-brand-surface-alt text-left">
            <tr>
              <th className="px-3 py-2">ユーザーコード</th>
              <th className="px-3 py-2">ユーザー名</th>
              <th className="px-3 py-2">氏名</th>
              <th className="px-3 py-2">電話番号</th>
              <th className="px-3 py-2">メール</th>
              <th className="px-3 py-2">権限</th>
              <th className="px-3 py-2">有効</th>
              <th className="px-3 py-2">休憩控除除外</th>
              <th className="px-3 py-2">作成日時</th>
              <th className="px-3 py-2">更新日時</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-brand-border bg-brand-surface">
            {items.map((item) => (
              <tr key={item.id}>
                <td className="px-3 py-2">{item.userCode ?? '-'}</td>
                <td className="px-3 py-2">{item.username}</td>
                <td className="px-3 py-2">{item.name}</td>
                <td className="px-3 py-2">{item.phone ?? '-'}</td>
                <td className="px-3 py-2">{item.email ?? '-'}</td>
                <td className="px-3 py-2">{item.role}</td>
                <td className="px-3 py-2">{item.active ? '有効' : '無効'}</td>
                <td className="px-3 py-2">{item.excludeBreakDeduction ? '対象外' : '対象'}</td>
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
