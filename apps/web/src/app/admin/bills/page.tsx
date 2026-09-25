"use client";

import { monthOf } from "@mero-pasal/shared/dates";
import { useCallback, useState } from "react";
import { PageHead } from "@/features/admin/admin-shell";
import { BillDrawer } from "@/features/admin/bill-drawer";
import { type AdminBill, BillsTable } from "@/features/admin/bills-table";
import { useTodayBs } from "@/features/today/use-today-bs";

/** F-11 bills: the table; a row opens the bill drawer. */
export default function AdminBillsPage() {
  const thisMonth = monthOf(useTodayBs());
  const [open, setOpen] = useState<string | null>(null);
  const onOpen = useCallback((bill: AdminBill) => setOpen(bill.clientId), []);
  const onClose = useCallback(() => setOpen(null), []);
  return (
    <>
      <PageHead title="Bills" />
      <BillsTable thisMonth={thisMonth} onOpen={onOpen} />
      {open ? <BillDrawer key={open} clientId={open} onClose={onClose} /> : null}
    </>
  );
}
