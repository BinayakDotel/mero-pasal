"use client";

import {
  type PaginatedQueryArgs,
  type PaginatedQueryItem,
  type PaginatedQueryReference,
  useConvexAuth,
  usePaginatedQuery,
} from "convex/react";
import { useEffect, useState } from "react";
import { getDb } from "./db";
import { useConnection } from "./use-connection";

/** How many loaded items of a list are kept on the phone for offline (F-06, architecture §12). */
export const CACHED_ITEMS = 200;

export type CachedPages<T> = {
  /** undefined = nothing to show yet (first page loading, no saved copy). */
  results: T[] | undefined;
  /** Live from the server (false = the saved copy, shown "(पुरानो)"). */
  live: boolean;
  canLoadMore: boolean;
  loadingMore: boolean;
  loadMore: () => void;
};

/**
 * A paginated Convex list that keeps working offline: live pages when connected and signed in,
 * else the first CACHED_ITEMS items saved the last time it was live. No "load more" offline.
 */
export function useCachedPaginatedQuery<Q extends PaginatedQueryReference>(
  query: Q,
  args: PaginatedQueryArgs<Q>,
  cacheKey: string,
  pageSize = 30,
): CachedPages<PaginatedQueryItem<Q>> {
  const connected = useConnection();
  const { isAuthenticated } = useConvexAuth();
  const live = usePaginatedQuery(query, isAuthenticated ? args : "skip", {
    initialNumItems: pageSize,
  });
  const [cached, setCached] = useState<PaginatedQueryItem<Q>[] | null>(null);
  const hasLive = connected && live.status !== "LoadingFirstPage" && isAuthenticated;

  useEffect(() => {
    let cancelled = false;
    setCached(null);
    void getDb()
      .cache.get(cacheKey)
      .then((row) => {
        if (!cancelled && row) setCached(row.value as PaginatedQueryItem<Q>[]);
      })
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, [cacheKey]);

  useEffect(() => {
    if (!hasLive) return;
    const value = live.results.slice(0, CACHED_ITEMS);
    void getDb()
      .cache.put({ key: cacheKey, value, savedAt: Date.now() })
      .catch(() => undefined);
  }, [hasLive, live.results, cacheKey]);

  if (hasLive) {
    return {
      results: live.results,
      live: true,
      canLoadMore: live.status === "CanLoadMore",
      loadingMore: live.status === "LoadingMore",
      loadMore: () => live.loadMore(pageSize),
    };
  }
  return {
    results: cached ?? undefined,
    live: false,
    canLoadMore: false,
    loadingMore: false,
    loadMore: () => undefined,
  };
}
