import { bsToAdMs, diffDaysBs, isValidBs, todayBs } from "@mero-pasal/shared/dates";
import { MAX_FUTURE_DAYS } from "@mero-pasal/shared/domain";
import { formatNpr } from "@mero-pasal/shared/money";
import { v } from "convex/values";
import type { Id } from "./_generated/dataModel";
import { billByClientId, resolveParty } from "./lib/bills";
import { appError } from "./lib/errors";
import { adminMutation } from "./lib/functions";
import { apply } from "./lib/ledger";

const MAX_BILL_NUMBER = 40;
const MAX_NOTE = 500;

/** "" and whitespace clear the field. */
function cleanText(value: string | undefined, max: number, label: string): string | undefined {
  const text = value?.trim();
  if (!text) return undefined;
  if (text.length > max) throw appError("VALIDATION", `${label} is too long`);
  return text;
}

/**
 * F-11 admin bill drawer: set a bill's type, account, amount and date (the full values) and,
 * when given, its bill number and note ("" clears; left out = unchanged, so an inline fix of
 * the amount never loses a note), through ledger.apply. Unlike Buwa's correct, admin may set any real past date
 * (cleaning up old bills), still never a future one. A removed bill must be restored first.
 * `expectedUpdatedAt` is the version the drawer showed: if the bill changed since (Buwa synced a
 * correction), the save is refused rather than silently undoing it.
 */
export const update = adminMutation({
  args: {
    clientId: v.string(),
    kind: v.union(v.literal("sale"), v.literal("purchase")),
    partyId: v.optional(v.id("parties")),
    dateBs: v.string(),
    amountPaisa: v.optional(v.number()),
    billNumber: v.optional(v.string()),
    note: v.optional(v.string()),
    expectedUpdatedAt: v.number(),
  },
  returns: v.id("transactions"),
  handler: async (ctx, args) => {
    const tx = await billByClientId(ctx, args.clientId);
    if (tx.updatedAt !== args.expectedUpdatedAt) {
      throw appError("CONFLICT", "This bill changed since you opened it; look again");
    }
    if (tx.status === "deleted") throw appError("CONFLICT", "Restore the bill before editing it");
    const amount = args.amountPaisa;
    if (amount !== undefined && (!Number.isSafeInteger(amount) || amount < 0)) {
      throw appError("VALIDATION", "amountPaisa must be a whole, non-negative number of paisa");
    }
    if (!isValidBs(args.dateBs)) throw appError("VALIDATION", "Not a real BS date");
    if (diffDaysBs(todayBs(Date.now()), args.dateBs) > MAX_FUTURE_DAYS) {
      throw appError("VALIDATION", "A bill can't be dated in the future");
    }
    const billNumber =
      args.billNumber === undefined
        ? tx.billNumber
        : cleanText(args.billNumber, MAX_BILL_NUMBER, "Bill number");
    const note = args.note === undefined ? tx.note : cleanText(args.note, MAX_NOTE, "Note");
    const party = args.partyId ? await resolveParty(ctx, { id: args.partyId }) : null;
    const partyId: Id<"parties"> | undefined = party?._id;

    const oldParty = tx.partyId ? await ctx.db.get(tx.partyId) : null;
    const money = (paisa: number | undefined) =>
      paisa === undefined ? "—" : formatNpr(paisa, { locale: "en" });
    const changes = [
      args.kind !== tx.kind && `type: ${tx.kind} → ${args.kind}`,
      partyId !== tx.partyId &&
        `account: ${oldParty?.displayName ?? "—"} → ${party?.displayName ?? "—"}`,
      amount !== tx.amountPaisa && `amount: ${money(tx.amountPaisa)} → ${money(amount)}`,
      args.dateBs !== tx.dateBs && `date: ${tx.dateBs} → ${args.dateBs}`,
      billNumber !== tx.billNumber && `bill number: ${tx.billNumber ?? "—"} → ${billNumber ?? "—"}`,
      note !== tx.note && "note changed",
    ].filter((c): c is string => typeof c === "string");
    if (changes.length === 0) return tx._id;

    const {
      _id,
      _creationTime,
      needsAttention,
      updatedAt,
      partyId: _p,
      amountPaisa: _a,
      billNumber: _b,
      note: _n,
      ...keep
    } = tx;
    return apply(
      ctx,
      tx,
      {
        ...keep,
        kind: args.kind,
        ...(partyId === undefined ? {} : { partyId }),
        ...(amount === undefined ? {} : { amountPaisa: amount }),
        ...(billNumber === undefined ? {} : { billNumber }),
        ...(note === undefined ? {} : { note }),
        dateBs: args.dateBs,
        dateAd: bsToAdMs(args.dateBs),
      },
      { actorId: ctx.member._id, action: "tx.adminUpdate", summary: changes.join(" · ") },
    );
  },
});
