import { findSimilar, type Matchable } from "@mero-pasal/shared/names";

export type Kind = "customer" | "supplier" | "both";
export type EditForm = { name: string; phone: string; tag: string; kind: Kind };
export type EditableAccount = {
  _id: string;
  displayName: string;
  phone?: string;
  tag?: string;
  kind: Kind;
};

export function formOf(account: EditableAccount): EditForm {
  return {
    name: account.displayName,
    phone: account.phone ?? "",
    tag: account.tag ?? "",
    kind: account.kind,
  };
}

export function isChanged(form: EditForm, account: EditableAccount): boolean {
  const base = formOf(account);
  return (
    form.kind !== base.kind ||
    (["name", "phone", "tag"] as const).some((k) => form[k].trim() !== base[k].trim())
  );
}

/**
 * Other accounts whose name is close to the new one (ADR-036). Only when the name changed:
 * keeping a name as it is never warns. The account itself is never "similar" to itself.
 */
export function similarTo<T extends Matchable & { _id: string }>(
  form: EditForm,
  account: EditableAccount,
  parties: readonly T[],
): T[] {
  const name = form.name.trim();
  if (!name || name === account.displayName) return [];
  return findSimilar(
    name,
    parties.filter((p) => p._id !== account._id),
  );
}

/** The error message key for a failed save (the server's appError code). */
export function errorKey(
  error: unknown,
):
  | "error.FORBIDDEN"
  | "error.NOT_FOUND"
  | "error.VALIDATION"
  | "error.CONFLICT"
  | "error.UNAUTHENTICATED"
  | "error.unknown" {
  const code = (error as { data?: { code?: string } } | null)?.data?.code;
  switch (code) {
    case "FORBIDDEN":
    case "NOT_FOUND":
    case "VALIDATION":
    case "CONFLICT":
    case "UNAUTHENTICATED":
      return `error.${code}`;
    default:
      return "error.unknown";
  }
}
