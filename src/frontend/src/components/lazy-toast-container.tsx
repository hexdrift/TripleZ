"use client";

import dynamic from "next/dynamic";

const ThemedToastContainer = dynamic(
  () => import("@/components/themed-toast-container").then((m) => m.ThemedToastContainer),
  { ssr: false },
);

export function LazyToastContainer() {
  return <ThemedToastContainer />;
}
