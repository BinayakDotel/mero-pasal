"use client";

import { BottomNav } from "@/features/nav/bottom-nav";
import { TodayScreen } from "@/features/today/today-screen";

export default function TodayPage() {
  return (
    <>
      <TodayScreen />
      <BottomNav active="nav.today" />
    </>
  );
}
