import type { NextConfig } from "next";

// The browser normally calls the API on its own host. Some office networks can open this site but
// not that host, so `/backend/*` here forwards to it and lib/api.ts falls back to that path when
// the direct call can't connect. API_PROXY_TARGET overrides the target if the server-side route to
// the API ever differs from the public one.
const apiTarget = (process.env.API_PROXY_TARGET ?? process.env.NEXT_PUBLIC_API_BASE_URL ?? "").replace(/\/+$/, "");

const nextConfig: NextConfig = {
  output: "standalone",
  async rewrites() {
    if (!/^https?:\/\//i.test(apiTarget)) return [];
    return [{ source: "/backend/:path*", destination: `${apiTarget}/:path*` }];
  },
};

export default nextConfig;
