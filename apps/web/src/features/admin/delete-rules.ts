// F-12 delete (ADR-037): the confirmation rules, kept apart from the dialog so they're tested.

/** From this many bills on, deleting asks for the account's name to be typed first. */
export const TYPE_NAME_FROM = 10;

export const needsTypedName = (billCount: number) => billCount >= TYPE_NAME_FROM;

const fold = (text: string) => text.trim().replace(/\s+/g, " ").toLowerCase();

/**
 * The typed text names this account: its name as written, or its Latin form (so a Devanagari
 * name can be confirmed from a Latin keyboard). Spaces and case don't matter.
 */
export function confirmsName(
  typed: string,
  account: { displayName: string; nameLatin: string },
): boolean {
  const text = fold(typed);
  return text !== "" && (text === fold(account.displayName) || text === fold(account.nameLatin));
}

export const deleteLabel = (billCount: number) =>
  billCount === 0
    ? "Delete account"
    : `Delete account and ${billCount} bill${billCount === 1 ? "" : "s"}`;
