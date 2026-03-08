import type { ReactNode } from 'react';

type ReportFilterPanelProps = {
  children: ReactNode;
  className?: string;
};

export default function ReportFilterPanel({ children, className = '' }: ReportFilterPanelProps) {
  return (
    <section
      className={`rounded-xl border border-brand-border bg-brand-surface-alt p-4 shadow-sm ${className}`.trim()}
      aria-label="レポートフィルター"
    >
      {children}
    </section>
  );
}
