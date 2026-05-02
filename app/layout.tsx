import type { Metadata } from "next";
import { Outfit } from "next/font/google";
import type { CSSProperties } from "react";

import "./globals.css";
import { cssVars } from "@/design_handoff_taalreis/taalreis-tokens";

const outfit = Outfit({
  subsets: ["latin"],
  weight: ["400", "500", "600"],
  display: "swap"
});

export const metadata: Metadata = {
  title: "Taalreis",
  description: "Spaans → Nederlands leerplatform"
};

export default function RootLayout({
  children
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="nl">
      <body
        className={outfit.className}
        style={cssVars as CSSProperties}
      >
        {children}
      </body>
    </html>
  );
}
