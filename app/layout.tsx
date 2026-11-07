import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Streameriai.Lt – Lietuvos turinio kūrėjų platforma",
  description: "Gyvos Twitch, Kick ir YouTube transliacijos, TOP kanalai ir geriausi klipai iš Lietuvos.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="lt">
      <body className="antialiased selection:bg-indigo-500 selection:text-white font-sans">{children}</body>
    </html>
  );
}
