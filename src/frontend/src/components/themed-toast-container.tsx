"use client";

import "react-toastify/dist/ReactToastify.css";
import { ToastContainer } from "react-toastify";
import { useTheme } from "next-themes";

export function ThemedToastContainer() {
  const { resolvedTheme } = useTheme();

  return (
    <ToastContainer
      rtl
      position="bottom-left"
      autoClose={3000}
      hideProgressBar
      closeOnClick
      pauseOnHover
      theme={resolvedTheme === "dark" ? "dark" : "light"}
      toastClassName="toast-custom"
    />
  );
}
