import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  output: "export",
  trailingSlash: true,
  experimental: {
    optimizePackageImports: [
      "framer-motion",
      "recharts",
      "react-toastify",
      "@radix-ui/react-dialog",
      "@radix-ui/react-select",
      "@radix-ui/react-tooltip",
      "@radix-ui/react-separator",
    ],
  },
};

export default nextConfig;
