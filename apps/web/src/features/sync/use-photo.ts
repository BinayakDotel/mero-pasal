"use client";

import { useEffect, useState } from "react";
import { getDb } from "./db";
import { asBlob } from "./photo-bytes";

/**
 * Photos kept on the phone (architecture §9), loaded by id only when shown: a Blob per id, null
 * while loading or if it's gone. Reading the outbox never loads photos; screens load what they show.
 */
export function usePhotos(refs: readonly string[]): (Blob | null)[] {
  const key = refs.join("|");
  const [blobs, setBlobs] = useState<(Blob | null)[]>(() => refs.map(() => null));
  useEffect(() => {
    let cancelled = false;
    const ids = key ? key.split("|") : [];
    void getDb()
      .photos.bulkGet(ids)
      .then((rows) => {
        if (!cancelled) setBlobs(rows.map((row) => (row ? asBlob(row.photo) : null)));
      })
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, [key]);
  return blobs;
}
