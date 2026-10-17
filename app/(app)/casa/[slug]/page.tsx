import { MoreLink } from "@/components/ui/more-link";
import { PageNotice } from "@/components/history/page-notice";
import { Stat } from "@/components/history/stat";
import { SubjectDetail } from "@/components/history/subject-detail";
import { loadAreaDetail } from "@/lib/services/subject-pages";
import { daysAgoPhrase, formatMoney } from "@/lib/ui/format";
import { AREA_KIND_SINGULAR, lastCleaning, RAIN_NOTICE } from "@/lib/ui/house";

export const dynamic = "force-dynamic";

type Props = { params: Promise<{ slug: string }>; searchParams: Promise<{ categoria?: string }> };

export default async function AreaPage({ params, searchParams }: Props) {
  const [{ slug }, { categoria }] = await Promise.all([params, searchParams]);
  const page = await loadAreaDetail(slug);
  if (page.status !== "ready") return <PageNotice status={page.status} backHref="/casa" />;
  const { today, data } = page;
  const { subject: area, summary } = data;
  const cleaning = lastCleaning(summary);
  const deep = summary.last_by_category.deep_clean;
  const repair = summary.last_by_category.repair;

  return (
    <SubjectDetail
      back={{ href: "/casa", label: "Casa" }}
      eyebrow={`${AREA_KIND_SINGULAR[area.kind]}${area.archived_at ? " · arquivado" : ""}`}
      title={area.name}
      facts={[["Notas", area.notes]]}
      notice={data.outdoor_delay ? RAIN_NOTICE : null}
      stats={
        <>
          <Stat label="Limpeza" value={cleaning ? daysAgoPhrase(cleaning.done_on, today) : "—"} hint={cleaning?.title ?? null} />
          <Stat label="Limpeza pesada" value={deep ? daysAgoPhrase(deep.done_on, today) : "—"} hint={deep?.title ?? null} />
          <Stat label="Reparo" value={repair ? daysAgoPhrase(repair.done_on, today) : "—"} hint={repair?.title ?? null} />
          <Stat label={`Gastos em ${summary.costs.year}`} value={formatMoney(summary.costs.year_total_cents)}>
            <MoreLink href={`/financas/lancamentos?origem=house:${area.id}`}>Ver em Finanças</MoreLink>
          </Stat>
        </>
      }
      activeItems={data.active_items}
      events={data.events}
      basePath={`/casa/${area.slug}`}
      category={categoria ?? null}
    />
  );
}
