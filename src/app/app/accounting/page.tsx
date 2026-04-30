import { Role } from "@prisma/client";
import {
  getAccountingReportData,
} from "@/lib/accounting";
import { AccountingClient } from "@/app/app/accounting/accounting-client";
import { formatDateYMD, getManilaToday } from "@/lib/date";
import { requireRole, requireUser } from "@/lib/auth/session";

export default async function AccountingPage({
  searchParams,
}: {
  searchParams: Promise<{ date?: string }>;
}) {
  const user = await requireUser();
  requireRole(user, [Role.SUPER_ADMIN, Role.ENCODER]);

  const sp = await searchParams;
  const today = formatDateYMD(getManilaToday());
  const selectedDate =
    sp.date && /^\d{4}-\d{2}-\d{2}$/.test(sp.date)
      ? sp.date
      : today;

  const reportData = await getAccountingReportData(selectedDate);

  return (
    <AccountingClient
      selectedDate={selectedDate}
      userRole={user.role}
      initialManualData={reportData.manualData}
      computedTotals={reportData.computedTotals}
      initialOpeningBalance={reportData.view.openingBalance}
      lastUpdatedAt={reportData.lastUpdatedAt}
    />
  );
}
