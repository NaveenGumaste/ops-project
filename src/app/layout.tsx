import type { Metadata } from "next";
import { Geist } from "next/font/google";
import "./globals.css";

const geistSans = Geist({
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "ApexSupply — Inventory & Order Fulfillment",
  description: "3-tier B2B hardware inventory workbench with PostgreSQL row-level locks and Nginx reverse proxy.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body className={`${geistSans.className} min-h-[100svh] flex flex-col bg-[#f4f5f7] text-[#0f172a] antialiased`}>
        {children}
      </body>
    </html>
  );
}
