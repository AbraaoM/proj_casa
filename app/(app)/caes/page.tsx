import { ListPage } from "@/components/history/list-page";
import { PageNotice } from "@/components/history/page-notice";
import { SubjectCard } from "@/components/history/subject-card";
import { loadSubjectList } from "@/lib/services/subject-pages";
import { agePhrase, daysAgoPhrase, formatKg } from "@/lib/ui/format";

export const dynamic = "force-dynamic";

export default async function DogsPage() {
  const page = await loadSubjectList("dog");
  if (page.status !== "ready") return <PageNotice status={page.status} />;
  const { data: dogs, today } = page;
  return (
    <ListPage title="Cães" intro="Cada cão com o que vem pela frente e o que já foi feito." count={dogs.length} empty="Nenhum cão cadastrado. O James cadastra pela API.">
      {dogs.map(({ subject: dog, active_items, summary }) => {
        const vet = summary.last_by_category.vet;
        const vaccine = summary.last_by_category.vaccine;
        return (
          <SubjectCard
            key={dog.id}
            href={`/caes/${dog.id}`}
            title={dog.name}
            subtitle={[dog.breed, dog.birth_date ? agePhrase(dog.birth_date, today) : null, dog.weight_kg !== null ? formatKg(dog.weight_kg) : null]
              .filter(Boolean)
              .join(" · ") || null}
            next={active_items[0] ?? null}
            lines={[
              vaccine ? `Última vacina ${daysAgoPhrase(vaccine.done_on, today)}` : null,
              vet ? `Veterinário ${daysAgoPhrase(vet.done_on, today)}` : null,
            ].filter((line): line is string => line !== null)}
          />
        );
      })}
    </ListPage>
  );
}
