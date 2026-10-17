import type { Metadata, Viewport } from "next";
import { Anton, Inter } from "next/font/google";
import "./globals.css";

const anton = Anton({
  weight: "400",
  subsets: ["latin"],
  variable: "--font-anton",
});

const inter = Inter({
  subsets: ["latin"],
  variable: "--font-inter",
});

const themeBoot = `
try {
  var stored = localStorage.getItem("theme");
  var dark = stored === "dark" || (stored !== "light" && matchMedia("(prefers-color-scheme: dark)").matches);
  if (dark) document.documentElement.classList.add("dark");
} catch (e) {}
`;

export const metadata: Metadata = {
  title: "Casa",
  description: "O que pede atenção em casa.",
  robots: { index: false, follow: false },
  applicationName: "Casa",
  appleWebApp: { capable: true, title: "Casa", statusBarStyle: "default" },
};

export const viewport: Viewport = {
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#fafafa" },
    { media: "(prefers-color-scheme: dark)", color: "#0a0a0a" },
  ],
  viewportFit: "cover",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html
      lang="pt-BR"
      className={`${anton.variable} ${inter.variable} h-full`}
      suppressHydrationWarning
    >
      <head>
        <script dangerouslySetInnerHTML={{ __html: themeBoot }} />
      </head>
      <body className="min-h-full bg-soft-white font-sans text-black antialiased dark:bg-soft-black dark:text-white">
        {children}
      </body>
    </html>
  );
}
