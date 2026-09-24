import Dexie, { type EntityTable } from "dexie";
import type { OutboxItem } from "./outbox";
import type { Photo } from "./photo-bytes";

// On-phone storage (architecture §8.1, ADR-011). "strict" durability: Chrome flushes each
// transaction to disk before reporting success, so a saved bill survives a reboot (NFR-02).

export type OutboxStatus = "pending" | "uploading" | "failed" | "done";

export type OutboxRow = OutboxItem & {
  seq?: number;
  status: OutboxStatus;
  /** Not before this time (ms): backoff after a failure. */
  nextAttemptAt: number;
  /** Non-network failures only; 5 → failed (F-09). */
  failures: number;
  lastError?: string;
  /** Only the member who made an item sends it (edge case: sign-out / other account). */
  ownerMemberId: string;
  ownerClerkId: string;
  doneAt?: number;
};

/** The unfinished bill (F-03 draft restore). One row, id "current". */
export type DraftRow = {
  id: "current";
  kind: "sale" | "purchase";
  clientId: string;
  step: "preview" | "party" | "amount";
  pageIds: string[];
  party?: unknown;
  digits: string;
  dateBs: string | null;
  startedAt: number;
  savedAt: number;
};

/** A draft page: the raw photo until processed, then the upload-ready versions (as bytes). */
export type DraftPageRow = {
  id: string;
  raw?: Photo;
  full?: Photo;
  thumb?: Photo;
  width?: number;
  height?: number;
  bytes?: number;
};

/**
 * A bill page's photo on the phone (architecture §9), referenced from outbox pages by id. Kept
 * out of the outbox rows so reading the queue never loads photos. Bytes; rows from before
 * schema v2 may hold a Blob until the engine converts it.
 */
export type PhotoRow = { id: string; photo: Photo };

export type CacheRow = { key: string; value: unknown; savedAt: number };
export type MetaRow = { key: string; value: unknown };

export class MeroPasalDb extends Dexie {
  outbox!: EntityTable<OutboxRow, "seq">;
  drafts!: EntityTable<DraftRow, "id">;
  draftPages!: EntityTable<DraftPageRow, "id">;
  cache!: EntityTable<CacheRow, "key">;
  meta!: EntityTable<MetaRow, "key">;
  photos!: EntityTable<PhotoRow, "id">;

  constructor(name = "mero-pasal") {
    super(name, { chromeTransactionDurability: "strict" });
    this.version(1).stores({
      outbox: "++seq, &clientId, status, doneAt",
      drafts: "id",
      draftPages: "id",
      cache: "key",
      meta: "key",
    });
    // v2 (iPhone): photos get their own table. Schema only: no data is moved here, because
    // storing a Blob Safari can no longer read can fail, and a failed upgrade would stop the
    // database from opening (no capture at all). Bills saved before keep their photos inline
    // until the engine converts them when sending (architecture §9).
    this.version(2).stores({ photos: "id" });
  }
}

let instance: MeroPasalDb | null = null;
export function getDb(): MeroPasalDb {
  instance ??= new MeroPasalDb();
  return instance;
}

/** Ask Chrome not to evict our data under storage pressure (§8.1). Best effort. */
export async function requestPersistence(): Promise<boolean> {
  try {
    return (await navigator.storage?.persist?.()) ?? false;
  } catch {
    return false;
  }
}
