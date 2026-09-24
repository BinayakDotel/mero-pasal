"use client";

import { BillsScreen } from "@/features/bills/bills-screen";
import { BottomNav } from "@/features/nav/bottom-nav";

export default function BillsPage() {
  return (
    <>
      <BillsScreen />
      <BottomNav active="nav.bills" />
    </>
  );
}
