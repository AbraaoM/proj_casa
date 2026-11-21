import type { NextConfig } from "next";

/** The product moved from the old Casa host to Ametista. Pages redirect, the API keeps answering on both. */
const NEW_HOST = "ametista.abraaomoreira.dev";
const OLD_HOST = "casa.abraaomoreira.dev";

/**
 * Everything the browser opens as a page. Left out on purpose, so they keep working on the old host:
 *  - /api/*: the agent API, MCP, cron and the Telegram webhook (Telegram does not follow redirects, and a 308 on a POST is not honoured by every client);
 *  - /_next/*: assets of the page that is being served;
 *  - the PWA files (manifest, service worker, offline page, icons) so an app installed from the old host does not break.
 */
const PAGES = "(?!api(?:/|$)|_next(?:/|$)|icons/|manifest\\.webmanifest$|sw\\.js$|offline\\.html$|icon\\.svg$|apple-icon\\.png$|favicon\\.ico$).*";

const nextConfig: NextConfig = {
  async redirects() {
    const onOldHost = [{ type: "host" as const, value: OLD_HOST }];
    return [
      { source: "/", has: onOldHost, destination: `https://${NEW_HOST}/`, permanent: true },
      { source: `/:path(${PAGES})`, has: onOldHost, destination: `https://${NEW_HOST}/:path`, permanent: true },
    ];
  },
  experimental: {
    // Both hosts serve the same app. Server Actions accept a form posted from either one.
    serverActions: { allowedOrigins: [NEW_HOST, OLD_HOST] },
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
