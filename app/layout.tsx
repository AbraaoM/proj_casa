import type { Metadata } from "next";
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
