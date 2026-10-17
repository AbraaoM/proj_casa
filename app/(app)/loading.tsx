export default function Loading() {
  return (
    <main className="mx-auto w-full max-w-3xl px-5 py-8 md:max-w-5xl md:px-10 md:py-12" aria-busy="true">
      <p className="sr-only">Carregando</p>
      <div className="h-4 w-20 animate-pulse bg-line dark:bg-line-dark" />
      <div className="mt-6 h-12 w-56 animate-pulse bg-line dark:bg-line-dark" />
      <div className="mt-12 grid gap-10 md:grid-cols-2">
        {[0, 1, 2, 3].map((key) => (
          <div key={key} className="border-t border-line pt-4 dark:border-line-dark">
            <div className="h-5 w-32 animate-pulse bg-line dark:bg-line-dark" />
            <div className="mt-4 h-4 w-48 animate-pulse bg-line dark:bg-line-dark" />
          </div>
        ))}
      </div>
    </main>
  );
}
