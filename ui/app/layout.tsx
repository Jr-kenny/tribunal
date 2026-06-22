import type { Metadata } from "next";
import "./globals.css";
import { SiteNav } from "@/components/SiteNav";
import { Footer } from "@/components/Footer";

export const metadata: Metadata = {
  title: "Tribunal — multi-agent RWA verification oracle on Casper",
  description:
    "A panel of specialist GenLayer judges each verifies one facet of a real-world-asset claim. Casper federates their verdicts and stakes their reputation.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>
        <SiteNav />
        {children}
        <Footer />
      </body>
    </html>
  );
}
