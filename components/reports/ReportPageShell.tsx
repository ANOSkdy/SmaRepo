import type { ReactNode } from 'react';

type ReportPageShellProps = {
  title?: string;
  description?: string;
  children: ReactNode;
};

export default function ReportPageShell({ title, description, children }: ReportPageShellProps) {
  return (
    <main className="mx-auto w-full max-w-6xl space-y-6 px-4 py-6 sm:px-6 lg:px-8">
      {title ? (
        <header className="space-y-1">
          <h1 className="text-2xl font-semibold text-brand-text">{title}</h1>
          {description ? <p className="text-sm text-brand-muted">{description}</p> : null}
        </header>
      ) : null}
      {children}
    </main>
  );
}
