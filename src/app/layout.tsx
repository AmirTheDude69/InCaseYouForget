import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "In Case You Forget",
  description: "A private gallery of love letters, poems, and notes.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
