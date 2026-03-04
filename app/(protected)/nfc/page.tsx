// app/(protected)/nfc/page.tsx
import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { hasDatabaseUrl } from "@/lib/server-env";
import { query } from "@/lib/db";
import StampCard from "@/components/StampCard";
import { ROUTES } from "@/src/constants/routes";

export const dynamic = "force-dynamic";

type SearchParams = Record<string, string | string[] | undefined>;
type MaybePromise<T> = T | Promise<T>;

type NFCPageProps = {
  searchParams?: MaybePromise<SearchParams>;
};

type MachineRow = {
  id: string;
  machine_code: number;
  name: string;
  active: boolean;
};

type LastLogRow = {
  stamp_type: string;
  work_description: string | null;
};

function toSingleValue(value: string | string[] | undefined): string {
  if (Array.isArray(value)) return value[0] ?? "";
  return value ?? "";
}

function isDigits(value: string): boolean {
  return /^[0-9]+$/.test(value);
}


function getJstWorkDate(date = new Date()): string {
  // en-CA => YYYY-MM-DD
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Tokyo",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(date);
}

async function resolveActiveMachineByCode(codeText: string): Promise<MachineRow | null> {
  const code = Number.parseInt(codeText, 10);
  if (!Number.isFinite(code)) return null;

  const res = await query<MachineRow>(
    `
      SELECT id, machine_code, name, active
      FROM machines
      WHERE machine_code = $1 AND active = true
      LIMIT 1
    `,
    [code]
  );
  return res.rows[0] ?? null;
}

export default async function NFCPage({ searchParams }: NFCPageProps) {
  const session = await auth();
  if (!session?.user?.id) {
    redirect(ROUTES.LOGIN);
  }

  if (!hasDatabaseUrl()) {
    return (
      <div
        role="alert"
        className="rounded-lg border border-brand-border bg-brand-surface-alt p-4 text-brand-text"
      >
        データベース環境変数が未設定のため、打刻ページを表示できません。
      </div>
    );
  }

  const sp = (await searchParams) ?? {};

  const requestedMachineIdRaw =
    toSingleValue(sp.machineId).trim() || toSingleValue(sp.machineid).trim() || "";

  const defaultMachineIdRaw = (process.env.NEXT_PUBLIC_DEFAULT_MACHINE_ID || "1003").trim();

  const candidates = [requestedMachineIdRaw, defaultMachineIdRaw]
    .map((v) => v.trim())
    .filter((v) => v.length > 0 && isDigits(v));

  // ここでは「誤った機械へ黙ってフォールバック」を避けるため、
  // 候補（requested → default）のみで解決し、解決できなければエラー表示にする
  let machine: MachineRow | null = null;
  let resolvedMachineCodeText: string | null = null;

  for (const cand of candidates) {
    const found = await resolveActiveMachineByCode(cand);
    if (found) {
      machine = found;
      resolvedMachineCodeText = String(found.machine_code);
      break;
    }
  }

  if (!machine || !resolvedMachineCodeText) {
    return (
      <div
        role="alert"
        className="rounded-lg border border-brand-border bg-brand-surface-alt p-4 text-brand-text"
      >
        機械情報を取得できませんでした。URL の machineId（数値）と Machines マスタを確認してください。
      </div>
    );
  }

  // URL 正規化（requested があり、解決結果と違うときだけ）
  if (requestedMachineIdRaw && requestedMachineIdRaw !== resolvedMachineCodeText) {
    redirect(`/nfc?machineId=${encodeURIComponent(resolvedMachineCodeText)}`);
  }

  // 当日（JST）の最終打刻から初期状態を決める（Neon logs）
  const workDate = getJstWorkDate();
  const lastLogRes = await query<LastLogRow>(
    `
      SELECT stamp_type, work_description
      FROM logs
      WHERE user_id = $1::uuid
        AND work_date = $2::date
      ORDER BY stamped_at DESC
      LIMIT 1
    `,
    [session.user.id, workDate]
  );
  const lastLog = lastLogRes.rows[0] ?? null;

  const initialStampType = lastLog?.stamp_type === "IN" ? "OUT" : "IN";
  const initialWorkDescription = lastLog?.work_description ?? "";

  const machineLabel = `${machine.name}（${machine.machine_code}）`;

  return (
    <section className="flex flex-1 flex-col">
      <div className="mx-auto flex w-full max-w-md flex-1 flex-col px-4 space-y-6">
        <div className="flex flex-1 items-center justify-center">
          <StampCard
            initialStampType={initialStampType}
            initialWorkDescription={initialWorkDescription}
            userName={session.user.name ?? "ゲスト"}
            machineName={machineLabel}
          />
        </div>
      </div>
    </section>
  );
}
