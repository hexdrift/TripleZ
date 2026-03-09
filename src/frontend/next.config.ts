import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  output: "export",
  trailingSlash: true,
  reactStrictMode: true,
  compress: true,
  poweredByHeader: false,
  experimental: {
    optimizePackageImports: [
      "framer-motion",
      "recharts",
      "react-toastify",
      "lucide-react",
      "radix-ui",
      "@radix-ui/react-dialog",
      "@radix-ui/react-select",
      "@radix-ui/react-tooltip",
      "@radix-ui/react-separator",
      "@radix-ui/react-tabs",
      "@radix-ui/react-direction",
      "class-variance-authority",
      "clsx",
      "tailwind-merge",
    ],
  },
};

export default nextConfig;
