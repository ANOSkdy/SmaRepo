import type { Metadata } from 'next';
import './globals.css';
import './reports-print.css';
import NextAuthSessionProvider from '@/components/SessionProvider';
import SkipLink from '@/components/SkipLink';
import NavTabsServer from '@/components/NavTabsServer';

export const metadata: Metadata = {
  title: 'AI日報「スマレポ」',
  description: 'NFCを使ったAI日報システム',
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="ja">
      <body className="min-h-screen bg-brand-surface text-brand-text">
        <SkipLink />
        <header className="sticky top-0 z-50 border-b border-brand-border bg-brand-surface/90 backdrop-blur">
          <div className="mx-auto w-full max-w-6xl px-4 py-3 sm:px-6">
            <NavTabsServer />
          </div>
        </header>
        <NextAuthSessionProvider>
          <main id="main" role="main" className="mx-auto flex w-full max-w-6xl flex-1 flex-col px-4 pt-6 sm:px-6" style={{ paddingBottom: 'calc(var(--safe-area-bottom) + 3rem)' }}>
            {children}
          </main>
        </NextAuthSessionProvider>
      </body>
    </html>
  );
}
