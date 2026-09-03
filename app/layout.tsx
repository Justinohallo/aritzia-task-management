import type { Metadata } from "next";

import { AuthProvider } from "@/components/auth/provider";

import "./globals.css";

export const metadata: Metadata = {
  title: "Aritzia Task Management",
  description: "A task-management application built spec-first for a technical case assessment.",
};

/** `<AuthProvider>` mounts once here: every route reads the same session state. */
export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body className="min-h-dvh font-sans antialiased">
        <AuthProvider>{children}</AuthProvider>
      </body>
    </html>
  );
}
