import type { ReactNode } from 'react';

type ReportActionBarProps = {
  children: ReactNode;
  className?: string;
};

export default function ReportActionBar({ children, className = '' }: ReportActionBarProps) {
  return (
    <div
      className={`flex flex-wrap items-center justify-between gap-3 rounded-lg border border-brand-border bg-brand-surface px-3 py-2 _print-hidden ${className}`.trim()}
    >
      {children}
    </div>
  );
}
