import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Application interne, entièrement dynamique (session par utilisateur) :
  // on désactive le mode "Cache Components" pour garder un modèle simple.
  cacheComponents: false,
  // Police arabe des PDF lue sur le disque par la route /api/pdf
  outputFileTracingIncludes: {
    "/api/pdf/[kind]": ["./lib/pdf/fonts/**"],
  },
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
