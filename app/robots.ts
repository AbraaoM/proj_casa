import type { MetadataRoute } from "next";
import { SITE_URL } from "@/lib/site";

export default function robots(): MetadataRoute.Robots {
  return {
    rules: [{ userAgent: "*", allow: ["/", "/cadastrar", "/privacidade", "/termos"], disallow: ["/api/", "/convite/", "/usuarios", "/login"] }],
    sitemap: `${SITE_URL}/sitemap.xml`,
  };
}
