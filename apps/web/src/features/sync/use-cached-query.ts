"use client";

import { useQuery } from "convex/react";
import type { FunctionReference, FunctionReturnType } from "convex/server";
import { useEffect, useState } from "react";
import { getDb } from "./db";
import { useConnection } from "./use-connection";

export type Cached<T> = {
  data: T | undefined;
  /** Live from the server right now (false = the last copy saved on the phone, shown "(पुरानो)"). */
  live: boolean;
  /** When the shown copy was saved (for counting phone-side bills exactly once). */
  savedAt: number;
};

/**
 * Architecture §12: live Convex data when connected, else the last result saved on the phone.
 * Every live result is written back, so the app keeps working through a power cut.
 */
export function useCachedQuery<Q extends FunctionReference<"query">>(
  query: Q,
  args: Q["_args"],
  cacheKey: string,
): Cached<FunctionReturnType<Q>> {
  const connected = useConnection();
  const live = useQuery(query, args) as FunctionReturnType<Q> | undefined;
  const [cached, setCached] = useState<{ value: FunctionReturnType<Q>; savedAt: number } | null>(
    null,
  );

  useEffect(() => {
    let cancelled = false;
    void getDb()
      .cache.get(cacheKey)
      .then((row) => {
        if (!cancelled && row)
          setCached({ value: row.value as FunctionReturnType<Q>, savedAt: row.savedAt });
      })
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, [cacheKey]);

  useEffect(() => {
    if (live === undefined || !connected) return;
    const savedAt = Date.now();
    setCached({ value: live, savedAt });
    void getDb()
      .cache.put({ key: cacheKey, value: live, savedAt })
      .catch(() => undefined);
  }, [live, connected, cacheKey]);

  if (live !== undefined && connected) return { data: live, live: true, savedAt: Date.now() };
  // Offline, Convex may still hand back its last result; either way it's a saved copy now.
  if (cached) return { data: cached.value, live: false, savedAt: cached.savedAt };
  return { data: live, live: false, savedAt: 0 };
}
