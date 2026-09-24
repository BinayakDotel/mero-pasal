import { UNDO_WINDOW_MS } from "@mero-pasal/shared/domain";
import type { MeroPasalDb, OutboxRow } from "./db";
import { type BillBefore, billOf, type PartyCreateItem, type TxCorrectItem } from "./outbox";
import { OUTBOX_CHANGED } from "./outbox-store";

// F-08 on the phone (ADR-011): corrections and removals are outbox items like bills. Unlike
// enqueueDurable, these never touch the unfinished-bill draft.

type Owner = { memberId: string; clerkId: string };
type Values = Omit<TxCorrectItem["payload"], "billClientId">;

const notSentYet = (r: OutboxRow) => r.status === "pending" || r.status === "failed";

function changed() {
  if (typeof window !== "undefined") window.dispatchEvent(new Event(OUTBOX_CHANGED));
}

/**
 * Correct a bill to these values. A bill (or an earlier correction) still waiting on the phone is
 * changed in place, so nothing extra is sent; otherwise a tx.correct queues behind the bill.
 * `newParty`: a name added while correcting; it's queued first, and a bill still on the phone is
 * re-queued after it, so the server gets the name before anything that uses it.
 * Returns where the change went.
 */
export async function enqueueCorrect(
  db: MeroPasalDb,
  billClientId: string,
  values: Values,
  before: BillBefore,
  owner: Owner,
  now: number,
  newParty?: PartyCreateItem,
): Promise<"inPlace" | "queued"> {
  const mine = { status: "pending" as const, nextAttemptAt: 0, failures: 0 };
  const ownedBy = { ownerMemberId: owner.memberId, ownerClerkId: owner.clerkId };
  const where = await db.transaction("rw", db.outbox, async () => {
    if (newParty && !(await db.outbox.where("clientId").equals(newParty.clientId).count())) {
      const nameRow: OutboxRow = {
        ...newParty,
        createdAt: newParty.createdAt || now,
        ...mine,
        ...ownedBy,
      };
      await db.outbox.add(nameRow);
    }
    const related = (await db.outbox.toArray()).filter((r) => billOf(r) === billClientId);
    const create = related.find((r) => r.type === "tx.create");
    // In place only if the server can't have it yet (a submitted create would ignore new values).
    if (create?.type === "tx.create" && notSentYet(create) && !create.submitted) {
      if (newParty) {
        // Re-queue the bill behind its new name (a fresh seq); it hasn't been sent, so it's safe.
        const { seq, ...row } = create;
        const { partyRef: _oldParty, amountPaisa: _oldAmount, ...kept } = create.payload;
        await db.outbox.delete(seq as number);
        await db.outbox.add({ ...row, payload: { ...kept, ...values }, ...mine });
        return "inPlace" as const;
      }
      await db.outbox
        .where("seq")
        .equals(create.seq as number)
        .modify((r) => {
          if (r.type !== "tx.create") return;
          const { partyRef: _oldParty, amountPaisa: _oldAmount, ...kept } = r.payload;
          r.payload = { ...kept, ...values }; // values carry partyRef/amountPaisa only when set
          r.status = "pending";
          r.failures = 0;
          r.nextAttemptAt = 0;
        });
      return "inPlace" as const;
    }
    const waiting = related.find((r) => r.type === "tx.correct" && r.status === "pending");
    // With a new name, a new correction goes after it instead of updating an earlier one.
    if (waiting && !newParty) {
      await db.outbox
        .where("seq")
        .equals(waiting.seq as number)
        .modify((r) => {
          if (r.type === "tx.correct") r.payload = { billClientId, ...values };
        });
      return "inPlace" as const;
    }
    const item: OutboxRow = {
      type: "tx.correct",
      clientId: crypto.randomUUID(),
      createdAt: now,
      attempts: 0,
      payload: { billClientId, ...values },
      before,
      status: "pending",
      nextAttemptAt: 0,
      failures: 0,
      ownerMemberId: owner.memberId,
      ownerClerkId: owner.clerkId,
    };
    await db.outbox.add(item);
    return "queued" as const;
  });
  changed();
  return where;
}

/**
 * Remove a bill: queued to send after the 6 s undo window (F-08). Returns the removal's id for
 * `undoRemove`. A bill that never left the phone is dropped by the engine when the window ends.
 */
export async function enqueueRemove(
  db: MeroPasalDb,
  billClientId: string,
  before: BillBefore,
  owner: Owner,
  now: number,
): Promise<string> {
  const clientId = crypto.randomUUID();
  const item: OutboxRow = {
    type: "tx.remove",
    clientId,
    createdAt: now,
    attempts: 0,
    payload: { billClientId },
    before,
    status: "pending",
    nextAttemptAt: now + UNDO_WINDOW_MS,
    failures: 0,
    ownerMemberId: owner.memberId,
    ownerClerkId: owner.clerkId,
  };
  await db.outbox.add(item);
  changed();
  return clientId;
}

/** फर्काउनुहोस्: cancel a removal that hasn't been sent. False if it's already on its way. */
export async function undoRemove(db: MeroPasalDb, removalClientId: string): Promise<boolean> {
  const undone = await db.transaction("rw", db.outbox, async () => {
    const r = await db.outbox.where("clientId").equals(removalClientId).first();
    if (r?.type !== "tx.remove" || r.status !== "pending") return false;
    await db.outbox.delete(r.seq as number);
    return true;
  });
  if (undone) changed();
  return undone;
}
