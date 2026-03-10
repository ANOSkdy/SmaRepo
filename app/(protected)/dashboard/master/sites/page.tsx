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
      <h1 className="text-2xl font-semibold text-brand-text">現場管理</h1>
      <SitesList />
    </section>
  );
}
