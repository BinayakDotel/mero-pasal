"use client";

import { findSimilar } from "@mero-pasal/shared/names";
import { Sheet } from "@mero-pasal/ui/components/sheet";
import { useEffect, useMemo, useState } from "react";
import { useLocale } from "@/features/session/locale";
import { PartyRow } from "./party-row";
import type { PickerParty } from "./use-picker-parties";

const field =
  "h-14 w-full rounded-xl border-2 border-rule bg-card px-3.5 text-[19px] text-ink focus:border-ink focus:outline-none";

/**
 * F-04 new-name sheet (ui-ux §5.3): name (prefilled, focused), phone, tag. If the name is close to
 * an existing account, "यस्तै नाम पहिले नै छ" appears inside the sheet and must be answered:
 * हो, उही हो (use that account) or होइन, नयाँ बनाउनुहोस्. Nothing is saved to the server here;
 * the new account travels with the bill and is sent before it (M1 PR 11).
 */
export function NewNameSheet({
  open,
  initialName,
  parties,
  onClose,
  onUseExisting,
  onCreate,
}: {
  open: boolean;
  initialName: string;
  parties: readonly PickerParty[];
  onClose: () => void;
  onUseExisting: (party: PickerParty) => void;
  onCreate: (input: { displayName: string; phone?: string; tag?: string }) => void;
}) {
  const { t } = useLocale();
  const [name, setName] = useState(initialName);
  const [phone, setPhone] = useState("");
  const [tag, setTag] = useState("");
  const [confirmedNew, setConfirmedNew] = useState(false);

  useEffect(() => {
    if (open) {
      setName(initialName);
      setPhone("");
      setTag("");
      setConfirmedNew(false);
    }
  }, [open, initialName]);

  const trimmed = name.trim();
  const similar = useMemo(() => (trimmed ? findSimilar(trimmed, parties) : []), [trimmed, parties]);
  const askSame = similar.length > 0 && !confirmedNew;

  const create = () => {
    if (!trimmed) return;
    onCreate({
      displayName: trimmed,
      ...(phone.trim() ? { phone: phone.trim() } : {}),
      ...(tag.trim() ? { tag: tag.trim() } : {}),
    });
  };

  return (
    <Sheet open={open} onClose={onClose} title={t("party.newTitle")}>
      <label htmlFor="nn-name" className="mt-3 mb-1 block font-semibold text-ink-soft">
        {t("party.fieldName")}
      </label>
      <input
        id="nn-name"
        className={field}
        value={name}
        // biome-ignore lint/a11y/noAutofocus: F-04 — the keyboard should open straight away
        autoFocus
        autoComplete="off"
        onChange={(event) => {
          setName(event.target.value);
          setConfirmedNew(false);
        }}
      />
      <p className="mt-1 text-[15px] text-ink-soft">{t("party.nameHint")}</p>

      {askSame ? (
        <div className="mt-3.5 rounded-[14px] bg-udharo-tint p-3" role="alert">
          <b className="mb-2 block">{t("party.similar")}</b>
          <div className="overflow-hidden rounded-xl bg-card">
            {similar.map((party) => (
              <PartyRow key={party._id} party={party} onPick={() => onUseExisting(party)} />
            ))}
          </div>
          <div className="mt-2.5 grid gap-2">
            {similar.length === 1 && similar[0] ? (
              <button
                type="button"
                onClick={() => similar[0] && onUseExisting(similar[0])}
                className="min-h-14 rounded-[14px] bg-ink text-lg font-bold text-white"
              >
                {t("party.same")}
              </button>
            ) : null}
            <button
              type="button"
              onClick={() => setConfirmedNew(true)}
              className="min-h-14 rounded-[14px] border-2 border-ink bg-card text-lg font-bold"
            >
              {t("party.new")}
            </button>
          </div>
        </div>
      ) : null}

      <label htmlFor="nn-phone" className="mt-3 mb-1 block font-semibold text-ink-soft">
        {t("party.fieldPhone")}
      </label>
      <input
        id="nn-phone"
        className={field}
        inputMode="tel"
        autoComplete="off"
        value={phone}
        onChange={(event) => setPhone(event.target.value)}
      />
      <label htmlFor="nn-tag" className="mt-3 mb-1 block font-semibold text-ink-soft">
        {t("party.fieldTag")}
      </label>
      <input
        id="nn-tag"
        className={field}
        placeholder={t("party.fieldTagHint")}
        autoComplete="off"
        value={tag}
        onChange={(event) => setTag(event.target.value)}
      />
      <button
        type="button"
        onClick={create}
        disabled={!trimmed || askSame}
        className="mt-4 min-h-16 w-full rounded-btn bg-ink font-display text-2xl font-bold text-white disabled:opacity-45"
      >
        {t("party.save")}
      </button>
    </Sheet>
  );
}
