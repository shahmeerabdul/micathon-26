import type { MetadataRoute } from "next";

/**
 * PWA manifest for the Khata app — lets shopkeepers "Install" the webapp to
 * their home screen on Android/iOS and launch it full-screen without the
 * browser chrome. Icons are generated from Next's route-level static assets.
 */
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Khata — Voice Ledger",
    short_name: "Khata",
    description:
      "A voice-first ledger for Pakistani shopkeepers. Record debts, payables, and sales in Urdu or English.",
    start_url: "/",
    display: "standalone",
    orientation: "portrait",
    background_color: "#b6d8c3",
    theme_color: "#b6d8c3",
    lang: "en-PK",
    icons: [
      {
        src: "/icon.svg",
        sizes: "any",
        type: "image/svg+xml",
        purpose: "any",
      },
    ],
  };
}
