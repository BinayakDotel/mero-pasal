import { ClerkProvider } from "@clerk/nextjs";
import { SerwistProvider } from "@serwist/turbopack/react";
import type { Metadata, Viewport } from "next";
import { Baloo_2, Mukta } from "next/font/google";
import type { ReactNode } from "react";
import { ConvexClientProvider } from "@/lib/convex-client-provider";
import "./globals.css";

// ui-ux §3.2: Baloo 2 for amounts, titles and big buttons; Mukta for everything else.
const mukta = Mukta({
  subsets: ["devanagari", "latin"],
  weight: ["400", "500", "600", "700"],
  variable: "--font-mukta",
  display: "swap",
});
const baloo = Baloo_2({
  subsets: ["devanagari", "latin"],
  weight: ["600", "700", "800"],
  variable: "--font-baloo",
  display: "swap",
});

export const metadata: Metadata = {
  title: "मेरो पसल",
  description: "Mero Pasal: the shop's bill book",
  applicationName: "मेरो पसल",
};

export const viewport: Viewport = {
  themeColor: "#f2f4f1", // --color-paper
  width: "device-width",
  initialScale: 1,
};

export default function RootLayout({ children }: { children: ReactNode }) {
  // Nepali is the default (F-10); the session updates `lang` once the member's locale is known.
  return (
    <html lang="ne" className={`${mukta.variable} ${baloo.variable}`}>
      <body className="min-h-dvh">
        {/* Off in dev so stale caches never hide code changes. No reload on reconnect: it would
            drop Buwa out of a bill (architecture §8.4); the sync engine handles reconnects. */}
        <SerwistProvider
          swUrl="/serwist/sw.js"
          disable={process.env.NODE_ENV === "development"}
          reloadOnOnline={false}
        >
          <ClerkProvider signInUrl="/sign-in">
            <ConvexClientProvider>{children}</ConvexClientProvider>
          </ClerkProvider>
        </SerwistProvider>
      </body>
    </html>
  );
}
