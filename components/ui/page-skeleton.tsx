/** Shown at once on every tap while the server answers, so the app never looks frozen. */
export function PageSkeleton({ rows = 4 }: { rows?: number }) {
  return (
    <main className="mx-auto w-full max-w-3xl px-5 py-8 md:max-w-5xl md:px-10 md:py-12" aria-busy="true">
      <p className="sr-only">Carregando</p>
      <div className="h-10 w-48 animate-pulse rounded-md bg-line dark:bg-line-dark" />
      <div className="mt-8 space-y-4">
        {Array.from({ length: rows }, (_, key) => (
          <div key={key} className="rounded-xl border border-line p-4 dark:border-line-dark">
            <div className="h-4 w-32 animate-pulse rounded bg-line dark:bg-line-dark" />
            <div className="mt-4 h-4 w-3/4 animate-pulse rounded bg-line dark:bg-line-dark" />
            <div className="mt-3 h-4 w-1/2 animate-pulse rounded bg-line dark:bg-line-dark" />
          </div>
        ))}
      </div>
    </main>
  );
}
