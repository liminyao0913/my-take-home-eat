import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Let's Eat — less debating, more eating",
  description: "One link, a few good options, and ten minutes to decide where to eat together.",
  robots: { index: false, follow: false },
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <html lang="en"><body>{children}</body></html>;
}
