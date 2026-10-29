import { PageNotice } from "@/components/history/page-notice";
import { Stat } from "@/components/history/stat";
import { SubjectDetail } from "@/components/history/subject-detail";
import { loadHouseGeneral } from "@/lib/services/subject-pages";
import { daysAgoPhrase, formatMoney } from "@/lib/ui/format";
import { searchQuery } from "@/lib/ui/search";

export const dynamic = "force-dynamic";

type Props = { searchParams: Promise<{ categoria?: string; q?: string }> };

/** House items and events without an area. */
export default async function HouseGeneralPage({ searchParams }: Props) {
  const { categoria, q } = await searchParams;
  const page = await loadHouseGeneral();
  if (page.status !== "ready") return <PageNotice status={page.status} backHref="/casa" />;
  const { today, data } = page;
  return (
    <SubjectDetail
      back={{ href: "/casa", label: "Casa" }}
      eyebrow="Casa · sem área"
      title="Geral"
      facts={[]}
      stats={
        <>
          <Stat label="Último registro" value={data.summary.last_done_on ? daysAgoPhrase(data.summary.last_done_on, today) : "—"} />
          <Stat label={`Gastos em ${data.summary.costs.year}`} value={formatMoney(data.summary.costs.year_total_cents)} />
        </>
      }
      activeItems={data.active_items}
      events={data.events}
      basePath="/casa/geral"
      category={categoria ?? null}
      query={searchQuery(q)}
    />
  );
}
