import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import TopBar from "./TopBar";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "Company Brain",
  description: "Cited, curated, access-aware team memory",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="en" className={`${geistSans.variable} ${geistMono.variable}`}>
      <body>
        <TopBar />
        <div className="page">{children}</div>
      </body>
    </html>
  );
}
