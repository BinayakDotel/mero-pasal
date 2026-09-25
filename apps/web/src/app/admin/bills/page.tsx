"use client";

import { monthOf } from "@mero-pasal/shared/dates";
import { useCallback, useState } from "react";
import { PageHead } from "@/features/admin/admin-shell";
import { type AdminBill, BillsTable } from "@/features/admin/bills-table";
import { useTodayBs } from "@/features/today/use-today-bs";

/** F-11 bills: the table; a row opens the bill drawer. */
export default function AdminBillsPage() {
  const thisMonth = monthOf(useTodayBs());
  const [, setOpen] = useState<AdminBill | null>(null);
  const onOpen = useCallback((bill: AdminBill) => setOpen(bill), []);
  return (
    <>
      <PageHead title="Bills" />
      <BillsTable thisMonth={thisMonth} onOpen={onOpen} />
    </>
  );
}
