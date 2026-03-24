'use client';

type QASection = 'guide' | 'troubleshooting';

type QAItem = {
  id: string;
  section: QASection;
  category: string;
  title: string;
  summary: string;
  keywords: string[];
  symptom?: string;
  cause?: string;
  checkFirst?: string[];
  steps: string[];
  contactHint: string;
  badge?: 'よくある' | 'まず確認';
};

const QA_ITEMS: QAItem[] = [
  {
    id: 'guide-login',
    section: 'guide',
    category: 'ログイン・アカウント',
    title: 'ログインの基本手順',
    summary: 'ログイン画面でメールアドレスとパスワードを入力して利用を開始します。',
    keywords: ['ログイン', 'サインイン', 'アカウント', 'メール', 'パスワード'],
    steps: ['ログイン画面を開きます。', '登録済みのメールアドレスとパスワードを入力します。', 'ログイン後、上部メニューから各ページへ移動できます。'],
    contactHint: '登録メールが分からない場合は管理者へ確認してください。',
    badge: 'まず確認',
  },
  {
    id: 'guide-stamp',
    section: 'guide',
    category: '打刻・位置情報',
    title: '打刻の流れ',
    summary: '打刻ページで内容を確認してボタンを押すだけで記録できます。',
    keywords: ['打刻', '出勤', '退勤', '休憩', 'NFC', '位置情報'],
    steps: ['打刻ページを開き、画面の案内に沿って種別を選びます。', '端末の位置情報設定がONか確認します。', 'ボタンを押して完了メッセージを確認します。'],
    contactHint: '現場名が違う場合は、機械設定の見直しを管理者へ依頼してください。',
    badge: 'よくある',
  },
  {
    id: 'guide-reports',
    section: 'guide',
    category: 'レポート閲覧',
    title: 'レポートの見方',
    summary: '集計ページで期間や条件を選ぶと、必要な結果に絞り込めます。',
    keywords: ['レポート', '集計', 'CSV', 'ダウンロード', '勤務時間'],
    steps: ['上部メニューの「稼働集計」を開きます。', '期間や絞り込み条件を設定します。', '必要に応じてCSV出力を使います。'],
    contactHint: '欲しい列が見つからないときは、管理者へ「表示したい項目名」を伝えてください。',
  },
  {
    id: 'trouble-login-fail',
    section: 'troubleshooting',
    category: 'ログイン・アカウント',
    title: 'ログインできません',
    summary: '入力情報や端末側の保存情報が原因でログインに失敗することがあります。',
    keywords: ['ログインできない', '入れない', 'パスワード', 'アカウント', '認証'],
    symptom: '「ログインに失敗する」「画面が戻る」',
    cause: 'メールアドレス・パスワード違い、または古いログイン情報が残っている可能性があります。',
    checkFirst: ['メールアドレスの入力ミスがないか', '大文字・小文字、全角半角の違いがないか'],
    steps: ['入力し直して再度ログインします。', 'ブラウザを再読み込みします。', '改善しない場合はパスワード再設定や管理者確認を依頼します。'],
    contactHint: '同じ画面で何度も失敗する場合は、いつから発生したかを添えて管理者へ連絡してください。',
    badge: 'よくある',
  },
  {
    id: 'trouble-location',
    section: 'troubleshooting',
    category: '打刻・位置情報',
    title: '位置情報が取れません',
    summary: '位置情報の権限や端末設定がOFFだと打刻時に失敗することがあります。',
    keywords: ['位置情報', 'GPS', '現在地', '取れない', '打刻できない'],
    symptom: '「位置情報が取れません」「打刻しても反応しません」',
    cause: 'ブラウザの位置情報許可がOFF、または端末の位置情報自体がOFFの可能性があります。',
    checkFirst: ['端末の位置情報設定がONか', 'ブラウザでこのサイトの位置情報を許可しているか'],
    steps: ['位置情報を許可してページを再読み込みします。', '屋内で電波が弱い場合は窓際などで再試行します。', 'それでも難しい場合は管理者に手入力対応を相談します。'],
    contactHint: '同じ場所で複数人に発生している場合は、現場名を添えて管理者へ連絡してください。',
    badge: 'まず確認',
  },
  {
    id: 'trouble-nfc-machine',
    section: 'troubleshooting',
    category: '打刻・NFC',
    title: '打刻ページが開かない・機械情報エラー',
    summary: '打刻URLの指定がずれているとページが正しく表示されません。',
    keywords: ['打刻ページ', '機械情報', 'machineId', '開かない', 'エラー'],
    symptom: '「機械情報を取得できませんでした」と表示される',
    cause: 'URLの機械番号が正しくない、または対象機械が無効になっている可能性があります。',
    checkFirst: ['URLの末尾にある機械番号が正しいか', '別の端末でも同じ表示になるか'],
    steps: ['正しい打刻URLを開き直します。', 'ブックマークを最新に更新します。', '改善しない場合は管理者に機械設定の確認を依頼します。'],
    contactHint: '画面に出た文言をそのまま管理者へ共有すると対応が早くなります。',
  },
  {
    id: 'trouble-network',
    section: 'troubleshooting',
    category: 'ネットワーク・接続',
    title: '画面が開かない・読み込みが終わらない',
    summary: '通信状態が不安定だとページ表示や送信に時間がかかる場合があります。',
    keywords: ['ネットワーク', '通信', '開かない', '重い', 'タイムアウト'],
    symptom: '画面が白いまま、読み込み中のまま',
    cause: 'モバイル回線の不安定、Wi-Fi切替直後、社内ネットワーク制限などが考えられます。',
    checkFirst: ['他のサイトは開けるか', 'Wi-Fiとモバイル回線を切り替えると改善するか'],
    steps: ['ページを再読み込みします。', '通信が安定する場所へ移動して再試行します。', '長時間改善しない場合は管理者へ連絡します。'],
    contactHint: '発生時刻と場所を伝えると原因の切り分けがしやすくなります。',
  },
  {
    id: 'trouble-report-mismatch',
    section: 'troubleshooting',
    category: 'レポート・表示差分',
    title: 'レポートが見つからない・数字が合わない',
    summary: '期間条件や表示条件の違いで、想定と違う結果になることがあります。',
    keywords: ['レポートが見つからない', '数字が違う', '集計', '表示', 'CSV'],
    symptom: '「レポートが見つかりません」「打刻したはずのデータが見えない」',
    cause: '表示期間や対象ユーザーの条件違い、反映タイミングの差が主な原因です。',
    checkFirst: ['期間が当月・前月などでずれていないか', '対象ユーザーや現場の絞り込み条件が正しいか'],
    steps: ['条件を広めにして再検索します。', 'CSV出力で元データを確認します。', '差分が続く場合は対象日と対象者を管理者へ共有します。'],
    contactHint: '「誰の、何日の、どの値が違うか」を伝えると確認が早くなります。',
    badge: 'よくある',
  },
  {
    id: 'trouble-browser',
    section: 'troubleshooting',
    category: 'ブラウザ・端末',
    title: 'ボタンが押せない・表示が崩れる',
    summary: '古いブラウザやキャッシュの影響で画面操作に不具合が出る場合があります。',
    keywords: ['ブラウザ', '端末', '表示崩れ', '押せない', '反応しない'],
    symptom: 'ボタンが反応しない、文字が重なる',
    cause: 'ブラウザの更新不足や、古いキャッシュの影響が考えられます。',
    checkFirst: ['ブラウザが最新か', '別ブラウザや別端末で同じ症状か'],
    steps: ['再読み込みを試します。', 'ブラウザのキャッシュを削除して再度開きます。', '改善しない場合は端末情報を添えて管理者へ連絡します。'],
    contactHint: '利用ブラウザ（例: Chrome / Safari）を伝えると調査しやすくなります。',
  },
  {
    id: 'trouble-permission',
    section: 'troubleshooting',
    category: '権限・アクセス',
    title: '見たいページに入れません',
    summary: 'アカウント権限により、閲覧できるページが制限される場合があります。',
    keywords: ['権限', 'アクセス', '開けない', '管理画面', '許可'],
    symptom: '必要なページのメニューが表示されない',
    cause: '現在のアカウントに対象機能の権限が付与されていない可能性があります。',
    checkFirst: ['同じ所属の他ユーザーに表示されるか', '必要な作業にその画面が本当に必要か'],
    steps: ['まず管理者に利用目的を伝えます。', '必要に応じて権限付与を依頼します。', '付与後はいったんログアウトし、再ログインします。'],
    contactHint: '「どのページが必要か」を具体的に伝えると対応がスムーズです。',
  },
];

function CategoryBadge({ category }: { category: string }) {
  return <span className="rounded-full bg-brand-primary/10 px-2 py-1 text-xs font-semibold text-brand-primary">{category}</span>;
}

function SectionIcon({ section }: { section: QASection }) {
  return <span aria-hidden="true">{section === 'guide' ? '📘' : '🛠️'}</span>;
}

function QAAccordionItem({ item }: { item: QAItem }) {
  return (
    <details className="group rounded-lg border border-brand-border bg-brand-surface-alt">
      <summary className="flex cursor-pointer list-none items-center justify-between gap-3 p-4">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <CategoryBadge category={item.category} />
            {item.badge ? <span className="rounded-full bg-amber-100 px-2 py-1 text-xs font-semibold text-amber-700">{item.badge}</span> : null}
          </div>
          <p className="mt-2 text-base font-semibold text-brand-text">{item.title}</p>
          <p className="mt-1 text-sm text-brand-text">{item.summary}</p>
        </div>
        <span className="shrink-0 text-brand-primary transition group-open:rotate-180" aria-hidden="true">▾</span>
      </summary>

      <div className="border-t border-brand-border px-4 pb-4 pt-3">
        {item.symptom ? <p className="text-sm text-brand-text"><span className="font-semibold">見える症状:</span> {item.symptom}</p> : null}
        {item.cause ? <p className="mt-1 text-sm text-brand-text"><span className="font-semibold">よくある原因:</span> {item.cause}</p> : null}

        {item.checkFirst?.length ? (
          <div className="mt-3">
            <p className="text-sm font-semibold text-brand-text">まず確認</p>
            <ul className="mt-1 list-inside list-disc space-y-1 text-sm text-brand-text">
              {item.checkFirst.map((point) => (
                <li key={point}>{point}</li>
              ))}
            </ul>
          </div>
        ) : null}

        <div className="mt-3">
          <p className="text-sm font-semibold text-brand-text">対処手順</p>
          <ol className="mt-1 list-inside list-decimal space-y-1 text-sm text-brand-text">
            {item.steps.map((step) => (
              <li key={step}>{step}</li>
            ))}
          </ol>
        </div>

        {item.section === 'guide' ? (
          <p className="mt-3 rounded-md bg-brand-primary/5 p-2 text-sm text-brand-text">💡 {item.contactHint}</p>
        ) : (
          <p className="mt-3 rounded-md bg-brand-primary/5 p-2 text-sm text-brand-text">✅ 解決しないとき: {item.contactHint}</p>
        )}
      </div>
    </details>
  );
}

export default function QAPageClient() {
  const guideItems = QA_ITEMS.filter((item) => item.section === 'guide');
  const troubleItems = QA_ITEMS.filter((item) => item.section === 'troubleshooting');

  return (
    <section className="mx-auto flex w-full max-w-4xl flex-col gap-6">
      <div className="rounded-xl border border-brand-border bg-brand-surface-alt p-4 sm:p-6">
        <h1 className="text-2xl font-bold text-brand-primary">ヘルプ / QA</h1>
        <p className="mt-2 text-sm text-brand-text">
          使い方の確認や、困ったときの対処をまとめています。項目をタップすると詳細を開けます。
        </p>
      </div>

      <div className="rounded-xl border border-brand-border bg-brand-surface p-4 sm:p-6">
        <h2 className="flex items-center gap-2 text-xl font-semibold text-brand-primary">
          <SectionIcon section="guide" />
          ユーザーガイド
        </h2>
        <p className="mt-2 text-sm text-brand-text">日々の利用で迷いやすい操作をまとめました。</p>
        <div className="mt-4 grid gap-3">
          {guideItems.map((item) => (
            <QAAccordionItem key={item.id} item={item} />
          ))}
        </div>
      </div>

      <div className="rounded-xl border border-brand-border bg-brand-surface p-4 sm:p-6">
        <h2 className="flex items-center gap-2 text-xl font-semibold text-brand-primary">
          <SectionIcon section="troubleshooting" />
          困ったとき（トラブル対処）
        </h2>
        <p className="mt-2 text-sm text-brand-text">「何が起きているか」から順番に確認できます。</p>
        <div className="mt-4 grid gap-3">
          {troubleItems.map((item) => (
            <QAAccordionItem key={item.id} item={item} />
          ))}
        </div>
      </div>
    </section>
  );
}
