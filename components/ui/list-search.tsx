import Link from "next/link";
import { withQuery } from "@/lib/ui/search";

const inputClass =
  "min-h-11 w-full min-w-0 rounded-md border border-line bg-transparent px-3 text-base outline-none transition-colors duration-300 placeholder:text-ink-faint focus:border-black dark:border-line-dark dark:focus:border-white";
const buttonClass =
  "inline-flex min-h-11 shrink-0 items-center rounded-md border border-black px-4 text-sm transition-colors duration-300 hover:bg-black hover:text-white focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent dark:border-white dark:hover:bg-white dark:hover:text-black";

/**
 * Filters the list already on the page. GET, so it works without client JS and
 * writes nothing: the text lives only in ?q=.
 */
export function ListSearch({
  action,
  query,
  hidden,
  placeholder = "Buscar nesta lista",
}: {
  action: string;
  query: string;
  hidden?: Record<string, string | null | undefined>;
  placeholder?: string;
}) {
  const kept = Object.fromEntries(Object.entries(hidden ?? {}).filter((entry) => entry[1]));
  return (
    <form action={action} method="get" role="search" className="mt-6 flex items-center gap-2">
      {Object.entries(kept).map(([name, value]) => (
        <input key={name} type="hidden" name={name} value={value ?? ""} />
      ))}
      <label htmlFor="busca" className="sr-only">
        Buscar nesta lista
      </label>
      <input
        id="busca"
        name="q"
        type="search"
        defaultValue={query}
        placeholder={placeholder}
        maxLength={80}
        autoComplete="off"
        enterKeyHint="search"
        className={inputClass}
      />
      <button type="submit" className={buttonClass}>
        Buscar
      </button>
      {query ? (
        <Link href={withQuery(action, kept)} scroll={false} className={`${buttonClass} px-3`}>
          Limpar
        </Link>
      ) : null}
    </form>
  );
}
