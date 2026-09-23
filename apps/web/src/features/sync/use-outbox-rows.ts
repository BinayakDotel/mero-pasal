"use client";

import { liveQuery } from "dexie";
import { useEffect, useState } from "react";
import { getDb, type OutboxRow } from "./db";

/** Outbox rows, kept live across tabs (Dexie liveQuery). Empty until first read. */
export function useOutboxRows(): OutboxRow[] {
  const [rows, setRows] = useState<OutboxRow[]>([]);
  useEffect(() => {
    const subscription = liveQuery(() => getDb().outbox.orderBy("seq").toArray()).subscribe({
      next: setRows,
      error: () => setRows([]),
    });
    return () => subscription.unsubscribe();
  }, []);
  return rows;
}
