import type { Metadata } from "next";
import "@fontsource-variable/heebo";
import "./globals.css";
import { ToastContainer } from "react-toastify";
import "react-toastify/dist/ReactToastify.css";

export const metadata: Metadata = {
  title: 'תצוגת קמב"צ — צ׳ק אין',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="he" dir="rtl">
      <body className="min-h-screen bg-background font-[Heebo_Variable,system-ui,sans-serif] antialiased">
        {children}
        <ToastContainer position="top-center" rtl autoClose={2500} hideProgressBar={false} />
      </body>
    </html>
  );
}
