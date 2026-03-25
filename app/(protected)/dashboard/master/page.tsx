import Link from 'next/link';
import { getAdminSession } from '@/lib/master/auth';

export default async function MasterPage() {
  const adminSession = await getAdminSession();

  if (!adminSession.ok) {
    return (
      <section className="rounded-lg border border-brand-border bg-brand-surface p-6">
        <h1 className="text-xl font-semibold text-brand-text">マスタ管理</h1>
        <p className="mt-3 text-sm text-brand-muted">このページにアクセスする権限がありません。</p>
      </section>
    );
  }

  return (
    <section className="space-y-4">
      <h1 className="text-2xl font-semibold text-brand-text">マスタ管理</h1>
      <div className="grid gap-3 md:grid-cols-4">
        <Link href="/dashboard/master/sites" className="rounded-lg border border-brand-border bg-brand-surface p-4 text-brand-text hover:bg-brand-surface-alt">
          現場管理
        </Link>
        <Link href="/dashboard/master/users" className="rounded-lg border border-brand-border bg-brand-surface p-4 text-brand-text hover:bg-brand-surface-alt">
          ユーザー管理
        </Link>
        <Link
          href="/dashboard/master/work-types"
          className="rounded-lg border border-brand-border bg-brand-surface p-4 text-brand-text hover:bg-brand-surface-alt"
        >
          作業区分管理
        </Link>
        <Link href="/dashboard/master/machines" className="rounded-lg border border-brand-border bg-brand-surface p-4 text-brand-text hover:bg-brand-surface-alt">
          機械管理
        </Link>
      </div>
    </section>
  );
}
