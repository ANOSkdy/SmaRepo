'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';

const REPORT_TABS = [
  { href: '/reports', label: '個別集計' },
  { href: '/reports/sites', label: '現場別集計' },
  { href: '/reports/attendance', label: '勤怠' },
] as const;

export default function ReportsTabs() {
  const pathname = usePathname();

  return (
    <nav className="flex gap-2 border-b border-brand-border pb-2" aria-label="レポート切替タブ">
      {REPORT_TABS.map((tab) => {
        const isActive = pathname === tab.href;
        return (
          <Link
            key={tab.href}
            href={tab.href}
            className={
              isActive
                ? 'rounded-md border border-brand-primary/20 bg-brand-primary/10 px-3 py-1 text-sm font-semibold text-brand-primary'
                : 'rounded-md px-3 py-1 text-sm text-brand-muted transition hover:bg-brand-surface-alt hover:text-brand-text'
            }
            prefetch
          >
            {tab.label}
          </Link>
        );
      })}
    </nav>
  );
}
