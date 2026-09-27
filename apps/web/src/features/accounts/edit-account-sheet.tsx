"use client";

import { api } from "@mero-pasal/backend/convex/_generated/api";
import type { Id } from "@mero-pasal/backend/convex/_generated/dataModel";
import { Chip } from "@mero-pasal/ui/components/chip";
import { Sheet } from "@mero-pasal/ui/components/sheet";
import { useMutation } from "convex/react";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { PartyRow } from "@/features/capture/party-row";
import { useLocale } from "@/features/session/locale";
import { useCachedQuery } from "@/features/sync/use-cached-query";
import { useConnection } from "@/features/sync/use-connection";
import {
  type EditableAccount,
  type EditForm,
  errorKey,
  formOf,
  isChanged,
  type Kind,
  similarTo,
} from "./account-edit";
import { KIND_LABEL } from "./profile";

const field =
  "h-14 w-full rounded-xl border-2 border-rule bg-card px-3.5 text-[19px] text-ink focus:border-ink focus:outline-none";
const KINDS: Kind[] = ["customer", "supplier", "both"];

/**
 * F-07 / ADR-036: the owner (or admin) corrects an account's name, phone, tag and kind. Online
 * only (Convex would otherwise wait silently); a name close to another account's asks first,
 * since a merge (Binayak's job) may be what's wanted. The server re-derives both scripts.
 */
export function EditAccountSheet({
  open,
  account,
  onClose,
}: {
  open: boolean;
  account: EditableAccount;
  onClose: () => void;
}) {
  const { t } = useLocale();
  const router = useRouter();
  const online = useConnection();
  const update = useMutation(api.partyAdmin.update);
  const parties = useCachedQuery(api.parties.listForPicker, {}, "parties.listForPicker");
  const [form, setForm] = useState<EditForm>(() => formOf(account));
  const [keepName, setKeepName] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<ReturnType<typeof errorKey> | null>(null);

  const similar = similarTo(form, account, parties.data ?? []);
  const askSimilar = similar.length > 0 && !keepName;
  const ready = online && !saving && form.name.trim() !== "" && isChanged(form, account);
  const set = <K extends keyof EditForm>(key: K, value: EditForm[K]) =>
    setForm((f) => ({ ...f, [key]: value }));

  const save = async () => {
    setSaving(true);
    setError(null);
    try {
      await update({
        id: account._id as Id<"parties">,
        name: form.name,
        kind: form.kind,
        phone: form.phone,
        tag: form.tag,
      });
      onClose();
    } catch (e) {
      setError(errorKey(e));
    } finally {
      setSaving(false);
    }
  };

  return (
    <Sheet open={open} onClose={onClose} title={t("account.editTitle")}>
      {!online ? (
        <p
          role="status"
          className="mb-3 rounded-[14px] bg-udharo-tint p-3 font-semibold text-udharo-ink"
        >
          {t("account.needsInternet")}
        </p>
      ) : null}
      <label htmlFor="ea-name" className="mt-1 mb-1 block font-semibold text-ink-soft">
        {t("party.fieldName")}
      </label>
      <input
        id="ea-name"
        className={field}
        value={form.name}
        autoComplete="off"
        onChange={(e) => {
          set("name", e.target.value);
          setKeepName(false);
        }}
      />
      <p className="mt-1 text-[15px] text-ink-soft">{t("party.nameHint")}</p>

      {askSimilar ? (
        <div className="mt-3.5 rounded-[14px] bg-udharo-tint p-3" role="alert">
          <b className="mb-2 block">{t("party.similar")}</b>
          <div className="overflow-hidden rounded-xl bg-card">
            {similar.map((party) => (
              <PartyRow
                key={party._id}
                party={party}
                onPick={() => {
                  onClose();
                  router.push(`/accounts/${party._id}`); // see it side by side
                }}
              />
            ))}
          </div>
          <p className="mt-2 text-[15px] text-udharo-ink">{t("account.similarHint")}</p>
          <button
            type="button"
            onClick={() => setKeepName(true)}
            className="mt-2.5 min-h-14 w-full rounded-[14px] border-2 border-ink bg-card text-lg font-bold"
          >
            {t("account.similarKeep")}
          </button>
        </div>
      ) : null}

      <label htmlFor="ea-phone" className="mt-3 mb-1 block font-semibold text-ink-soft">
        {t("party.fieldPhone")}
      </label>
      <input
        id="ea-phone"
        className={field}
        inputMode="tel"
        autoComplete="off"
        value={form.phone}
        onChange={(e) => set("phone", e.target.value)}
      />
      <label htmlFor="ea-tag" className="mt-3 mb-1 block font-semibold text-ink-soft">
        {t("party.fieldTag")}
      </label>
      <input
        id="ea-tag"
        className={field}
        placeholder={t("party.fieldTagHint")}
        autoComplete="off"
        value={form.tag}
        onChange={(e) => set("tag", e.target.value)}
      />
      <p className="mt-3 mb-1 font-semibold text-ink-soft">{t("account.kind")}</p>
      <div className="flex flex-wrap gap-2">
        {KINDS.map((kind) => (
          <Chip key={kind} selected={form.kind === kind} onClick={() => set("kind", kind)}>
            {t(KIND_LABEL[kind])}
          </Chip>
        ))}
      </div>

      {error ? (
        <p role="alert" className="mt-3 font-semibold text-bahi">
          {t(error)}
        </p>
      ) : null}
      <button
        type="button"
        onClick={() => void save()}
        disabled={!ready || askSimilar}
        className="mt-4 min-h-16 w-full rounded-btn bg-ink font-display text-2xl font-bold text-white disabled:opacity-45"
      >
        {saving ? t("capture.saving") : t("account.editSave")}
      </button>
    </Sheet>
  );
}
