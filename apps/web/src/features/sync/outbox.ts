// Buwa's writes go through the outbox (code-standard §5, architecture §8). An item is one write the
// server must receive exactly once, identified by its clientId (idempotent on the server).
//
// M1: `enqueue` sends immediately while online and resolves once the server has accepted every
// item. M2 swaps in a Dexie-backed queue + sync engine that calls the same `processItem`, and
// `enqueue` then resolves once the items are safely on the phone (NFR-02).

export type OutboxPage = {
  full: Blob;
  thumb: Blob;
  width: number;
  height: number;
  bytes: number;
  /** Set after upload, so a retry never uploads the same page twice (architecture §8.2). */
  storageId?: string;
  thumbId?: string;
};

export type PartyCreateItem = {
  type: "party.create";
  clientId: string;
  createdAt: number;
  attempts: number;
  payload: { name: string; kind: "customer" | "supplier"; phone?: string; tag?: string };
};

export type TxCreateItem = {
  type: "tx.create";
  clientId: string;
  createdAt: number;
  attempts: number;
  payload: {
    kind: "sale" | "purchase";
    partyRef?: { id: string } | { clientId: string };
    dateBs: string;
    amountPaisa?: number;
  };
  pages: OutboxPage[];
};

export type OutboxItem = PartyCreateItem | TxCreateItem;

/** The network side of sending, injected so it can be faked in tests (and reused by M2). */
export type OutboxDeps = {
  createParty: (args: { clientId: string } & PartyCreateItem["payload"]) => Promise<unknown>;
  generateUploadUrl: () => Promise<string>;
  upload: (url: string, blob: Blob) => Promise<string>;
  createTx: (
    args: { clientId: string } & TxCreateItem["payload"] & {
        photos: {
          storageId: string;
          thumbId: string;
          width: number;
          height: number;
          bytes: number;
        }[];
      },
  ) => Promise<unknown>;
};

/** Thrown when the phone has no connection; nothing was lost, the caller keeps the bill. */
export class OfflineError extends Error {
  constructor() {
    super("offline");
    this.name = "OfflineError";
  }
}

async function uploadOnce(deps: OutboxDeps, blob: Blob): Promise<string> {
  return deps.upload(await deps.generateUploadUrl(), blob);
}

/**
 * Sends one item. Safe to call again after any failure: uploaded pages are skipped and the server
 * de-duplicates by clientId. Mutates `item` to record progress (storageIds, attempts).
 */
export async function processItem(item: OutboxItem, deps: OutboxDeps): Promise<void> {
  item.attempts += 1;
  if (item.type === "party.create") {
    await deps.createParty({ clientId: item.clientId, ...item.payload });
    return;
  }
  for (const page of item.pages) {
    page.storageId ??= await uploadOnce(deps, page.full);
    page.thumbId ??= await uploadOnce(deps, page.thumb);
  }
  await deps.createTx({
    clientId: item.clientId,
    ...item.payload,
    photos: item.pages.map((p) => ({
      storageId: p.storageId as string,
      thumbId: p.thumbId as string,
      width: p.width,
      height: p.height,
      bytes: p.bytes,
    })),
  });
}

/** Parties first, so a bill never reaches the server before the new name it refers to (§8.2). */
export function orderForSending(items: readonly OutboxItem[]): OutboxItem[] {
  return [...items].sort((a, b) => Number(a.type === "tx.create") - Number(b.type === "tx.create"));
}

/**
 * M1 enqueue: send now, in order, stopping at the first failure. Items that already went through
 * are skipped on the next call (tracked by `done`), so retrying the same items is safe.
 */
export async function enqueue(
  items: readonly OutboxItem[],
  deps: OutboxDeps,
  isOnline: () => boolean = () => navigator.onLine,
  done: Set<string> = new Set(),
): Promise<void> {
  for (const item of orderForSending(items)) {
    if (done.has(item.clientId)) continue;
    if (!isOnline()) throw new OfflineError();
    try {
      await processItem(item, deps);
    } catch (error) {
      // fetch() rejects with a TypeError when the connection drops mid-way.
      if (error instanceof TypeError || !isOnline()) throw new OfflineError();
      throw error;
    }
    done.add(item.clientId);
  }
}
