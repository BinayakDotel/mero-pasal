"use client";

import { api } from "@mero-pasal/backend/convex/_generated/api";
import { useQuery } from "convex/react";

/** F-02: today's billed totals and the 5 newest bills (live; M2 adds the offline cache). */
export function useTodayBills(dateBs: string) {
  const totals = useQuery(api.summaries.forDate, { dateBs });
  const recent = useQuery(api.transactions.listRecentForDate, { dateBs, limit: 5 });
  return { totals, recent };
}
