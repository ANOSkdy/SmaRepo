export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

import ExcelJS from 'exceljs';
import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { hasDatabaseUrl } from '@/lib/server-env';
import {
  BASE_HOURS_PER_DAY,
  SUMMARY_COLUMNS,
  formatAttendanceHours,
  formatBreakHours,
} from '@/lib/report/work/attendance/attendanceMatrixConfig';
import {
  InvalidMonthError,
  SiteNotFoundError,
  getMonthlyAttendance,
} from '@/lib/report/work/attendance/getMonthlyAttendance';

function parseNumberParam(value: string | null, label: string): number | null {
  if (value == null || value.trim().length === 0) {
    return null;
  }
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) {
    throw new Error(`${label} must be a number`);
  }
  return parsed;
}

function buildDayHeaderLabel(day: { day: number; weekdayJa: string }): string {
  return `${day.day}\n${day.weekdayJa}`;
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
  const monthParam = searchParams.get('month');
  const siteId = searchParams.get('siteId') || undefined;
  const siteName = searchParams.get('siteName') || undefined;

  if (!monthParam) {
    return NextResponse.json({ error: 'month is required' }, { status: 400 });
  }

  let userId: number | null = null;
  let machineId: number | null = null;
  try {
    const userParam = searchParams.get('user') ?? searchParams.get('userId');
    userId = parseNumberParam(userParam, 'user');
    machineId = parseNumberParam(searchParams.get('machineId'), 'machineId');
  } catch (error) {
    const message = error instanceof Error ? error.message : 'invalid params';
    return NextResponse.json({ error: message }, { status: 400 });
  }

  try {
    const attendance = await getMonthlyAttendance({
      month: monthParam,
      siteId,
      siteName,
      userId,
      machineId,
    });

    const workbook = new ExcelJS.Workbook();
    const sheet = workbook.addWorksheet('attendance', {
      views: [{ state: 'frozen', ySplit: 1, xSplit: 1 }],
    });

    const headerValues = [
      '従業員',
      ...attendance.days.map(buildDayHeaderLabel),
      ...SUMMARY_COLUMNS.map((column) => column.label),
    ];
    sheet.addRow(headerValues);

    const headerRow = sheet.getRow(1);
    headerRow.font = { bold: true };
    headerRow.alignment = { vertical: 'middle', horizontal: 'center', wrapText: true };

    attendance.rows.forEach((row) => {
      const baseTotal = attendance.days.reduce((total, day) => {
        const hours = row.daily[day.date]?.hours ?? 0;
        return total + Math.min(hours, BASE_HOURS_PER_DAY);
      }, 0);
      const overtimeTotal = attendance.days.reduce((total, day) => {
        const hours = row.daily[day.date]?.hours ?? 0;
        return total + Math.max(hours - BASE_HOURS_PER_DAY, 0);
      }, 0);

      const baseRowValues = [
        row.name,
        ...attendance.days.map((day) => {
          const cell = row.daily[day.date];
          const hours = cell?.hours ?? 0;
          const baseHours = Math.min(hours, BASE_HOURS_PER_DAY);
          const label = formatAttendanceHours(baseHours, true);
          return cell?.hasAnomaly ? `${label} ⚠︎` : label;
        }),
        ...SUMMARY_COLUMNS.map((column) => {
          switch (column.key) {
            case 'hours':
              return formatAttendanceHours(baseTotal, false);
            case 'workDays':
              return `${row.totals.workDays}`;
            case 'breakDeductMin':
              return formatBreakHours(row.totals.breakDeductMin);
            case 'overtimeHours':
              return '–';
            default:
              return '–';
          }
        }),
      ];

      sheet.addRow(baseRowValues);

      const overtimeRowValues = [
        '超過',
        ...attendance.days.map((day) => {
          const cell = row.daily[day.date];
          const hours = cell?.hours ?? 0;
          const overtimeHours = Math.max(hours - BASE_HOURS_PER_DAY, 0);
          return formatAttendanceHours(overtimeHours, true);
        }),
        ...SUMMARY_COLUMNS.map((column) => {
          switch (column.key) {
            case 'overtimeHours':
              return formatAttendanceHours(overtimeTotal, true);
            default:
              return '–';
          }
        }),
      ];

      const overtimeRow = sheet.addRow(overtimeRowValues);
      overtimeRow.font = { color: { argb: 'FFDC2626' } };
      overtimeRow.alignment = { vertical: 'middle' };
      overtimeRow.getCell(1).alignment = { indent: 1, vertical: 'middle' };
    });

    sheet.eachRow((row, rowNumber) => {
      if (rowNumber === 1) return;
      row.eachCell((cell, colNumber) => {
        if (colNumber === 1) {
          cell.alignment = { vertical: 'middle', horizontal: 'left' };
        } else {
          cell.alignment = { vertical: 'middle', horizontal: 'center', wrapText: true };
        }
      });
    });

    const out = await workbook.xlsx.writeBuffer();
    const buffer = Buffer.isBuffer(out) ? out : Buffer.from(out as ArrayBuffer);
    if (!(buffer[0] === 0x50 && buffer[1] === 0x4b)) {
      throw new Error('XLSX is not ZIP(PK). exceljs shim might be used.');
    }

    const filename = `attendance_${monthParam}.xlsx`;
    return new Response(buffer, {
      status: 200,
      headers: {
        'Content-Type':
          'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        'Content-Disposition': `attachment; filename*=UTF-8''${encodeURIComponent(filename)}`,
        'Cache-Control': 'no-store',
      },
    });
  } catch (error) {
    if (error instanceof InvalidMonthError) {
      return NextResponse.json({ error: 'month must be YYYY-MM format' }, { status: 400 });
    }
    if (error instanceof SiteNotFoundError) {
      return NextResponse.json(
        { message: 'siteId not found', details: { siteId: error.siteId } },
        { status: 404 },
      );
    }
    console.error('[/api/report/work/attendance/export/excel] error', error);
    const message = error instanceof Error ? error.message : 'internal error';
    return NextResponse.json({ message: 'internal error', details: message }, { status: 500 });
  }
}
