/** The Ametista mark: a faceted amethyst gem shaped like a house, with an arched door. */
export function LogoMark({ className = "h-8 w-8", title }: { className?: string; title?: string }) {
  return (
    <svg viewBox="0 0 64 64" className={className} role={title ? "img" : undefined} aria-hidden={title ? undefined : true}>
      {title ? <title>{title}</title> : null}
      <path d="M32 4 L60 26 L54 60 L10 60 L4 26 Z" fill="#9966cc" />
      <path d="M32 4 L60 26 L44 26 Z" fill="#6d28d9" />
      <path d="M32 4 L20 26 L4 26 Z" fill="#b48ae0" />
      <path d="M32 4 L44 26 L20 26 Z" fill="#e2d0f8" />
      <path d="M60 26 L54 60 L38 60 L44 26 Z" fill="#6d28d9" />
      <path d="M4 26 L20 26 L26 60 L10 60 Z" fill="#b48ae0" />
      <path d="M27 60 V47 a5 5 0 0 1 10 0 V60 Z" className="fill-soft-white dark:fill-soft-black" />
      <path d="M32 4 L60 26 L54 60 L10 60 L4 26 Z" fill="none" stroke="#4c1d95" strokeWidth="2.5" strokeLinejoin="round" />
    </svg>
  );
}

/** Mark plus the "Ametista" wordmark. */
export function Logo({ markClassName = "h-8 w-8", textClassName = "text-3xl" }: { markClassName?: string; textClassName?: string }) {
  return (
    <span className="inline-flex items-center gap-2.5">
      <LogoMark className={markClassName} />
      <span className={`font-display leading-none tracking-tight ${textClassName}`}>Ametista</span>
    </span>
  );
}
