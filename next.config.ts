import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Application interne, entièrement dynamique (session par utilisateur) :
  // on désactive le mode "Cache Components" pour garder un modèle simple.
  cacheComponents: false,
  turbopack: {
    rules: {
      "*.css": {
        loaders: ["@tailwindcss/turbopack"],
        as: "*.css",
      },
    },
  },
};

export default nextConfig;
