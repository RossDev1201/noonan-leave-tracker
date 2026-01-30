import "./globals.css";
import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Noonan Leave Tracker",
  description: "Simple employee leave tracker with JSON storage for Noonan"
};

export default function RootLayout({
  children
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body className="min-h-screen bg-slate-950 text-slate-50 antialiased">
        {children}
      </body>
    </html>
  );
}
