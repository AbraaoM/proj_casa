import { ImageResponse } from "next/og";
import { SITE_NAME, SITE_TAGLINE } from "@/lib/site";

export const alt = `${SITE_NAME}: ${SITE_TAGLINE}`;
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

export default function OpenGraphImage() {
  return new ImageResponse(
    (
      <div style={{ width: "100%", height: "100%", display: "flex", flexDirection: "column", justifyContent: "center", padding: 80, background: "#fafafa", color: "#0a0a0a" }}>
        <svg width="140" height="140" viewBox="0 0 64 64">
          <path d="M32 4 L60 26 L54 60 L10 60 L4 26 Z" fill="#9966cc" />
          <path d="M32 4 L60 26 L44 26 Z" fill="#6d28d9" />
          <path d="M32 4 L20 26 L4 26 Z" fill="#b48ae0" />
          <path d="M32 4 L44 26 L20 26 Z" fill="#e2d0f8" />
          <path d="M60 26 L54 60 L38 60 L44 26 Z" fill="#6d28d9" />
          <path d="M4 26 L20 26 L26 60 L10 60 Z" fill="#b48ae0" />
          <path d="M27 60 V47 a5 5 0 0 1 10 0 V60 Z" fill="#fafafa" />
          <path d="M32 4 L60 26 L54 60 L10 60 L4 26 Z" fill="none" stroke="#4c1d95" strokeWidth="2.5" strokeLinejoin="round" />
        </svg>
        <div style={{ marginTop: 40, fontSize: 112, fontWeight: 800, letterSpacing: -3 }}>{SITE_NAME}</div>
        <div style={{ marginTop: 16, fontSize: 44, color: "#6b7280" }}>{SITE_TAGLINE}</div>
        <div style={{ marginTop: 40, fontSize: 32, color: "#6d28d9" }}>Comece 14 dias grátis</div>
      </div>
    ),
    size,
  );
}
