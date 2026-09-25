"use client";

import { api } from "@mero-pasal/backend/convex/_generated/api";
import type { Id } from "@mero-pasal/backend/convex/_generated/dataModel";
import { useMutation, useQuery } from "convex/react";
import type { FunctionReturnType } from "convex/server";
import { useEffect, useState } from "react";
import { PhotoViewer } from "@/features/bills/photo-viewer";
import { useConnection } from "@/features/sync/use-connection";
import { accountsFor } from "./attention";
import { adoptsNewVersion, type BillForm, formFromBill, isDirty, saveArgs } from "./bill-form";
import { whenNpt } from "./format";
import { Button, inputClass, useShowError } from "./ui";

type Bill = NonNullable<FunctionReturnType<typeof api.transactions.get>>;

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    // biome-ignore lint/a11y/noLabelWithoutControl: the control is the child
    <label className="grid gap-1 text-[13px] font-semibold text-ink-soft">
      {label}
      {children}
    </label>
  );
}

/** The editable fields, built from one version of the bill (`base`) and saved against it. */
function EditForm({
  base,
  live,
  form,
  setForm,
}: {
  base: Bill;
  live: Bill;
  form: BillForm;
  setForm: React.Dispatch<React.SetStateAction<BillForm>>;
}) {
  const update = useMutation(api.billAdmin.update);
  const accounts = useQuery(api.partyAdmin.list, {});
  const showError = useShowError();
  const online = useConnection();
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const set = <K extends keyof BillForm>(key: K, value: BillForm[K]) =>
    setForm((f) => ({ ...f, [key]: value }));
  const dirty = isDirty(form, base);
  const changedMeanwhile = live.updatedAt !== base.updatedAt;
  const removed = live.status === "deleted";

  const options = accountsFor(form.kind, accounts);
  const current = accounts?.find((p) => p._id === form.partyId);
  const choices = current && !options.includes(current) ? [current, ...options] : options;

  const save = async () => {
    const got = saveArgs(form, base);
    if (!got.ok) {
      setError(got.error);
      return;
    }
    setError(null);
    setSaving(true);
    try {
      const { partyId, ...rest } = got.args;
      await update({ ...rest, ...(partyId ? { partyId: partyId as Id<"parties"> } : {}) });
    } catch (e) {
      showError(e);
    } finally {
      setSaving(false);
    }
  };

  return (
    <form
      className="grid gap-3"
      onSubmit={(e) => {
        e.preventDefault();
        void save();
      }}
    >
      {changedMeanwhile ? (
        <p role="status" className="rounded-lg bg-bahi/10 px-3 py-2 font-semibold text-bahi">
          This bill changed since you opened it. Reset to see the new values.
        </p>
      ) : null}
      <div className="grid grid-cols-2 gap-3">
        <Field label="Type">
          <select
            className={inputClass}
            value={form.kind}
            onChange={(e) => set("kind", e.target.value as BillForm["kind"])}
          >
            <option value="sale">Sold</option>
            <option value="purchase">Bought</option>
          </select>
        </Field>
        <Field label="Date (BS)">
          <input
            className={inputClass}
            value={form.dateBs}
            onChange={(e) => set("dateBs", e.target.value)}
          />
        </Field>
        <Field label="Account">
          <select
            className={inputClass}
            value={form.partyId}
            onChange={(e) => set("partyId", e.target.value)}
          >
            <option value="">— No name —</option>
            {choices.map((p) => (
              <option key={p._id} value={p._id}>
                {p.displayName}
                {p.tag ? ` · ${p.tag}` : ""}
              </option>
            ))}
          </select>
        </Field>
        <Field label="Amount (Rs)">
          <input
            className={inputClass}
            inputMode="numeric"
            placeholder="none"
            value={form.rupees}
            onChange={(e) => set("rupees", e.target.value)}
          />
        </Field>
        <Field label="Bill number">
          <input
            className={inputClass}
            value={form.billNumber}
            onChange={(e) => set("billNumber", e.target.value)}
          />
        </Field>
      </div>
      <Field label="Note">
        <textarea
          className={`${inputClass} h-auto min-h-16 py-2`}
          value={form.note}
          onChange={(e) => set("note", e.target.value)}
        />
      </Field>
      {error ? (
        <p role="alert" className="font-semibold text-bahi">
          {error}
        </p>
      ) : null}
      <div className="flex gap-2">
        <Button
          type="submit"
          tone="primary"
          disabled={!dirty || saving || !online || removed || changedMeanwhile}
        >
          {saving ? "Saving…" : "Save"}
        </Button>
        <Button
          type="button"
          tone="ghost"
          disabled={!dirty || saving}
          onClick={() => setForm(formFromBill(live))}
        >
          Reset
        </Button>
      </div>
      {removed ? <p className="text-[13px] text-ink-soft">Restore the bill to edit it.</p> : null}
    </form>
  );
}

/**
 * F-11 bill drawer: the photo (zoom), the editable fields including bill number and note, remove
 * or restore, and the bill's history (F-15). Esc closes. Admin writes are online-only (ADR-034).
 */
export function BillDrawer({ clientId, onClose }: { clientId: string; onClose: () => void }) {
  const live = useQuery(api.transactions.get, { clientId });
  const history = useQuery(
    api.audit.listForEntity,
    live ? { entity: "transaction", entityId: live._id } : "skip",
  );
  const remove = useMutation(api.transactions.remove);
  const restore = useMutation(api.transactions.restore);
  const showError = useShowError();
  const online = useConnection();

  // The version the form edits, taken when the bill opens. A newer version replaces it when the
  // form has no edits, or already shows the new values (this admin's own save); otherwise the
  // form keeps the edits and says the bill changed, and Save is refused by the server anyway.
  const [base, setBase] = useState<Bill | null>(null);
  const [form, setForm] = useState<BillForm | null>(null);
  if (live && (!base || !form)) {
    setBase(live);
    setForm(formFromBill(live));
  } else if (live && base && form && adoptsNewVersion(form, base, live)) {
    setBase(live);
    setForm(formFromBill(live));
  }

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  return (
    <aside
      aria-label="Bill"
      className="fixed top-0 right-0 z-40 flex h-dvh w-[min(560px,100vw)] flex-col overflow-y-auto border-l border-rule bg-card shadow-sheet"
    >
      <div className="flex items-center gap-3 border-b-2 border-ink px-4 py-3">
        <h2 className="flex-1 font-display text-[19px] font-bold">
          {live ? `${live.kind === "sale" ? "Sold" : "Bought"} · ${live.dateBs}` : "Bill"}
          {live?.status === "deleted" ? <span className="ml-2 text-bahi">removed</span> : null}
        </h2>
        <Button tone="ghost" onClick={onClose} aria-label="Close">
          Esc
        </Button>
      </div>
      {live === undefined ? (
        <div
          aria-busy="true"
          className="m-4 h-80 animate-pulse rounded-xl bg-rule/60 motion-reduce:animate-none"
        />
      ) : live === null ? (
        <p className="p-4">This bill isn't on the server.</p>
      ) : (
        <div className="grid gap-4 p-4">
          <div className="h-[380px] overflow-hidden rounded-xl bg-ink">
            <PhotoViewer urls={live.photos.map((p) => p.url ?? p.thumbUrl)} />
          </div>
          <p className="text-[13px] text-ink-soft">
            Captured by {live.capturedByName} · {whenNpt(live.capturedAt)} · {live.photos.length}{" "}
            page{live.photos.length === 1 ? "" : "s"}
          </p>
          {base && form ? (
            <EditForm
              base={base}
              live={live}
              form={form}
              setForm={setForm as React.Dispatch<React.SetStateAction<BillForm>>}
            />
          ) : null}
          <div className="flex gap-2 border-t border-rule pt-3">
            {live.status === "deleted" ? (
              <Button
                tone="sale"
                disabled={!online}
                onClick={() => restore({ clientId }).catch(showError)}
              >
                Restore
              </Button>
            ) : (
              <Button
                tone="danger"
                disabled={!online}
                onClick={() => {
                  if (
                    !window.confirm(
                      "Remove this bill? It leaves lists and totals; you can restore it here.",
                    )
                  )
                    return;
                  remove({ clientId }).catch(showError);
                }}
              >
                Remove
              </Button>
            )}
          </div>
          <section>
            <h3 className="mb-2 font-bold">History</h3>
            {history === undefined ? (
              <p className="text-ink-soft">Loading…</p>
            ) : history.length === 0 ? (
              <p className="text-ink-soft">No history.</p>
            ) : (
              <ol className="grid gap-2">
                {history.map((h, i) => (
                  // biome-ignore lint/suspicious/noArrayIndexKey: an append-only log, newest first
                  <li key={i} className="border-b border-rule/70 pb-2 text-[14px]">
                    <b>{h.actorName || "—"}</b> · {whenNpt(h.at)} · <code>{h.action}</code>
                    <div className="text-ink-soft">{h.summary}</div>
                  </li>
                ))}
              </ol>
            )}
          </section>
        </div>
      )}
    </aside>
  );
}
