import Link from "next/link";
import { categoryLabel } from "@/lib/ui/format";

/** Filter links. Plain anchors with ?categoria=, so filtering needs no client JS. */
export function CategoryChips({
  basePath,
  categories,
  active,
}: {
  basePath: string;
  categories: Array<{ slug: string; count: number }>;
  active: string | null;
}) {
  if (categories.length < 2) return null;
  const chip = (href: string, label: string, selected: boolean, key: string, count?: number) => (
    <li key={key}>
      <Link
        href={href}
        scroll={false}
        aria-current={selected ? "true" : undefined}
        className={`inline-flex min-h-11 items-center whitespace-nowrap rounded-md border px-3 text-sm transition-colors duration-300 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent ${
          selected
            ? "border-black bg-black text-white dark:border-white dark:bg-white dark:text-black"
            : "border-line text-ink-muted hover:border-black hover:text-black dark:border-line-dark dark:hover:border-white dark:hover:text-white"
        }`}
      >
        {label}
        {count !== undefined ? <span className="ml-1.5 tabular-nums opacity-60">{count}</span> : null}
      </Link>
    </li>
  );
  return (
    <nav aria-label="Filtrar por categoria" className="-mx-5 mt-4 overflow-x-auto px-5 md:mx-0 md:px-0">
      <ul className="flex gap-2 pb-1 md:flex-wrap">
        {chip(basePath, "Tudo", active === null, "all")}
        {categories.map((category) =>
          chip(
            `${basePath}?categoria=${category.slug}`,
            categoryLabel(category.slug),
            active === category.slug,
            category.slug,
            category.count,
          ),
        )}
      </ul>
    </nav>
  );
}
