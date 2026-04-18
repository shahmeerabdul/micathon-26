import type { Metadata, Viewport } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import { Toaster } from "@/components/ui/sonner";
import { BottomNav } from "@/components/layout/BottomNav";
import { StoreBoot } from "@/components/providers/StoreBoot";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "Khata — Voice Ledger",
  description:
    "A voice-first ledger for local shopkeepers. Record debts, payables, and sales in Urdu or Pashto.",
};

export const viewport: Viewport = {
  themeColor: "#b6d8c3",
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
  viewportFit: "cover",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="en"
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
    >
      <body className="min-h-dvh bg-sage flex justify-center">
        <div className="relative flex w-full max-w-[440px] min-h-dvh flex-col bg-cream sm:my-4 sm:min-h-[calc(100dvh-2rem)] sm:rounded-[40px] sm:overflow-hidden sm:shadow-[0_40px_80px_-30px_rgba(0,0,0,0.35)] sm:ring-1 sm:ring-black/5">
          <StoreBoot />
          {children}
          <BottomNav />
        </div>
        <Toaster position="top-center" />
      </body>
    </html>
  );
}
