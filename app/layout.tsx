import type { Metadata } from "next";
import "@fontsource-variable/manrope";
import "@fontsource-variable/source-sans-3";
import "@fontsource/anton";
import "./globals.css";
export const metadata: Metadata = {
  title: "Nippon Toyota | Onam Lucky Draw",
  description: "A season of togetherness. A moment of good fortune.",
  robots: { index: false, follow: false },
};
export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
