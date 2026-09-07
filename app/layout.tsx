import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "NAYAN",
  description: "India from above.",
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
