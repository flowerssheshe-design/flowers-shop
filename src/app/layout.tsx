import type { Metadata, Viewport } from "next";
import { ToastProvider } from "@/components/ui/toaster";
import { VisitTracker } from "@/components/VisitTracker";
import { AnnouncementBanner } from "@/components/AnnouncementBanner";
import { PushPrompt } from "@/components/staff/marketing/PushPrompt";
import { StoreModeProvider } from "@/context/StoreModeContext";
import { SystemSettingsProvider } from "@/context/SystemSettingsContext";
import "./globals.css";

export const metadata: Metadata = {
  title: "פרחים לכבוד שבת קודש – חנות פרחים",
  description:
    "זרים וסידורי פרחים לכבוד שבת קודש. הזמנה מראש, משלוח עד הבית, והנחת לקוח קבוע אוטומטית.",
  manifest: "/manifest.webmanifest",
  icons: {
    icon: [{ url: "/icon-192.png", sizes: "192x192", type: "image/png" }],
    apple: [{ url: "/apple-touch-icon.png", sizes: "180x180" }],
  },
  appleWebApp: {
    capable: true,
    title: "פרחים לשבת",
    statusBarStyle: "default",
  },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
  userScalable: false,
  themeColor: "#0e6b48",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="he" dir="rtl" suppressHydrationWarning>
      <body className="min-h-screen bg-background font-sans">
        <VisitTracker />
        <PushPrompt />
        <StoreModeProvider>
          <SystemSettingsProvider>
            <AnnouncementBanner />
            <ToastProvider>{children}</ToastProvider>
          </SystemSettingsProvider>
        </StoreModeProvider>
      </body>
    </html>
  );
}