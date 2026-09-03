import type { Metadata, Viewport } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "פרחים לכבוד שבת קודש – חנות פרחים",
  description:
    "זרים וסידורי פרחים לכבוד שבת קודש. הזמנה מראש, משלוח עד הבית, והנחת לקוח קבוע אוטומטית.",
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  maximumScale: 5,
  themeColor: "#0e6b48",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="he" dir="rtl" suppressHydrationWarning>
      <body className="min-h-screen bg-background font-sans">{children}</body>
    </html>
  );
}