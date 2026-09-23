import type { MeroPasalDb, OutboxRow } from "./db";
import type { OutboxItem } from "./outbox";

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
  items: readonly OutboxItem[],
  owner: { memberId: string; clerkId: string },
  now: number,
): Promise<void> {
  const rows: OutboxRow[] = [...items]
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
    await db.transaction("rw", db.outbox, db.drafts, db.draftPages, async () => {
      for (const row of rows) {
        // Re-saving the same bill (e.g. a double tap) must not queue it twice.
        if ((await db.outbox.where("clientId").equals(row.clientId).count()) === 0) {
          await db.outbox.add(row);
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
