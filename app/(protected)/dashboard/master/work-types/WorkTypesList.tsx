'use client';

import { useEffect, useMemo, useState, type FormEvent } from 'react';
import type { MasterWorkType } from '@/types/master';

type WorkTypeForm = {
  name: string;
  sortOrder: string;
  active: boolean;
  category: MasterWorkType['category'];
};

const EMPTY_FORM: WorkTypeForm = {
  name: '',
  sortOrder: '0',
  active: true,
  category: 'other',
};

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

function parseError(code?: string) {
  if (code === 'INVALID_BODY') return '入力内容を確認してください。';
  return '保存に失敗しました。';
}

export default function WorkTypesList() {
  const [items, setItems] = useState<MasterWorkType[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [submitError, setSubmitError] = useState('');
  const [saving, setSaving] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState<WorkTypeForm>(EMPTY_FORM);

  const modeLabel = useMemo(() => (editingId ? '編集' : '新規登録'), [editingId]);

  const fetchData = async () => {
    setLoading(true);
    setError('');
    try {
      const response = await fetch('/api/master/work-types', { cache: 'no-store', credentials: 'same-origin' });
      if (!response.ok) throw new Error('FAILED');
      const data = (await response.json()) as MasterWorkType[];
      setItems(data);
    } catch {
      setError('作業区分一覧の取得に失敗しました。');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
  }, []);

  const onEdit = (item: MasterWorkType) => {
    setEditingId(item.id);
    setSubmitError('');
    setForm({
      name: item.name,
      sortOrder: String(item.sortOrder),
      active: item.active,
      category: item.category,
    });
  };

  const onReset = () => {
    setEditingId(null);
    setSubmitError('');
    setForm(EMPTY_FORM);
  };

  const onSubmit = async (event: FormEvent) => {
    event.preventDefault();
    setSaving(true);
    setSubmitError('');

    const payload = {
      name: form.name,
      sortOrder: Number(form.sortOrder),
      active: form.active,
      category: form.category,
    };

    const endpoint = editingId ? `/api/master/work-types/${editingId}` : '/api/master/work-types';
    const method = editingId ? 'PATCH' : 'POST';

    try {
      const response = await fetch(endpoint, {
        method,
        credentials: 'same-origin',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });

      if (!response.ok) {
        const body = (await response.json().catch(() => ({}))) as { error?: string };
        throw new Error(parseError(body.error));
      }

      onReset();
      await fetchData();
    } catch (requestError) {
      setSubmitError(requestError instanceof Error ? requestError.message : '保存に失敗しました。');
    } finally {
      setSaving(false);
    }
  };

  const onToggle = async (item: MasterWorkType) => {
    setSaving(true);
    setSubmitError('');
    try {
      const response = await fetch(`/api/master/work-types/${item.id}`, {
        method: 'PATCH',
        credentials: 'same-origin',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ active: !item.active }),
      });
      if (!response.ok) throw new Error('状態更新に失敗しました。');
      await fetchData();
    } catch (requestError) {
      setSubmitError(requestError instanceof Error ? requestError.message : '状態更新に失敗しました。');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-4">
      <form onSubmit={onSubmit} className="space-y-3 rounded-lg border border-brand-border bg-brand-surface p-4 text-sm text-brand-text">
        <div className="flex items-center justify-between"><h2 className="text-base font-semibold">{modeLabel}</h2><button type="button" onClick={onReset} className="rounded border border-brand-border px-2 py-1">入力クリア</button></div>
        <div className="grid gap-3 md:grid-cols-2">
          
          <label className="space-y-1"><span>作業名</span><input required className="w-full rounded border border-brand-border px-2 py-1" value={form.name} onChange={(e) => setForm((prev) => ({ ...prev, name: e.target.value }))} /></label>
          <label className="space-y-1"><span>区分</span><select className="w-full rounded border border-brand-border px-2 py-1" value={form.category} onChange={(e) => setForm((prev) => ({ ...prev, category: e.target.value as MasterWorkType['category'] }))}><option value="operating">稼働</option><option value="regular">常用</option><option value="other">その他</option></select></label>
          <label className="space-y-1"><span>並び順</span><input required type="number" min={0} className="w-full rounded border border-brand-border px-2 py-1" value={form.sortOrder} onChange={(e) => setForm((prev) => ({ ...prev, sortOrder: e.target.value }))} /></label>
          <label className="flex items-center gap-2 pt-6"><input type="checkbox" checked={form.active} onChange={(e) => setForm((prev) => ({ ...prev, active: e.target.checked }))} /><span>有効</span></label>
        </div>
        {submitError ? <p className="text-red-600">{submitError}</p> : null}
        <p className="text-xs text-brand-muted">入力後は「登録」ボタンを押してください。</p>
        <div className="flex gap-2"><button disabled={saving} className="rounded bg-brand-accent px-3 py-1.5 text-white disabled:opacity-60">{editingId ? '更新' : '登録'}</button><button type="button" onClick={onReset} className="rounded border border-brand-border px-3 py-1.5">キャンセル</button></div>
      </form>

      {loading ? <p className="text-sm text-brand-muted">読み込み中...</p> : null}
      {error ? <p className="text-sm text-red-600">{error}</p> : null}
      {!loading && !error && !items.length ? (
        <div className="rounded border border-dashed border-brand-border px-6 py-10 text-center text-sm text-brand-muted">データがありません。</div>
      ) : null}

      {!!items.length && (
        <div className="space-y-3 md:hidden">
          {items.map((item) => (
            <article key={item.id} className="rounded-lg border border-brand-border bg-brand-surface p-3 text-sm text-brand-text">
              <p className="font-medium">{item.name}</p>
              <p>区分: {CATEGORY_LABELS[item.category] ?? item.category}</p>
              <p>並び順: {item.sortOrder}</p>
              <p>有効: {item.active ? '有効' : '無効'}</p>
              <div className="mt-2 flex gap-2">
                <button type="button" onClick={() => onEdit(item)} className="rounded border border-brand-border px-2 py-1">編集</button>
                <button type="button" onClick={() => onToggle(item)} className="rounded border border-brand-border px-2 py-1">{item.active ? '無効化' : '有効化'}</button>
              </div>
            </article>
          ))}
        </div>
      )}

      {!!items.length && (
        <div className="hidden overflow-x-auto rounded-lg border border-brand-border md:block">
          <table className="min-w-full divide-y divide-brand-border text-sm text-brand-text">
            <thead className="bg-brand-surface-alt text-left"><tr><th className="px-3 py-2">作業名</th><th className="px-3 py-2">区分</th><th className="px-3 py-2">並び順</th><th className="px-3 py-2">有効</th><th className="px-3 py-2">作成日時</th><th className="px-3 py-2">更新日時</th><th className="px-3 py-2">操作</th></tr></thead>
            <tbody className="divide-y divide-brand-border bg-brand-surface">
              {items.map((item) => (
                <tr key={item.id}><td className="px-3 py-2">{item.name}</td><td className="px-3 py-2">{CATEGORY_LABELS[item.category] ?? item.category}</td><td className="px-3 py-2">{item.sortOrder}</td><td className="px-3 py-2">{item.active ? '有効' : '無効'}</td><td className="px-3 py-2">{formatDate(item.createdAt)}</td><td className="px-3 py-2">{formatDate(item.updatedAt)}</td><td className="px-3 py-2"><div className="flex gap-2"><button type="button" onClick={() => onEdit(item)} className="rounded border border-brand-border px-2 py-1">編集</button><button type="button" onClick={() => onToggle(item)} className="rounded border border-brand-border px-2 py-1">{item.active ? '無効化' : '有効化'}</button></div></td></tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
