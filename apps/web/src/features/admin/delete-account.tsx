"use client";

import { api } from "@mero-pasal/backend/convex/_generated/api";
import type { Id } from "@mero-pasal/backend/convex/_generated/dataModel";
import { useMutation } from "convex/react";
import { useEffect, useRef, useState } from "react";
import { useConnection } from "@/features/sync/use-connection";
import type { Account } from "./account-dialog";
import { confirmsName, deleteLabel, needsTypedName } from "./delete-rules";
import { rs } from "./format";
import { Button, inputClass, useShowError } from "./ui";

const billsText = (n: number) => `${n} bill${n === 1 ? "" : "s"}`;

/**
 * F-12 delete (ADR-037): says what goes with the account; from 10 bills on, its name must be
 * typed first. The account and its bills can be brought back later. Esc closes.
 */
export function DeleteAccountDialog({
  account,
  onClose,
}: {
  account: Account;
  onClose: () => void;
}) {
  const remove = useMutation(api.partyAdmin.deleteAccount);
  const showError = useShowError();
  const online = useConnection();
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    ref.current?.showModal();
  }, []);
  const [typed, setTyped] = useState("");
  const [busy, setBusy] = useState(false);
  const n = account.billCount;
  const askName = needsTypedName(n);
  const ready = online && !busy && (!askName || confirmsName(typed, account));

  return (
    <dialog
      ref={ref}
      aria-label="Delete account"
      onClose={onClose}
      className="m-auto w-[min(520px,100vw)] rounded-xl border border-rule bg-card p-0 shadow-sheet backdrop:bg-ink/40"
    >
      <form
        className="grid gap-3 p-4"
        onSubmit={async (e) => {
          e.preventDefault();
          if (!ready) return;
          setBusy(true);
          try {
            await remove({ id: account._id as Id<"parties"> });
            onClose();
          } catch (error) {
            showError(error);
            setBusy(false);
          }
        }}
      >
        <h2 className="font-display text-[19px] font-bold">Delete “{account.displayName}”?</h2>
        <p>
          {n === 0
            ? "It has no bills. It leaves the phone's name picker and every list."
            : `Its ${billsText(n)} (${rs(account.salePaisa)} sold, ${rs(account.purchasePaisa)} bought) will be removed from every list and total, on the phone too.`}
        </p>
        <p className="text-[13px] text-ink-soft">
          Nothing is erased. You can bring it back later from Accounts → Deleted. A bill saved on
          the phone for this account afterwards brings it back by itself.
        </p>
        {askName ? (
          <label className="grid gap-1 text-[13px] font-semibold text-ink-soft">
            Type “{account.nameLatin}” to confirm
            <input
              className={inputClass}
              value={typed}
              autoComplete="off"
              onChange={(e) => setTyped(e.target.value)}
            />
          </label>
        ) : null}
        {online ? null : (
          <p className="font-semibold text-bahi">Offline — changes can't be saved now.</p>
        )}
        <div className="flex justify-end gap-2">
          <Button tone="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button type="submit" tone="danger" disabled={!ready}>
            {busy ? "Deleting…" : deleteLabel(n)}
          </Button>
        </div>
      </form>
    </dialog>
  );
}

/** A delete still removing bills: running, or stuck after a failed batch. Retry continues it. */
export function DeletingCell({ id }: { id: string }) {
  const remove = useMutation(api.partyAdmin.deleteAccount);
  const showError = useShowError();
  const online = useConnection();
  return (
    <span className="flex items-center gap-2">
      <span className="font-semibold text-bahi">Deleting…</span>
      <Button
        tone="ghost"
        className="h-8"
        disabled={!online}
        onClick={(e) => {
          e.stopPropagation();
          remove({ id: id as Id<"parties"> }).catch(showError);
        }}
      >
        Retry
      </Button>
    </span>
  );
}

/**
 * Bring the account back with the bills its delete removed (bills removed one by one stay
 * removed). Also finishes the job when a new bill brought the account back on its own.
 */
export function BringBackButton({
  id,
  name,
  count,
  label = "Bring back",
}: {
  id: string;
  name: string;
  count: number;
  label?: string;
}) {
  const restore = useMutation(api.partyAdmin.restoreAccount);
  const showError = useShowError();
  const online = useConnection();
  return (
    <Button
      tone="primary"
      className="h-8"
      disabled={!online}
      onClick={() => {
        if (window.confirm(`Bring back ${name} and ${billsText(count)} removed with it?`)) {
          restore({ id: id as Id<"parties"> }).catch(showError);
        }
      }}
    >
      {label}
    </Button>
  );
}
