import { t } from "@mero-pasal/shared/i18n";
import { ReloadWhenOnline } from "./reload-when-online";

// Precached by the service worker; shown when a page is opened offline before it was ever
// loaded. Both languages, because the member's locale isn't known here.
export default function OfflinePage() {
  return (
    <main className="grid min-h-dvh place-content-center justify-items-center gap-3 p-6 text-center">
      <ReloadWhenOnline />
      <h1 className="font-display text-3xl font-extrabold">{t("ne", "offline.title")}</h1>
      <p className="max-w-sm text-lg">{t("ne", "offline.body")}</p>
      <p className="max-w-sm text-[15px] text-ink-soft" lang="en">
        {t("en", "offline.title")} {t("en", "offline.body")}
      </p>
    </main>
  );
}
