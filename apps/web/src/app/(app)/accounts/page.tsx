"use client";

import { AccountsScreen } from "@/features/accounts/accounts-screen";
import { BottomNav } from "@/features/nav/bottom-nav";

export default function AccountsPage() {
  return (
    <>
      <AccountsScreen />
      <BottomNav active="nav.accounts" />
    </>
  );
}
