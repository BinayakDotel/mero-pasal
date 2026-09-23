import type { MetadataRoute } from "next";

// F-01: installed from Chrome as "मेरो पसल" (ADR-004). Icons are placeholders until the shop's
// logo is decided (OD-4).
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "मेरो पसल",
    short_name: "मेरो पसल",
    description: "Mero Pasal: the shop's bill book",
    lang: "ne",
    start_url: "/",
    scope: "/",
    display: "standalone",
    orientation: "portrait",
    background_color: "#f2f4f1", // --color-paper
    theme_color: "#f2f4f1",
    icons: [
      { src: "/icons/icon-192.png", sizes: "192x192", type: "image/png", purpose: "any" },
      { src: "/icons/icon-512.png", sizes: "512x512", type: "image/png", purpose: "any" },
      { src: "/icons/maskable-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
    ],
  };
}
