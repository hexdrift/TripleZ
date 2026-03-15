import type { Metadata, Viewport } from "next";
import { AppShell } from "@/components/app-shell";
import { TooltipProvider } from "@/components/ui/tooltip";
import { Providers } from "@/components/theme-provider";
import { LazyToastContainer } from "@/components/lazy-toast-container";
import "@fontsource-variable/heebo";
import "./globals.css";

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#ffffff" },
    { media: "(prefers-color-scheme: dark)", color: "#09090b" },
  ],
};

export const metadata: Metadata = {
  title: "TripleZ — ניהול חדרים",
  description: "מערכת ניהול מבנים והקצאת חדרים",
  icons: {
    icon: "/favicon.svg",
  },
  robots: { index: true, follow: true },
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="he" dir="rtl" suppressHydrationWarning>
      <head>
        <link rel="preconnect" href="/" crossOrigin="" />
        {process.env.NEXT_PUBLIC_API_URL && (
          <link rel="dns-prefetch" href={process.env.NEXT_PUBLIC_API_URL} />
        )}
      </head>
      <body>
        <div id="app-splash" aria-hidden="true">
          <p>Triple Z</p>
        </div>
        <Providers>
          <TooltipProvider>
            <AppShell>{children}</AppShell>
          </TooltipProvider>
        </Providers>
        <LazyToastContainer />
      </body>
    </html>
  );
}
