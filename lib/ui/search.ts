/** Accent- and case-insensitive match for the ?q= filter on a list. */

const MARKS = /\p{M}/gu;

export function foldSearch(value: string): string {
  return value.normalize("NFD").replace(MARKS, "").toLocaleLowerCase("pt-BR");
}

/** Trim, collapse spaces and cap the length. Empty means "no filter". */
export function searchQuery(raw: string | null | undefined): string {
  return (raw ?? "").trim().replace(/\s+/g, " ").slice(0, 80);
}

/** Every word of the query must appear somewhere in the fields. An empty query matches everything. */
export function matchesSearch(raw: string | null | undefined, fields: Array<string | number | null | undefined>): boolean {
  const query = foldSearch(searchQuery(raw));
  if (!query) return true;
  const haystack = foldSearch(
    fields
      .filter((field) => field !== null && field !== undefined && String(field) !== "")
      .join(" "),
  );
  return query.split(" ").every((word) => haystack.includes(word));
}

/** Path plus the params that have a value, in insertion order. */
export function withQuery(path: string, params: Record<string, string | null | undefined>): string {
  const search = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) if (value) search.set(key, value);
  const text = search.toString();
  return text ? `${path}?${text}` : path;
}
