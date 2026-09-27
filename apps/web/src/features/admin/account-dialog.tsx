"use client";

import { api } from "@mero-pasal/backend/convex/_generated/api";
import type { Id } from "@mero-pasal/backend/convex/_generated/dataModel";
import { useMutation } from "convex/react";
import type { FunctionReturnType } from "convex/server";
import { useEffect, useRef, useState } from "react";
import { useConnection } from "@/features/sync/use-connection";
import { Button, inputClass, useShowError } from "./ui";

export type Account = FunctionReturnType<typeof api.partyAdmin.list>[number];
type Kind = Account["kind"];

const KINDS: [Kind, string][] = [
  ["customer", "Customer"],
  ["supplier", "Supplier"],
  ["both", "Both"],
];

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    // biome-ignore lint/a11y/noLabelWithoutControl: the control is the child
    <label className="grid gap-1 text-[13px] font-semibold text-ink-soft">
      {label}
      {children}
    </label>
  );
}

/**
 * F-12 edit an account: name (both scripts are worked out from it), kind, tag, phone, PAN;
 * archive or bring back; or merge it into another account (its bills move, nothing is deleted).
 * Esc closes (native modal dialog).
 */
export function AccountDialog({
  account,
  accounts,
  onClose,
}: {
  account: Account;
  accounts: readonly Account[];
  onClose: () => void;
}) {
  const update = useMutation(api.partyAdmin.update);
  const setArchived = useMutation(api.partyAdmin.setArchived);
  const merge = useMutation(api.partyAdmin.merge);
  const showError = useShowError();
  const online = useConnection();
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    ref.current?.showModal();
  }, []);

  const [form, setForm] = useState({
    name: account.displayName,
    kind: account.kind,
    tag: account.tag ?? "",
    phone: account.phone ?? "",
    pan: account.pan ?? "",
  });
  const [into, setInto] = useState("");
  const [busy, setBusy] = useState(false);
  const dirty =
    form.name.trim() !== account.displayName ||
    form.kind !== account.kind ||
    form.tag.trim() !== (account.tag ?? "") ||
    form.phone.trim() !== (account.phone ?? "") ||
    form.pan.trim() !== (account.pan ?? "");
  const targets = accounts
    .filter(
      (p) =>
        p._id !== account._id &&
        !p.isWalkIn &&
        !p.mergedIntoId &&
        !p.mergingInto &&
        p.deletedAt === undefined &&
        p.deletingAt === undefined,
    )
    .sort((a, b) => a.displayName.localeCompare(b.displayName));
  const target = targets.find((p) => p._id === into);

  const run = async (action: () => Promise<unknown>, close = false) => {
    setBusy(true);
    try {
      await action();
      if (close) onClose();
    } catch (e) {
      showError(e);
    } finally {
      setBusy(false);
    }
  };

  return (
    <dialog
      ref={ref}
      aria-label={`Account ${account.displayName}`}
      onClose={onClose}
      className="m-auto w-[min(560px,100vw)] rounded-xl border border-rule bg-card p-0 shadow-sheet backdrop:bg-ink/40"
    >
      <div className="flex items-center gap-3 border-b-2 border-ink px-4 py-3">
        <h2 className="flex-1 font-display text-[19px] font-bold">{account.displayName}</h2>
        <Button tone="ghost" onClick={onClose} aria-label="Close">
          Esc
        </Button>
      </div>
      <form
        className="grid gap-3 p-4"
        onSubmit={(e) => {
          e.preventDefault();
          void run(
            () =>
              update({
                id: account._id,
                name: form.name,
                kind: form.kind,
                tag: form.tag,
                phone: form.phone,
                pan: form.pan,
              }),
            true,
          );
        }}
      >
        <Field label="Name (as Buwa writes it; the other script is worked out)">
          <input
            className={inputClass}
            value={form.name}
            onChange={(e) => setForm({ ...form, name: e.target.value })}
          />
        </Field>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Kind">
            <select
              className={inputClass}
              value={form.kind}
              onChange={(e) => setForm({ ...form, kind: e.target.value as Kind })}
            >
              {KINDS.map(([value, label]) => (
                <option key={value} value={value}>
                  {label}
                </option>
              ))}
            </select>
          </Field>
          <Field label="Tag">
            <input
              className={inputClass}
              value={form.tag}
              onChange={(e) => setForm({ ...form, tag: e.target.value })}
            />
          </Field>
          <Field label="Phone">
            <input
              className={inputClass}
              inputMode="tel"
              value={form.phone}
              onChange={(e) => setForm({ ...form, phone: e.target.value })}
            />
          </Field>
          <Field label="PAN">
            <input
              className={inputClass}
              value={form.pan}
              onChange={(e) => setForm({ ...form, pan: e.target.value })}
            />
          </Field>
        </div>
        <div className="flex gap-2">
          <Button type="submit" tone="primary" disabled={!dirty || busy || !online}>
            Save
          </Button>
          <Button
            type="button"
            disabled={busy || !online}
            onClick={() =>
              void run(() => setArchived({ id: account._id, archived: !account.archived }), true)
            }
          >
            {account.archived ? "Bring back" : "Archive"}
          </Button>
        </div>
        <p className="text-[13px] text-ink-soft">
          Archived accounts leave the phone's name picker; their bills stay.
        </p>
      </form>
      <section className="grid gap-2 border-t border-rule p-4">
        <h3 className="font-bold">Merge into another account</h3>
        <div className="flex gap-2">
          <select
            aria-label="Merge into"
            className={`${inputClass} flex-1`}
            value={into}
            onChange={(e) => setInto(e.target.value)}
          >
            <option value="">Choose the account to keep…</option>
            {targets.map((p) => (
              <option key={p._id} value={p._id}>
                {p.displayName}
                {p.tag ? ` · ${p.tag}` : ""} ({p.billCount} bills)
              </option>
            ))}
          </select>
          <Button
            tone="danger"
            disabled={!target || busy || !online}
            onClick={() => {
              if (!target) return;
              const ok = window.confirm(
                `Merge "${account.displayName}" into "${target.displayName}"? Its ${account.billCount} bills move to "${target.displayName}"; nothing is deleted.`,
              );
              if (ok)
                void run(
                  () => merge({ keepId: target._id as Id<"parties">, mergeId: account._id }),
                  true,
                );
            }}
          >
            Merge
          </Button>
        </div>
      </section>
    </dialog>
  );
}
