'use client';

import { useEffect, useMemo, useState, type FormEvent } from 'react';
import type { MasterSite } from '@/types/master';

type SiteForm = {
  name: string;
  clientName: string;
  longitude: string;
  latitude: string;
  radiusM: string;
  priority: string;
  active: boolean;
};

const EMPTY_FORM: SiteForm = {
  name: '',
  clientName: '',
  longitude: '',
  latitude: '',
  radiusM: '100',
  priority: '0',
  active: true,
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

export default function SitesList() {
  const [items, setItems] = useState<MasterSite[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [submitError, setSubmitError] = useState('');
  const [saving, setSaving] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState<SiteForm>(EMPTY_FORM);

  const modeLabel = useMemo(() => (editingId ? '編集' : '新規登録'), [editingId]);

  const fetchData = async () => {
    setLoading(true);
    setError('');
    try {
      const response = await fetch('/api/master/sites', { cache: 'no-store', credentials: 'same-origin' });
      if (!response.ok) throw new Error('FAILED');
      const data = (await response.json()) as MasterSite[];
      setItems(data);
    } catch {
      setError('現場一覧の取得に失敗しました。');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
  }, []);

  const onEdit = (item: MasterSite) => {
    setEditingId(item.id);
    setSubmitError('');
    setForm({
      name: item.name ?? '',
      clientName: item.clientName ?? '',
      longitude: item.longitude?.toString() ?? '',
      latitude: item.latitude?.toString() ?? '',
      radiusM: item.radiusM?.toString() ?? '100',
      priority: item.priority?.toString() ?? '0',
      active: item.active,
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
      clientName: form.clientName,
      longitude: Number(form.longitude),
      latitude: Number(form.latitude),
      radiusM: Number(form.radiusM),
      priority: Number(form.priority),
      active: form.active,
    };

    const endpoint = editingId ? `/api/master/sites/${editingId}` : '/api/master/sites';
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

  const onToggle = async (item: MasterSite) => {
    setSaving(true);
    setSubmitError('');
    try {
      const response = await fetch(`/api/master/sites/${item.id}`, {
        method: 'PATCH',
        credentials: 'same-origin',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ active: !item.active }),
      });
      if (!response.ok) {
        throw new Error('状態更新に失敗しました。');
      }
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
        <div className="flex items-center justify-between"><h2 className="text-base font-semibold">{modeLabel}</h2><button type="button" onClick={onReset} className="rounded border border-brand-border px-2 py-1">新規登録</button></div>
        <div className="grid gap-3 md:grid-cols-2">
          
          <label className="space-y-1">
            <span>現場名</span>
            <input required className="w-full rounded border border-brand-border px-2 py-1" value={form.name} onChange={(e) => setForm((prev) => ({ ...prev, name: e.target.value }))} />
          </label>
          <label className="space-y-1">
            <span>元請名</span>
            <input className="w-full rounded border border-brand-border px-2 py-1" value={form.clientName} onChange={(e) => setForm((prev) => ({ ...prev, clientName: e.target.value }))} />
          </label>
          <label className="space-y-1">
            <span>半径(m)</span>
            <input required type="number" min={1} className="w-full rounded border border-brand-border px-2 py-1" value={form.radiusM} onChange={(e) => setForm((prev) => ({ ...prev, radiusM: e.target.value }))} />
          </label>
          <label className="space-y-1">
            <span>経度</span>
            <input required type="number" step="any" className="w-full rounded border border-brand-border px-2 py-1" value={form.longitude} onChange={(e) => setForm((prev) => ({ ...prev, longitude: e.target.value }))} />
          </label>
          <label className="space-y-1">
            <span>緯度</span>
            <input required type="number" step="any" className="w-full rounded border border-brand-border px-2 py-1" value={form.latitude} onChange={(e) => setForm((prev) => ({ ...prev, latitude: e.target.value }))} />
          </label>
          <label className="space-y-1">
            <span>優先度</span>
            <input required type="number" min={0} className="w-full rounded border border-brand-border px-2 py-1" value={form.priority} onChange={(e) => setForm((prev) => ({ ...prev, priority: e.target.value }))} />
          </label>
          <label className="flex items-center gap-2 pt-6">
            <input type="checkbox" checked={form.active} onChange={(e) => setForm((prev) => ({ ...prev, active: e.target.checked }))} />
            <span>有効</span>
          </label>
        </div>
        {submitError ? <p className="text-red-600">{submitError}</p> : null}
        <div className="flex gap-2">
          <button disabled={saving} className="rounded bg-brand-accent px-3 py-1.5 text-white disabled:opacity-60">保存</button>
          <button type="button" onClick={onReset} className="rounded border border-brand-border px-3 py-1.5">キャンセル</button>
        </div>
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
              <p className="font-medium">{item.name ?? '-'}</p>
              <p>元請名: {item.clientName ?? '-'}</p>
              <p>有効: {item.active ? '有効' : '無効'}</p>
              <p>半径(m): {item.radiusM ?? '-'}</p>
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
            <thead className="bg-brand-surface-alt text-left">
              <tr>
                <th className="px-3 py-2">現場名</th><th className="px-3 py-2">元請名</th><th className="px-3 py-2">有効</th><th className="px-3 py-2">半径(m)</th><th className="px-3 py-2">優先度</th><th className="px-3 py-2">経度</th><th className="px-3 py-2">緯度</th><th className="px-3 py-2">作成日時</th><th className="px-3 py-2">更新日時</th><th className="px-3 py-2">操作</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-brand-border bg-brand-surface">
              {items.map((item) => (
                <tr key={item.id}>
                  <td className="px-3 py-2">{item.name ?? '-'}</td><td className="px-3 py-2">{item.clientName ?? '-'}</td><td className="px-3 py-2">{item.active ? '有効' : '無効'}</td><td className="px-3 py-2">{item.radiusM ?? '-'}</td><td className="px-3 py-2">{item.priority ?? '-'}</td><td className="px-3 py-2">{item.longitude ?? '-'}</td><td className="px-3 py-2">{item.latitude ?? '-'}</td><td className="px-3 py-2">{formatDate(item.createdAt)}</td><td className="px-3 py-2">{formatDate(item.updatedAt)}</td>
                  <td className="px-3 py-2">
                    <div className="flex gap-2">
                      <button type="button" onClick={() => onEdit(item)} className="rounded border border-brand-border px-2 py-1">編集</button>
                      <button type="button" onClick={() => onToggle(item)} className="rounded border border-brand-border px-2 py-1">{item.active ? '無効化' : '有効化'}</button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
