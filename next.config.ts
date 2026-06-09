import type { NextConfig } from "next";

// When building for the desktop shell (TAURI=1) we emit a fully static export
// that Tauri bundles into the app. The web build keeps SSR + the cross-origin
// isolation headers needed by the in-browser Whisper worker fallback.
const isTauri = process.env.TAURI === "1";

const nextConfig: NextConfig = {
  devIndicators: false,
  ...(isTauri
    ? {
      output: "export",
      images: { unoptimized: true },
    }
    : {
      async headers() {
        return [
          {
            source: "/(.*)",
            headers: [
              { key: "Cross-Origin-Opener-Policy", value: "same-origin" },
              { key: "Cross-Origin-Embedder-Policy", value: "credentialless" },
            ],
          },
        ];
      },
    }),
};

export default nextConfig;
