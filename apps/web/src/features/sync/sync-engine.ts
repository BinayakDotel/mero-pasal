import { UNDO_WINDOW_MS } from "@mero-pasal/shared/domain";
import type { MeroPasalDb, OutboxRow } from "./db";
import { billOf, type OutboxDeps, processItem } from "./outbox";

// F-09 sync engine (architecture §8.2–8.3). Sends the phone's outbox to the server, oldest first
// (names before the bills that use them), exactly once per item (server de-duplicates by
// clientId; upload progress is persisted after every upload).

/** Backoff after failures: 5 s, 30 s, 2 min, 10 min, then every 30 min. */
export const BACKOFF_MS = [5_000, 30_000, 120_000, 600_000, 1_800_000] as const;
export const MAX_FAILURES = 5;
const CONFLICT_RETRY_MS = 30_000;
/** Session expired or not allowed: wait for Clerk to refresh the token, then try again. */
const AUTH_RETRY_MS = 60_000;
export const DONE_BLOB_TTL_MS = 7 * 86_400_000;
export const DONE_ROW_TTL_MS = 30 * 86_400_000;

export type ErrorClass = "network" | "auth" | "conflict" | "notFound" | "other";

/** Map a failure to what the engine should do (§8.3). */
export function classify(error: unknown): ErrorClass {
  if (error instanceof TypeError) return "network"; // fetch() dropped (upload)
  const data = (error as { data?: { code?: string; reason?: string } } | null)?.data;
  const code = data?.code;
  // A bill this member may never change is a rejection of that item, not a sign-in problem.
  if (code === "FORBIDDEN" && data?.reason === "NOT_EDITABLE") return "other";
  if (code === "UNAUTHENTICATED" || code === "FORBIDDEN") return "auth";
  if (code === "CONFLICT") return "conflict";
  if (code === "NOT_FOUND") return "notFound";
  return "other";
}

export function backoff(streak: number): number {
  return BACKOFF_MS[Math.min(Math.max(streak, 1), BACKOFF_MS.length) - 1] as number;
}

export type EngineEnv = {
  db: MeroPasalDb;
  deps: OutboxDeps;
  now: () => number;
  /** Is the Convex connection up? (Convex mutations wait rather than fail while offline.) */
  isConnected: () => boolean;
  /** Who may send now: the member the server confirmed for this session, else null. */
  identity: () => { memberId: string; clerkId: string } | null;
  /**
   * Whose items the pill and heartbeat count: the member using the app, even before sending is
   * allowed (offline, sign-in loading). Defaults to `identity`.
   */
  owner?: () => { memberId: string; clerkId: string } | null;
  /** Cross-tab exclusivity: runs `fn` only if no other tab is syncing. */
  withLock: (fn: () => Promise<void>) => Promise<void>;
  /** After each pass: the outbox health for members.heartbeat and the pill. */
  onPass?: (report: PassReport) => void;
};

export type PassReport = {
  drained: boolean;
  pending: number;
  failed: number;
  oldestPendingAt?: number;
  foreignPending: number;
  pausedUntil: number;
  pauseReason: "none" | "network" | "auth";
  /** The earliest time a waiting item of this member becomes due (e.g. a removal's undo window). */
  nextDueAt?: number;
};

export class SyncEngine {
  private running: Promise<void> | null = null;
  private rerun = false;
  private pausedUntil = 0;
  private pauseReason: PassReport["pauseReason"] = "none";
  private networkStreak = 0;
  /** Bumped when sign-in comes back; an auth failure from a send started before it is stale. */
  private authEpoch = 0;
  /** clientIds confirmed by the server this session (instant, before the Dexie write lands). */
  readonly confirmed = new Set<string>();

  constructor(private readonly env: EngineEnv) {}

  /** Ask for a pass (enqueue, app open, back online, visible, timer). Never overlaps. */
  kick(): Promise<void> {
    if (this.running) {
      this.rerun = true;
      return this.running;
    }
    this.running = (async () => {
      try {
        do {
          this.rerun = false;
          await this.env.withLock(() => this.pass());
        } while (this.rerun);
      } finally {
        this.running = null;
      }
    })();
    return this.running;
  }

  /**
   * The connection is back (online event, Convex reconnected): end a network backoff now. Uploads
   * that failed while the Wi-Fi was coming back shouldn't make Buwa wait 30 s or 2 min more.
   */
  resumeAfterReconnect(): Promise<void> {
    if (this.pauseReason === "network") {
      this.pausedUntil = 0;
      this.pauseReason = "none";
      this.networkStreak = 0;
    }
    return this.kick();
  }

  /** Sign-in is back (Convex authenticated): end an auth pause now instead of waiting it out. */
  resumeAfterAuth(): Promise<void> {
    this.authEpoch += 1;
    if (this.pauseReason === "auth") {
      this.pausedUntil = 0;
      this.pauseReason = "none";
    }
    return this.kick();
  }

  /** "Try now" (F-09 sheet): clear the pause and give failed items a fresh start. */
  async retryNow(): Promise<void> {
    this.pausedUntil = 0;
    this.pauseReason = "none";
    this.networkStreak = 0;
    const { db } = this.env;
    await db.outbox
      .where("status")
      .anyOf("failed", "pending")
      .modify((row) => {
        row.status = "pending";
        // A removal still inside its 6 s undo window keeps it (F-08).
        row.nextAttemptAt = row.type === "tx.remove" ? row.createdAt + UNDO_WINDOW_MS : 0;
        row.failures = 0;
        delete row.lastError;
      });
    await this.kick();
  }

  private async pass(): Promise<void> {
    const { db, now } = this.env;
    // Holding the lock: rows left "uploading" by a killed tab are safe to resume.
    await db.outbox.where("status").equals("uploading").modify({ status: "pending" });

    while (this.canSend()) {
      const identity = this.env.identity();
      if (!identity) break;
      const row = await this.nextRow(identity.clerkId, now());
      if (!row) break;
      if (await this.droppedOnPhone(row, now())) continue;
      await this.send(row);
    }
    await this.purge(now());
    this.env.onPass?.(await this.report());
  }

  private canSend(): boolean {
    const { now, isConnected } = this.env;
    if (now() < this.pausedUntil) return false;
    if (!isConnected()) {
      this.pauseReason = "network";
      return false;
    }
    return true;
  }

  /**
   * Oldest due item of this member, except that changes to one bill go strictly in order: a row
   * waits while an earlier row for the same bill is still on its way (M3 corrections/removals).
   */
  private async nextRow(clerkId: string, now: number): Promise<OutboxRow | undefined> {
    const busy = new Set<string>();
    for (const r of await this.env.db.outbox.orderBy("seq").toArray()) {
      const bill = billOf(r);
      const due = r.status === "pending" && r.ownerClerkId === clerkId && r.nextAttemptAt <= now;
      if (due && !(bill && busy.has(bill))) return r;
      if (bill && (r.status === "pending" || r.status === "uploading")) busy.add(bill);
    }
    return undefined;
  }

  /**
   * Take the item for sending: re-read it and mark it uploading in one transaction, so what goes
   * out is exactly what's queued now (never a copy changed or undone since it was picked).
   */
  private async claim(seq: number, now: number): Promise<OutboxRow | undefined> {
    const { db } = this.env;
    return db.transaction("rw", db.outbox, async () => {
      const fresh = await db.outbox.get(seq);
      if (fresh?.status !== "pending" || fresh.nextAttemptAt > now) return undefined;
      await db.outbox.update(seq, { status: "uploading", attempts: fresh.attempts + 1 });
      return fresh;
    });
  }

  private async send(picked: OutboxRow): Promise<void> {
    const { db, deps, now } = this.env;
    const seq = picked.seq as number;
    const row = await this.claim(seq, now());
    if (!row) return; // changed, undone or dropped since it was picked
    const epoch = this.authEpoch;
    try {
      const one = () => db.outbox.where("seq").equals(seq);
      await processItem(row, deps, async (progress) => {
        if (progress.type !== "tx.create") return;
        await one().modify((stored) => {
          if (stored.type !== "tx.create") return;
          stored.pages = progress.pages;
          if (progress.submitted) stored.submitted = true;
        });
      });
      this.confirmed.add(row.clientId);
      await one().modify((stored) => {
        stored.status = "done";
        stored.doneAt = now();
        delete stored.lastError;
      });
      this.networkStreak = 0;
      this.pauseReason = "none";
    } catch (error) {
      await this.fail(row, error, epoch);
    }
  }

  private async fail(row: OutboxRow, error: unknown, epoch: number): Promise<void> {
    const { db, now } = this.env;
    const seq = row.seq as number;
    const message = error instanceof Error ? error.message : String(error);
    const errorClass = classify(error);
    // The server answered with a refusal, so its mutation rolled back: the bill isn't there.
    if (row.type === "tx.create" && errorClass !== "network") {
      await db.outbox
        .where("seq")
        .equals(seq)
        .modify((r) => {
          if (r.type === "tx.create") r.submitted = false;
        });
    }
    switch (errorClass) {
      case "network":
        this.networkStreak += 1;
        this.pausedUntil = now() + backoff(this.networkStreak);
        this.pauseReason = "network";
        await db.outbox.update(seq, { status: "pending", lastError: message });
        return;
      case "auth":
        // Sent before sign-in came back: retry on the rerun instead of pausing again.
        if (epoch === this.authEpoch) {
          this.pauseReason = "auth";
          this.pausedUntil = now() + AUTH_RETRY_MS;
        }
        await db.outbox.update(seq, { status: "pending", lastError: message });
        return;
      case "conflict": {
        // A bill (or correction) whose new name hasn't reached the server: wait for the name.
        const ref =
          row.type === "tx.create" || row.type === "tx.correct" ? row.payload.partyRef : undefined;
        if (ref && "clientId" in ref && (await this.waitFor(row, ref.clientId, "name", message)))
          return;
        break; // a real conflict: count it like any other rejection
      }
      case "notFound": {
        // M3: a correction or removal that got ahead of its bill: wait for the bill.
        const bill = row.type === "tx.create" ? undefined : billOf(row);
        if (bill && (await this.waitFor(row, bill, "bill", message))) return;
        break;
      }
      case "other":
        break;
    }
    const failures = row.failures + 1;
    await db.outbox.update(
      seq,
      failures >= MAX_FAILURES
        ? { status: "failed", failures, lastError: message }
        : {
            status: "pending",
            failures,
            nextAttemptAt: now() + backoff(failures),
            lastError: message,
          },
    );
  }

  /**
   * M3 / UC-07: a bill removed before it ever left the phone (its undo window over) never goes to
   * the server: the bill, its corrections and the removal are deleted here, photos never uploaded.
   */
  private async droppedOnPhone(row: OutboxRow, now: number): Promise<boolean> {
    const bill = billOf(row);
    if (!bill) return false;
    const { db } = this.env;
    return db.transaction("rw", db.outbox, async () => {
      const related = (await db.outbox.toArray()).filter((r) => billOf(r) === bill);
      const create = related.find((r) => r.type === "tx.create");
      const due = related.some(
        (r) => r.type === "tx.remove" && r.status === "pending" && r.nextAttemptAt <= now,
      );
      // A bill the server may already have (submitted) goes the normal way: sent, then removed.
      if (create?.type !== "tx.create" || create.status === "done" || create.submitted || !due)
        return false;
      await db.outbox.bulkDelete(related.map((r) => r.seq as number));
      return true;
    });
  }

  /**
   * `row` depends on the item `dependsOn` (a new name, or the bill a correction is about). While
   * that item is still on its way, wait without counting a failure; if it failed, this is BLOCKED.
   * Returns false when there's nothing to wait for (a real rejection).
   */
  private async waitFor(
    row: OutboxRow,
    dependsOn: string,
    what: "name" | "bill",
    message: string,
  ): Promise<boolean> {
    const { db, now } = this.env;
    const seq = row.seq as number;
    const other = await db.outbox.where("clientId").equals(dependsOn).first();
    if (other && other.status !== "done" && other.status !== "failed") {
      await db.outbox.update(seq, {
        status: "pending",
        nextAttemptAt: now() + CONFLICT_RETRY_MS,
        lastError: message,
      });
      return true;
    }
    if (other?.status === "failed") {
      await db.outbox.update(seq, {
        status: "failed",
        lastError: `BLOCKED: ${what} ${dependsOn} failed`,
      });
      return true;
    }
    return false;
  }

  /** §8.1: drop photos of sent items after 7 days, the rows after 30. Never touches unsent items. */
  private async purge(now: number): Promise<void> {
    const { db } = this.env;
    await db.outbox
      .where("status")
      .equals("done")
      .filter((r) => (r.doneAt ?? now) < now - DONE_ROW_TTL_MS)
      .delete();
    await db.outbox
      .where("status")
      .equals("done")
      .filter(
        (r) =>
          r.type === "tx.create" &&
          (r.doneAt ?? now) < now - DONE_BLOB_TTL_MS &&
          r.pages.some((p) => p.full.size > 0),
      )
      .modify((r) => {
        if (r.type !== "tx.create") return;
        r.pages = r.pages.map((p) => ({ ...p, full: new Blob([]), thumb: new Blob([]) }));
      });
  }

  async report(): Promise<PassReport> {
    const { db, identity, owner = identity } = this.env;
    const me = owner()?.clerkId;
    const open = await db.outbox.where("status").anyOf("pending", "uploading", "failed").toArray();
    const mine = open.filter((r) => r.ownerClerkId === me);
    const pending = mine.filter((r) => r.status !== "failed");
    const later = pending
      .filter((r) => r.status === "pending" && r.nextAttemptAt > this.env.now())
      .map((r) => r.nextAttemptAt);
    return {
      drained: pending.length === 0,
      pending: pending.length,
      failed: mine.length - pending.length,
      ...(pending.length ? { oldestPendingAt: Math.min(...pending.map((r) => r.createdAt)) } : {}),
      foreignPending: open.length - mine.length,
      pausedUntil: this.pausedUntil,
      pauseReason: this.pauseReason,
      ...(later.length ? { nextDueAt: Math.min(...later) } : {}),
    };
  }
}
