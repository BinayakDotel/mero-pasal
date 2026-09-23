import type { DraftPageRow, DraftRow, MeroPasalDb } from "./db";

// F-03 draft restore (plan M2 PR 4): the unfinished bill lives on the phone, so a killed Chrome
// tab loses nothing. Small fields in one row; page photos in their own rows, written once each.
// A draft is deleted only by Save (inside enqueueDurable's transaction) or by Discard.

export type DraftMeta = Omit<DraftRow, "id" | "savedAt">;

/** Save the draft's small fields, unless that bill has already been queued (a late write). */
export async function writeDraft(db: MeroPasalDb, meta: DraftMeta, now: number): Promise<void> {
  await db.transaction("rw", db.drafts, db.outbox, async () => {
    if ((await db.outbox.where("clientId").equals(meta.clientId).count()) > 0) return;
    await db.drafts.put({ ...meta, id: "current", savedAt: now });
  });
}

/** Save or update one page (raw photo first; the processed versions replace it later). */
export async function writeDraftPage(db: MeroPasalDb, page: DraftPageRow): Promise<void> {
  await db.draftPages.put(page);
}

export async function removeDraftPages(db: MeroPasalDb, ids: readonly string[]): Promise<void> {
  if (ids.length) await db.draftPages.bulkDelete([...ids]);
}

/** The draft, if every one of its pages is on the phone. */
export async function readDraft(
  db: MeroPasalDb,
): Promise<{ draft: DraftRow; pages: DraftPageRow[] } | null> {
  const draft = await db.drafts.get("current");
  if (!draft) return null;
  const pages = await db.draftPages.bulkGet(draft.pageIds);
  if (pages.some((p) => !p || (!p.raw && !p.full))) return null;
  return { draft, pages: pages as DraftPageRow[] };
}

/** Discard (F-03 "हटाउनुहोस्"): the draft and its photos are gone. */
export async function discardDraft(db: MeroPasalDb): Promise<void> {
  await db.transaction("rw", db.drafts, db.draftPages, async () => {
    await db.drafts.clear();
    await db.draftPages.clear();
  });
}
