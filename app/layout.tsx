import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "NAYAN — India from above",
  description: "An open-source 3D view of India from above.",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
