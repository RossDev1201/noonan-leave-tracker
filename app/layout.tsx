import "./globals.css";
import type { Metadata } from "next";
import Providers from "./providers";

export const metadata: Metadata = {
  title: "Noonan Leave & Invoice Tracker",
  description: "Employee leave and invoice tracker for Noonan",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body className="min-h-screen bg-noonan-cream text-black antialiased dark:bg-black dark:text-noonan-cream">
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
