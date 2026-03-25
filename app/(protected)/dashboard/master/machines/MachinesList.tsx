'use client';

import { useEffect, useMemo, useState, type FormEvent } from 'react';
import type { MasterMachine } from '@/types/master';

type MachineForm = {
  name: string;
  machineCode: string;
  active: boolean;
};

const EMPTY_FORM: MachineForm = {
  name: '',
  machineCode: '',
  active: true,
};

function formatDate(value: string | null) {
  if (!value) return '-';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '-';
  return date.toLocaleString('ja-JP');
}

function parseError(code?: string) {
  if (code === 'MACHINE_CODE_EXISTS') return '機械番号が重複しています。';
  if (code === 'MACHINE_IN_USE') return 'この機械は利用中のため削除できません。';
  if (code === 'INVALID_BODY') return '入力内容を確認してください。';
  return '保存に失敗しました。';
}

export default function MachinesList() {
  const [items, setItems] = useState<MasterMachine[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [submitError, setSubmitError] = useState('');
  const [saving, setSaving] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState<MachineForm>(EMPTY_FORM);

  const modeLabel = useMemo(() => (editingId ? '編集' : '新規登録'), [editingId]);

  const fetchData = async () => {
    setLoading(true);
    setError('');
    try {
      const response = await fetch('/api/master/machines', { cache: 'no-store', credentials: 'same-origin' });
      if (!response.ok) throw new Error('FAILED');
      const data = (await response.json()) as MasterMachine[];
      setItems(data);
    } catch {
      setError('機械一覧の取得に失敗しました。');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
  }, []);

  const onEdit = (item: MasterMachine) => {
    setEditingId(item.id);
    setSubmitError('');
    setForm({
      name: item.name,
      machineCode: String(item.machineCode),
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
      machineCode: Number(form.machineCode),
      active: form.active,
    };

    const endpoint = editingId ? `/api/master/machines/${editingId}` : '/api/master/machines';
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

  const onDelete = async (item: MasterMachine) => {
    if (!window.confirm(`「${item.name}」を削除します。よろしいですか？`)) {
      return;
    }

    setSaving(true);
    setSubmitError('');
    try {
      const response = await fetch(`/api/master/machines/${item.id}`, {
        method: 'DELETE',
        credentials: 'same-origin',
      });
      if (!response.ok) {
        const body = (await response.json().catch(() => ({}))) as { error?: string };
        throw new Error(parseError(body.error));
      }
      if (editingId === item.id) {
        onReset();
      }
      await fetchData();
    } catch (requestError) {
      setSubmitError(requestError instanceof Error ? requestError.message : '削除に失敗しました。');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-4">
      <form onSubmit={onSubmit} className="space-y-3 rounded-lg border border-brand-border bg-brand-surface p-4 text-sm text-brand-text">
        <div className="flex items-center justify-between"><h2 className="text-base font-semibold">{modeLabel}</h2><button type="button" onClick={onReset} className="rounded border border-brand-border px-2 py-1">入力クリア</button></div>
        <div className="grid gap-3 md:grid-cols-2">
          <label className="space-y-1"><span>機械名</span><input required className="w-full rounded border border-brand-border px-2 py-1" value={form.name} onChange={(e) => setForm((prev) => ({ ...prev, name: e.target.value }))} /></label>
          <label className="space-y-1"><span>機械番号</span><input required type="number" min={1} className="w-full rounded border border-brand-border px-2 py-1" value={form.machineCode} onChange={(e) => setForm((prev) => ({ ...prev, machineCode: e.target.value }))} /></label>
          <label className="flex items-center gap-2 pt-6"><input type="checkbox" checked={form.active} onChange={(e) => setForm((prev) => ({ ...prev, active: e.target.checked }))} /><span>有効</span></label>
        </div>
        {submitError ? <p className="text-red-600">{submitError}</p> : null}
        <p className="text-xs text-brand-muted">入力後は「登録」ボタンを押してください。</p>
        <div className="flex gap-2"><button disabled={saving} className="rounded border border-black bg-white px-3 py-1.5 text-black disabled:opacity-60">{editingId ? '更新' : '登録'}</button><button type="button" onClick={onReset} className="rounded border border-brand-border px-3 py-1.5">キャンセル</button></div>
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
              <p>機械番号: {item.machineCode}</p>
              <p>有効: {item.active ? '有効' : '無効'}</p>
              <div className="mt-2 flex gap-2">
                <button type="button" onClick={() => onEdit(item)} className="rounded border border-brand-border px-2 py-1">編集</button>
                <button type="button" onClick={() => onDelete(item)} className="rounded border border-brand-border px-2 py-1">削除</button>
              </div>
            </article>
          ))}
        </div>
      )}

      {!!items.length && (
        <div className="hidden overflow-x-auto rounded-lg border border-brand-border md:block">
          <table className="min-w-full divide-y divide-brand-border text-sm text-brand-text">
            <thead className="bg-brand-surface-alt text-left"><tr><th className="px-3 py-2">機械名</th><th className="px-3 py-2">機械番号</th><th className="px-3 py-2">有効</th><th className="px-3 py-2">作成日時</th><th className="px-3 py-2">更新日時</th><th className="px-3 py-2">操作</th></tr></thead>
            <tbody className="divide-y divide-brand-border bg-brand-surface">
              {items.map((item) => (
                <tr key={item.id}><td className="px-3 py-2">{item.name}</td><td className="px-3 py-2">{item.machineCode}</td><td className="px-3 py-2">{item.active ? '有効' : '無効'}</td><td className="px-3 py-2">{formatDate(item.createdAt)}</td><td className="px-3 py-2">{formatDate(item.updatedAt)}</td><td className="px-3 py-2"><div className="flex gap-2"><button type="button" onClick={() => onEdit(item)} className="rounded border border-brand-border px-2 py-1">編集</button><button type="button" onClick={() => onDelete(item)} className="rounded border border-brand-border px-2 py-1">削除</button></div></td></tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
