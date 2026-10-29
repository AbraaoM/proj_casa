import { PageNotice } from "@/components/history/page-notice";
import { Stat } from "@/components/history/stat";
import { Medications } from "@/components/history/medications";
import { SubjectDetail } from "@/components/history/subject-detail";
import { loadSubjectDetail } from "@/lib/services/subject-pages";
import { agePhrase, daysAgoPhrase, formatDate } from "@/lib/ui/format";
import { matchesSearch, searchQuery } from "@/lib/ui/search";

export const dynamic = "force-dynamic";

type Props = { params: Promise<{ id: string }>; searchParams: Promise<{ categoria?: string; q?: string }> };

export default async function FamilyMemberPage({ params, searchParams }: Props) {
  const [{ id }, { categoria, q }] = await Promise.all([params, searchParams]);
  const query = searchQuery(q);
  const page = await loadSubjectDetail("family", id);
  if (page.status !== "ready") return <PageNotice status={page.status} backHref="/familia" />;
  const { today, data } = page;
  const { subject: member, summary } = data;
  const pick = (slug: string) => summary.last_by_category[slug];
  const stats: Array<[string, string]> = [
    ["Consulta", "medical"],
    ["Dentista", "dentist"],
    ["Vacina", "vaccine"],
    ["Remédio", "medicine"],
  ];

  return (
    <SubjectDetail
      back={{ href: "/familia", label: "Família" }}
      eyebrow={member.archived_at ? "Família · arquivado" : "Família"}
      title={member.name}
      facts={[
        ["Parentesco", member.relationship],
        ["Idade", member.birth_date ? agePhrase(member.birth_date, today) : null],
        ["Nascimento", member.birth_date ? formatDate(member.birth_date) : null],
      ]}
      stats={stats.map(([label, slug]) => {
        const last = pick(slug);
        return <Stat key={slug} label={label} value={last ? daysAgoPhrase(last.done_on, today) : "—"} hint={last?.title ?? null} />;
      })}
      activeItems={data.active_items}
      events={data.events}
      basePath={`/familia/${member.id}`}
      category={categoria ?? null}
      query={query}
      lead={<Medications medications={data.medications.filter((medication) => matchesSearch(query, [medication.item.title, medication.item.notes]))} today={today} />}
    />
  );
}
