export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

import ExcelJS from 'exceljs';
import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { hasDatabaseUrl } from '@/lib/server-env';
import { buildSiteReport, type ReportColumn } from '@/lib/reports/siteReport';

const MIN_DYNAMIC_COLUMNS = 8;

function parseMonthParam(value: string | null) {
  if (!value) {
    return null;
  }
  const match = /^(\d{4})-(\d{2})$/.exec(value.trim());
  if (!match) {
    return null;
  }
  const year = Number(match[1]);
  const month = Number(match[2]);
  if (!Number.isFinite(year) || !Number.isFinite(month) || month < 1 || month > 12) {
    return null;
  }
  return { year, month };
}

function normalizeMachineIds(value: string | null) {
  if (!value) {
    return [] as string[];
  }
  return value
    .split(',')
    .map((item) => item.trim())
    .filter((item) => item.length > 0);
}

function formatMachineLabel(column: ReportColumn) {
  const ids = Array.isArray(column.machineIds)
    ? column.machineIds
    : column.machineId != null
      ? [column.machineId]
      : [];
  const names = Array.isArray(column.machineNames)
    ? column.machineNames
    : column.machineName != null
      ? [column.machineName]
      : [];
  if (ids.length === 0) {
    return '—';
  }
  const labels = ids.map((id, index) => {
    const idText = typeof id === 'number' ? String(id) : String(id ?? '').trim();
    const nameText = typeof names[index] === 'string' ? names[index]?.trim() : '';
    return nameText ? `${idText} | ${nameText}` : idText;
  });
  return labels.join(', ');
}

export async function GET(req: NextRequest) {
  if (!hasDatabaseUrl()) {
    return NextResponse.json({ ok: false, error: 'DB env missing' }, { status: 500 });
  }

  const session = await auth();
  if (!session?.user) {
    return NextResponse.json({ error: 'UNAUTHORIZED' }, { status: 401 });
  }

  const { searchParams } = new URL(req.url);
  const siteId = (searchParams.get('siteId') ?? '').trim();
  const monthParam = parseMonthParam(searchParams.get('month'));
  const machineIds = normalizeMachineIds(searchParams.get('machineIds'));

  if (!monthParam || !siteId) {
    return NextResponse.json({ error: 'month, siteId are required' }, { status: 400 });
  }

  const report = await buildSiteReport({
    year: monthParam.year,
    month: monthParam.month,
    siteId,
    machineIds,
  });

  const workbook = new ExcelJS.Workbook();
  const sheet = workbook.addWorksheet('site-report', {
    views: [{ state: 'frozen', ySplit: 2, xSplit: 4 }],
  });

  const paddingCount = Math.max(0, MIN_DYNAMIC_COLUMNS - report.columns.length);
  const paddedColumns: Array<ReportColumn | null> = [
    ...report.columns,
    ...Array.from({ length: paddingCount }, () => null),
  ];

  const headerRow1 = ['年', '月', '日', '曜', ...paddedColumns.map((col) => col?.userName ?? '')];
  const headerRow2 = ['', '', '', '', ...paddedColumns.map((col) => (col ? formatMachineLabel(col) : ''))];

  sheet.addRow(headerRow1);
  sheet.addRow(headerRow2);

  sheet.mergeCells('A1:A2');
  sheet.mergeCells('B1:B2');
  sheet.mergeCells('C1:C2');
  sheet.mergeCells('D1:D2');

  const headerRows = [sheet.getRow(1), sheet.getRow(2)];
  headerRows.forEach((row) => {
    row.font = { bold: true };
    row.alignment = { vertical: 'middle', horizontal: 'center', wrapText: true };
  });

  report.days.forEach((day) => {
    const rowValues = [
      report.year,
      report.month,
      day.day,
      day.dow,
      ...report.columns.map((col, index) => day.values[index] ?? 0),
      ...Array.from({ length: paddingCount }).map(() => ''),
    ];
    sheet.addRow(rowValues);
  });

  const totalsByColumnKey = new Map<string, number>();
  report.days.forEach((day) => {
    day.values.forEach((value, index) => {
      const column = report.columns[index];
      if (!column) return;
      totalsByColumnKey.set(column.key, (totalsByColumnKey.get(column.key) ?? 0) + value);
    });
  });

  const totalRowValues = [
    '合計',
    '',
    '',
    '',
    ...report.columns.map((column) => totalsByColumnKey.get(column.key) ?? 0),
    ...Array.from({ length: paddingCount }).map(() => ''),
  ];
  const totalRow = sheet.addRow(totalRowValues);
  totalRow.font = { bold: true };

  const out = await workbook.xlsx.writeBuffer();
  const buffer = Buffer.isBuffer(out) ? out : Buffer.from(out as ArrayBuffer);
  if (!(buffer[0] === 0x50 && buffer[1] === 0x4b)) {
    throw new Error('XLSX buffer is not ZIP(PK). exceljs shim might be used.');
  }
  const filename = `site-report_${monthParam.year}-${String(monthParam.month).padStart(2, '0')}_${siteId}.xlsx`;

  return new Response(buffer, {
    status: 200,
    headers: {
      'Content-Type':
        'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'Content-Disposition': `attachment; filename*=UTF-8''${encodeURIComponent(filename)}`,
      'Cache-Control': 'no-store',
    },
  });
}
