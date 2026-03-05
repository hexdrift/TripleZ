import type { Metadata } from "next";
import { Toaster } from "sonner";
import { Providers } from "@/components/theme-provider";
import "@fontsource-variable/heebo";
import "@fontsource-variable/jetbrains-mono";
import "./globals.css";

export const metadata: Metadata = {
  title: "TripleZ — ניהול חדרים",
  description: "מערכת ניהול מבנים והקצאת חדרים",
  icons: {
    icon: "/favicon.svg",
  },
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="he" dir="rtl" suppressHydrationWarning>
      <body>
        <Providers>{children}</Providers>
        <Toaster dir="rtl" position="bottom-left" richColors closeButton />
      </body>
    </html>
  );
}
