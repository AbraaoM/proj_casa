"use client";

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
      aria-label="Alternar tema"
      className="border border-line px-3 py-2 text-sm text-ink-muted transition-colors duration-300 hover:text-black focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent dark:border-line-dark dark:hover:text-white"
    >
      <span className="dark:hidden">Escuro</span>
      <span className="hidden dark:inline">Claro</span>
    </button>
  );
}
