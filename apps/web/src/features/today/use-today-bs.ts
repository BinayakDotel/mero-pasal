"use client";

import { type DateBs, todayBs } from "@mero-pasal/shared/dates";
import { useEffect, useState } from "react";

/** Today's BS date in Nepal (NFR-09), re-checked every minute so it flips at NPT midnight. */
export function useTodayBs(): DateBs {
  const [today, setToday] = useState(() => todayBs(Date.now()));
  useEffect(() => {
    const id = setInterval(() => setToday(todayBs(Date.now())), 60_000);
    return () => clearInterval(id);
  }, []);
  return today;
}
