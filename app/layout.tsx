import type { Metadata } from "next";
import type { CSSProperties } from "react";

import "./globals.css";
import { cssVars } from "@/design_handoff_taalreis/taalreis-tokens";

const appStyles: CSSProperties = {
  ...(cssVars as CSSProperties),
  fontFamily: "Inter, -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif"
};

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
      <body style={appStyles}>{children}</body>
    </html>
  );
}
