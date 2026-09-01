import type { Metadata } from "next";

import "./globals.css";

export const metadata: Metadata = {
  title: "Aritzia Task Management",
  description: "A task-management application built spec-first for a technical case assessment.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body className="min-h-dvh font-sans antialiased">{children}</body>
    </html>
  );
}
