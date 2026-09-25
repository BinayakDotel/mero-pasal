import { isValidBs } from "@mero-pasal/shared/dates";
import { rupeesToPaisa } from "@mero-pasal/shared/money";

/** What the drawer shows for a bill (a subset of transactions.get). */
export type DrawerBill = {
  clientId: string;
  kind: "sale" | "purchase";
  partyId?: string;
  amountPaisa?: number;
  dateBs: string;
  billNumber?: string;
  note?: string;
  updatedAt: number;
};

export type BillForm = {
  kind: "sale" | "purchase";
  partyId: string; // "" = no name
  rupees: string; // "" = no amount
  dateBs: string;
  billNumber: string;
  note: string;
};

export type SaveArgs = {
  clientId: string;
  kind: "sale" | "purchase";
  partyId?: string;
  amountPaisa?: number;
  dateBs: string;
  billNumber: string;
  note: string;
  expectedUpdatedAt: number;
};

/** Rupees as typed: whole rupees plainly; an old amount with paisa keeps them. */
const shownRupees = (paisa: number | undefined) =>
  paisa === undefined ? "" : paisa % 100 === 0 ? String(paisa / 100) : (paisa / 100).toFixed(2);

export function formFromBill(bill: DrawerBill): BillForm {
  return {
    kind: bill.kind,
    partyId: bill.partyId ?? "",
    rupees: shownRupees(bill.amountPaisa),
    dateBs: bill.dateBs,
    billNumber: bill.billNumber ?? "",
    note: bill.note ?? "",
  };
}

export function isDirty(form: BillForm, bill: DrawerBill): boolean {
  const base = formFromBill(bill);
  return (Object.keys(base) as (keyof BillForm)[]).some((k) => form[k].trim() !== base[k].trim());
}

/**
 * Whether the drawer moves on to a newer version of the bill: yes when the form has no edits, or
 * already shows the new values (this admin's own save). Otherwise it keeps the edits against the
 * old version (the server refuses that save with CONFLICT) and says the bill changed.
 */
export function adoptsNewVersion(form: BillForm, base: DrawerBill, live: DrawerBill): boolean {
  if (live.updatedAt === base.updatedAt) return false;
  return !isDirty(form, base) || !isDirty(form, live);
}

/**
 * The form as billAdmin.update args: the full values (no account = no name, no amount = none),
 * against the version the form was built from. Amounts are whole rupees (ADR-007); an old amount
 * with paisa is sent back unchanged unless it was edited.
 */
export function saveArgs(
  form: BillForm,
  bill: DrawerBill,
): { ok: true; args: SaveArgs } | { ok: false; error: string } {
  const rupees = form.rupees.trim();
  let amountPaisa: number | undefined;
  if (rupees === shownRupees(bill.amountPaisa)) amountPaisa = bill.amountPaisa;
  else if (rupees === "") amountPaisa = undefined;
  else if (/^\d{1,9}$/.test(rupees)) amountPaisa = rupeesToPaisa(Number(rupees));
  else return { ok: false, error: "Amount: whole rupees only" };
  const dateBs = form.dateBs.trim();
  if (!isValidBs(dateBs)) return { ok: false, error: "Date: a real BS date, like 2083-06-01" };
  return {
    ok: true,
    args: {
      clientId: bill.clientId,
      kind: form.kind,
      ...(form.partyId ? { partyId: form.partyId } : {}),
      ...(amountPaisa === undefined ? {} : { amountPaisa }),
      dateBs,
      billNumber: form.billNumber,
      note: form.note,
      expectedUpdatedAt: bill.updatedAt,
    },
  };
}
