import { ListPage } from "@/components/history/list-page";
import { PageNotice } from "@/components/history/page-notice";
import { SubjectCard } from "@/components/history/subject-card";
import { loadSubjectList } from "@/lib/services/subject-pages";
import { agePhrase, daysAgoPhrase } from "@/lib/ui/format";

export const dynamic = "force-dynamic";

export default async function FamilyPage() {
  const page = await loadSubjectList("family");
  if (page.status !== "ready") return <PageNotice status={page.status} />;
  const { data: members, today } = page;
  return (
    <ListPage title="Família" intro="Consultas, vacinas e remédios de cada pessoa." count={members.length} empty="Ninguém cadastrado. Peça ao seu agente para cadastrar.">
      {members.map(({ subject: member, active_items, summary }) => (
        <SubjectCard
          key={member.id}
          href={`/familia/${member.id}`}
          title={member.name}
          subtitle={[member.relationship, member.birth_date ? agePhrase(member.birth_date, today) : null].filter(Boolean).join(" · ") || null}
          next={active_items[0] ?? null}
          lines={summary.last_done_on ? [`Último registro ${daysAgoPhrase(summary.last_done_on, today)}`] : []}
        />
      ))}
    </ListPage>
  );
}
