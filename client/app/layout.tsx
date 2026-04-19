import type { Metadata, Viewport } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import { Toaster } from "@/components/ui/sonner";
import { BottomNav } from "@/components/layout/BottomNav";
import { OfflineBanner } from "@/components/layout/OfflineBanner";
import { StoreBoot } from "@/components/providers/StoreBoot";
import { AuthGate } from "@/components/providers/AuthGate";
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
  applicationName: "Khata",
  appleWebApp: {
    capable: true,
    title: "Khata",
    statusBarStyle: "default",
  },
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
      <body className="h-dvh bg-sage flex justify-center items-center overflow-hidden">
        <div className="relative flex w-full max-w-[440px] h-dvh flex-col overflow-hidden bg-cream sm:my-4 sm:w-[440px] sm:h-[844px] sm:max-h-[calc(100dvh-2rem)] sm:max-w-none sm:aspect-[440/844] sm:rounded-[44px] sm:shadow-[0_40px_80px_-30px_rgba(0,0,0,0.35)] sm:ring-1 sm:ring-black/5">
          <StoreBoot />
          <OfflineBanner />
          <AuthGate>
            {children}
            <BottomNav />
          </AuthGate>
        </div>
        <Toaster position="top-center" />
      </body>
    </html>
  );
}
