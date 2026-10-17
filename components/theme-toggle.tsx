"use client";

import { Moon, Sun } from "lucide-react";

export function ThemeToggle() {
  function toggle() {
    const next = !document.documentElement.classList.contains("dark");
    document.documentElement.classList.toggle("dark", next);
    localStorage.setItem("theme", next ? "dark" : "light");
  }

  return (
    <button
      type="button"
      onClick={toggle}
      aria-label="Alternar tema claro e escuro"
      title="Alternar tema"
      className="inline-flex h-11 w-11 items-center justify-center rounded-md border border-line text-ink-muted transition-colors duration-300 hover:text-black focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent dark:border-line-dark dark:hover:text-white"
    >
      <Moon aria-hidden className="h-5 w-5 dark:hidden" strokeWidth={1.75} />
      <Sun aria-hidden className="hidden h-5 w-5 dark:block" strokeWidth={1.75} />
    </button>
  );
}
