"use client";

import type { Id } from "@mero-pasal/backend/convex/_generated/dataModel";
import { useParams } from "next/navigation";
import { AccountScreen } from "@/features/accounts/account-screen";
import { BottomNav } from "@/features/nav/bottom-nav";

export default function AccountPage() {
  const { id } = useParams<{ id: string }>();
  return (
    <>
      <AccountScreen partyId={id as Id<"parties">} />
      <BottomNav active="nav.accounts" />
    </>
  );
}
