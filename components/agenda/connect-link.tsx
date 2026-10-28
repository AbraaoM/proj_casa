import Link from "next/link";

const buttonClass =
  "inline-flex min-h-11 items-center rounded-md bg-accent px-4 py-3 text-sm font-medium text-soft-black transition-colors duration-300 hover:bg-accent-light focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent";

/** One tap. The route sends the browser to Google and back. */
export function AgendaConnectLink({ disabled }: { disabled?: boolean }) {
  if (disabled) {
    return <span className={`${buttonClass} opacity-60`}>Conectar Google Agenda</span>;
  }
  return (
    <Link href="/api/google/start" className={buttonClass}>
      Conectar Google Agenda
    </Link>
  );
}
