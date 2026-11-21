import { PublicFrame } from "@/components/auth/public-frame";

/** Frame for the legal texts. They are drafts: the banner says so on every page. */
export function LegalPage({ title, updated, children }: { title: string; updated: string; children: React.ReactNode }) {
  return (
    <PublicFrame>
      <h1 className="mt-12 font-display text-3xl leading-tight tracking-tight">{title}</h1>
      <p className="mt-3 rounded-md border border-line px-3 py-3 text-sm dark:border-line-dark" role="note">
        <strong>Rascunho.</strong> Este texto ainda não passou por revisão jurídica e pode mudar. Última atualização: {updated}.
      </p>
      <div className="mt-6 space-y-4 text-sm leading-relaxed text-ink-muted [&_h2]:mt-8 [&_h2]:text-lg [&_h2]:text-black dark:[&_h2]:text-white [&_li]:ml-5 [&_li]:list-disc">
        {children}
      </div>
    </PublicFrame>
  );
}
