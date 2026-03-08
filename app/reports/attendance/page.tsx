'use client';

import AttendanceMonthlyTab from '@/components/report/work/attendance/AttendanceMonthlyTab';
import ReportPageShell from '@/components/reports/ReportPageShell';
import ReportsTabs from '@/components/reports/ReportsTabs';

export default function AttendanceReportPage() {
  return (
    <ReportPageShell>
      <ReportsTabs />
      <AttendanceMonthlyTab />
    </ReportPageShell>
  );
}
