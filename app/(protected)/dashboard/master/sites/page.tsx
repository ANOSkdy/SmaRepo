import Link from 'next/link';
import SitesList from './SitesList';
import { getAdminSession } from '@/lib/master/auth';

export default async function MasterSitesPage() {
  const adminSession = await getAdminSession();

  if (!adminSession.ok) {
    return (
      <section className="rounded-lg border border-brand-border bg-brand-surface p-6">
        <h1 className="text-xl font-semibold text-brand-text">現場管理</h1>
        <p className="mt-3 text-sm text-brand-muted">このページにアクセスする権限がありません。</p>
      </section>
    );
  }

  return (
    <section className="space-y-4">
      <div className="flex items-center justify-between gap-3">
        <h1 className="text-2xl font-semibold text-brand-text">現場管理</h1>
        <Link href="/dashboard/master" className="rounded border border-brand-border px-3 py-1.5 text-sm text-brand-text hover:bg-brand-surface-alt">
          マスタ管理へ戻る
        </Link>
      </div>
      <SitesList />
    </section>
  );
}
