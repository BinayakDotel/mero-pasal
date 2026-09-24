"use client";

import { searchParties } from "@mero-pasal/shared/names";
import { useMemo, useState } from "react";
import { Icon } from "@/components/icons";
import { useLocale } from "@/features/session/locale";
import type { PartyChoice } from "./capture-machine";
import { isLocalParty } from "./local-party";
import { NewNameSheet } from "./new-name-sheet";
import { Avatar, PartyRow } from "./party-row";
import { StepBar } from "./step-bar";
import { type PickerParty, usePickerParties } from "./use-picker-parties";

/**
 * F-04 "कसको बिल?" (ui-ux §5.3): walk-in first for sales, recent names with their last bill,
 * cross-script search, "nothing found → add exactly this name", near matches, the new-name sheet,
 * and "पछि". The bill photo stays visible in the corner (ui-ux §2.4). Used by capture and by
 * correcting a bill (F-08, "the same name picker").
 */
export function PartyPicker({
  kind,
  thumb,
  step,
  onBack,
  onPick,
}: {
  kind: "sale" | "purchase";
  thumb?: string | null | undefined;
  step?: number;
  onBack: () => void;
  onPick: (party: PartyChoice) => void;
}) {
  const { t } = useLocale();
  const { loading, walkIn, parties } = usePickerParties(kind);
  const [query, setQuery] = useState("");
  const [sheetName, setSheetName] = useState<string | null>(null);

  const q = query.trim();
  const found = useMemo(() => (q ? searchParties(q, parties) : null), [q, parties]);
  const pick = (party: PickerParty) =>
    onPick(
      isLocalParty(party)
        ? { type: "local", clientId: party.clientId, displayName: party.displayName }
        : {
            type: "existing",
            id: party._id,
            displayName: party.displayName,
            isWalkIn: party.isWalkIn,
          },
    );
  const tone = kind === "sale" ? "sale" : "buy";
  const quoted = { q };

  return (
    <main className="paper flex min-h-dvh flex-col">
      <StepBar
        title={t("party.title")}
        {...(step === undefined ? {} : { step })}
        onBack={onBack}
        right={
          thumb ? (
            // biome-ignore lint/performance/noImgElement: local object URL thumbnail of the bill
            <img
              src={thumb}
              alt=""
              className="h-14 w-11 flex-none rounded-md border border-rule bg-white object-cover"
            />
          ) : null
        }
      />
      <div className="px-4">
        <span
          className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-[15px] font-bold ${kind === "sale" ? "bg-sale-tint text-sale" : "bg-buy-tint text-buy"}`}
        >
          <Icon name={kind === "sale" ? "bagOut" : "boxIn"} className="size-[18px]" />
          {t(kind === "sale" ? "kind.sale" : "kind.purchase")}
        </span>
      </div>

      <div className="relative mx-4 mt-2">
        <Icon
          name="search"
          className="pointer-events-none absolute top-4 left-3.5 size-6 text-ink-soft"
        />
        <input
          type="search"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder={t("party.search")}
          aria-label={t("party.search")}
          autoComplete="off"
          className="h-14 w-full rounded-[14px] border-2 border-rule bg-card pr-3.5 pl-12 text-[19px] focus:border-ink focus:outline-none"
        />
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto pb-4">
        {kind === "sale" && walkIn && !q ? (
          <button
            type="button"
            onClick={() => pick(walkIn)}
            className="mx-4 mt-3 flex min-h-16 w-[calc(100%-32px)] items-center gap-3.5 rounded-[14px] bg-sale-tint px-3.5 py-2.5 text-left"
          >
            <Avatar name={walkIn.displayName} className="bg-sale text-white" />
            <span>
              <span className="block text-[19px] font-semibold">{t("party.walkIn")}</span>
              <span className="block text-[15px] text-ink-soft">{t("party.walkInSub")}</span>
            </span>
          </button>
        ) : null}

        {loading ? (
          <div aria-busy="true" className="mt-4">
            {[0, 1, 2, 3].map((row) => (
              <div
                key={row}
                className="h-[68px] animate-pulse border-b border-rule motion-reduce:animate-none"
              />
            ))}
          </div>
        ) : found === null ? (
          <>
            {parties.length ? (
              <h2 className="mx-4 mt-4.5 mb-1.5 text-[15px] font-bold text-ink-soft">
                {t("party.recent")}
              </h2>
            ) : null}
            {parties.map((party) => (
              <PartyRow key={party._id} party={party} onPick={() => pick(party)} />
            ))}
          </>
        ) : found.matches.length ? (
          <>
            <h2 className="mx-4 mt-4.5 mb-1.5 text-[15px] font-bold text-ink-soft">
              {t("party.results")}
            </h2>
            {found.matches.map((party) => (
              <PartyRow key={party._id} party={party} onPick={() => pick(party)} />
            ))}
            <button
              type="button"
              onClick={() => setSheetName(q)}
              className="mx-4 my-3 flex min-h-14 w-[calc(100%-32px)] items-center gap-2.5 rounded-[14px] border-2 border-dashed border-ink-soft bg-card px-3.5 text-left text-[17px] font-bold"
            >
              <Icon name="plus" />
              {t("party.notThem", quoted)}
            </button>
          </>
        ) : (
          <>
            <div className="mx-4 mt-3 mb-1.5 rounded-2xl border-2 border-ink bg-card p-3.5">
              <p className="mb-2.5 text-[17px] text-ink-soft">{t("party.notFound", quoted)}</p>
              <button
                type="button"
                onClick={() => setSheetName(q)}
                className={`flex min-h-16 w-full items-center gap-2.5 rounded-btn px-3.5 py-2 text-left font-display text-[21px] leading-tight font-bold text-white ${tone === "sale" ? "bg-sale" : "bg-buy"}`}
              >
                <Icon name="plus" />
                {t("party.addThis", quoted)}
              </button>
            </div>
            {found.near.length ? (
              <>
                <h2 className="mx-4 mt-4.5 mb-1.5 text-[15px] font-bold text-ink-soft">
                  {t("party.isItThis")}
                </h2>
                {found.near.map((party) => (
                  <PartyRow key={party._id} party={party} onPick={() => pick(party)} />
                ))}
              </>
            ) : null}
          </>
        )}
      </div>

      <div className="paper sticky bottom-0 flex flex-col gap-2 border-t border-rule px-4 pt-3 pb-4">
        <button
          type="button"
          onClick={() => setSheetName(q)}
          className="flex min-h-14 items-center justify-center gap-2 rounded-[14px] border-2 border-ink bg-card text-lg font-bold"
        >
          <Icon name="plus" />
          {t("party.add")}
        </button>
        <button
          type="button"
          onClick={() => onPick({ type: "later" })}
          className="min-h-12 text-[17px] font-semibold text-ink-soft underline underline-offset-4"
        >
          {t("party.later")}
        </button>
      </div>

      <NewNameSheet
        open={sheetName !== null}
        initialName={sheetName ?? ""}
        parties={parties}
        onClose={() => setSheetName(null)}
        onUseExisting={(party) => {
          setSheetName(null);
          pick(party);
        }}
        onCreate={(input) => {
          setSheetName(null);
          onPick({ type: "new", clientId: crypto.randomUUID(), ...input });
        }}
      />
    </main>
  );
}
