import type { MeroPasalDb, OutboxRow } from "./db";
import type { NewOutboxItem, OutboxItem } from "./outbox";
import { type StoredPhoto, storable } from "./photo-bytes";

/** The phone is out of storage space: the bill was NOT saved (never show the stamp). */
export class StorageFullError extends Error {
  constructor(cause: unknown) {
    super("Phone storage is full", { cause });
    this.name = "StorageFullError";
  }
}

export const OUTBOX_CHANGED = "mp-outbox-changed";

/**
 * NFR-02 / F-09: the save. Writes every item (a new name before its bill) and removes the draft
 * in ONE transaction, then tells the sync engine. When this resolves, the bill is on the phone
 * and the stamp may show. Blobs must already exist (nothing async inside the transaction).
 */
export async function enqueueDurable(
  db: MeroPasalDb,
  items: readonly NewOutboxItem[],
  owner: { memberId: string; clerkId: string },
  now: number,
): Promise<void> {
  // Photos go to the `photos` table as bytes (architecture §9); the bill's pages keep only their
  // ids. Read them now: awaiting inside the transaction would let IndexedDB close it.
  const photos: { id: string; photo: StoredPhoto }[] = [];
  const queued: OutboxItem[] = [];
  for (const item of items) {
    if (item.type !== "tx.create") {
      queued.push(item);
      continue;
    }
    const pages = [];
    for (const [index, page] of item.pages.entries()) {
      const { full, thumb, ...rest } = page;
      const fullRef = `${item.clientId}:${index}:full`;
      const thumbRef = `${item.clientId}:${index}:thumb`;
      photos.push({ id: fullRef, photo: await storable(full) });
      photos.push({ id: thumbRef, photo: await storable(thumb) });
      pages.push({ ...rest, fullRef, thumbRef });
    }
    queued.push({ ...item, pages });
  }
  const rows: OutboxRow[] = [...queued]
    .sort((a, b) => Number(a.type === "tx.create") - Number(b.type === "tx.create"))
    .map((item) => ({
      ...item,
      status: "pending",
      nextAttemptAt: 0,
      failures: 0,
      ownerMemberId: owner.memberId,
      ownerClerkId: owner.clerkId,
      createdAt: item.createdAt || now,
    }));
  try {
    await db.transaction("rw", [db.outbox, db.photos, db.drafts, db.draftPages], async () => {
      for (const row of rows) {
        // Re-saving the same bill (e.g. a double tap) must not queue it twice.
        if ((await db.outbox.where("clientId").equals(row.clientId).count()) === 0) {
          await db.outbox.add(row);
          const mine = photos.filter((p) => p.id.startsWith(`${row.clientId}:`));
          if (mine.length) await db.photos.bulkPut(mine);
        }
      }
      await db.drafts.clear();
      await db.draftPages.clear();
    });
  } catch (error) {
    const name = (error as { name?: string; inner?: { name?: string } }).name;
    const inner = (error as { inner?: { name?: string } }).inner?.name;
    if (name === "QuotaExceededError" || inner === "QuotaExceededError")
      throw new StorageFullError(error);
    throw error;
  }
  if (typeof window !== "undefined") window.dispatchEvent(new Event(OUTBOX_CHANGED));
}
