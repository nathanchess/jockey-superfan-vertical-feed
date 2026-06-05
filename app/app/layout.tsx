import type { Metadata } from "next";
import { AppShell } from "@/components/AppShell";
import "./globals.css";

export const metadata: Metadata = {
  title: "Superfan Vertical Feed",
  description: "Personalized reality TV highlight feed with explainable ranking",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className="h-full antialiased">
      <body className="h-full bg-background text-text-primary">
        <AppShell>{children}</AppShell>
      </body>
    </html>
  );
}
