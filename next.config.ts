import type { NextConfig } from "next";
const config: NextConfig = {
  turbopack: { root: process.cwd() },
  poweredByHeader: false,
  // PostgreSQL reads this certificate via DATABASE_URL, outside static tracing.
  outputFileTracingIncludes: {
    "/api/event": ["./supabase/prod-ca-2021.crt"],
  },
  async headers() {
    return [
      {
        source: "/(.*)",
        headers: [
          { key: "X-Robots-Tag", value: "noindex, nofollow" },
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "Referrer-Policy", value: "same-origin" },
          { key: "Content-Security-Policy", value: "frame-ancestors 'self'" },
        ],
      },
    ];
  },
};
export default config;
