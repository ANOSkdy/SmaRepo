import type { Metadata } from 'next';
import QAPageClient from './qa-page-client';

export const metadata: Metadata = {
  title: 'ヘルプ / QA | AI日報「スマレポ」',
  description: '使い方ガイドと困ったときの対処法をまとめたページです。',
};

export default function QAPage() {
  return <QAPageClient />;
}
