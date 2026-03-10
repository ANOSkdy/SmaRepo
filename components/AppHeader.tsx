'use client';

import { usePathname } from 'next/navigation';
import Link from 'next/link';
import { useId, useState } from 'react';
import NavTabs, { NAV_TABS, filterTabs, isActivePath } from './NavTabs';

type AppHeaderProps = {
  showNfc?: boolean;
  showMaster?: boolean;
};

export default function AppHeader({ showNfc = true, showMaster = false }: AppHeaderProps) {
  const [isOpen, setIsOpen] = useState(false);
  const pathname = usePathname();
  const menuId = useId();
  const tabsToRender = filterTabs(NAV_TABS, showNfc);
  const menuTabs = showMaster ? [...tabsToRender, { href: '/dashboard/master', label: 'マスタ管理' }] : tabsToRender;

  return (
    <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
      <div className="flex items-center justify-between gap-4">
        <p className="text-lg font-semibold text-brand-primary whitespace-nowrap shrink-0">スマレポ</p>
        <button
          type="button"
          aria-controls={menuId}
          aria-expanded={isOpen}
          onClick={() => setIsOpen((open) => !open)}
          className="inline-flex items-center justify-center rounded-md border border-brand-border p-2 text-brand-primary transition sm:hidden"
        >
          <span className="sr-only">ナビゲーションを開閉</span>
          <svg
            aria-hidden="true"
            viewBox="0 0 24 24"
            className="h-5 w-5"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            {isOpen ? (
              <>
                <line x1="18" y1="6" x2="6" y2="18" />
                <line x1="6" y1="6" x2="18" y2="18" />
              </>
            ) : (
              <>
                <line x1="3" y1="6" x2="21" y2="6" />
                <line x1="3" y1="12" x2="21" y2="12" />
                <line x1="3" y1="18" x2="21" y2="18" />
              </>
            )}
          </svg>
        </button>
      </div>
      <div className="hidden sm:flex">
        <NavTabs showNfc={showNfc} showMaster={showMaster} />
      </div>
      {isOpen && (
        <div className="sm:hidden">
          <nav
            id={menuId}
            role="navigation"
            aria-label="主要タブナビゲーション"
            className="flex flex-col gap-1 rounded-lg border border-brand-border bg-brand-surface-alt p-2 text-sm font-medium"
          >
            {menuTabs.map((tab) => {
              const active = isActivePath(pathname, tab.href);
              return (
                <Link
                  key={tab.href}
                  href={tab.href}
                  onClick={() => setIsOpen(false)}
                  className={`rounded-md px-3 py-2 transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-focus/40 focus-visible:ring-offset-2 focus-visible:ring-offset-brand-surface ${
                    active
                      ? 'bg-brand-primary text-brand-primaryText shadow-sm'
                      : 'text-brand-primary hover:bg-brand-primary/10'
                  }`}
                >
                  {tab.label}
                </Link>
              );
            })}
          </nav>
        </div>
      )}
    </div>
  );
}
