import type { Metadata } from "next";
import "./globals.css";

const title = "Streameriai.Lt – Lietuvos turinio kūrėjų platforma";
const description = "Gyvos Twitch, Kick ir YouTube transliacijos, TOP kanalai ir geriausi klipai iš Lietuvos.";

export const metadata: Metadata = {
  title,
  description,
  openGraph: { title, description, locale: "lt_LT", type: "website", siteName: "Streameriai.Lt" },
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="lt">
      <body className="antialiased selection:bg-indigo-500 selection:text-white font-sans">{children}</body>
    </html>
  );
}
