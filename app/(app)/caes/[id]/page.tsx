import Link from "next/link";
import { PageNotice } from "@/components/history/page-notice";
import { Stat } from "@/components/history/stat";
import { SubjectDetail } from "@/components/history/subject-detail";
import { WeightSpark } from "@/components/history/weight-spark";
import { loadSubjectDetail } from "@/lib/services/subject-pages";
import { agePhrase, daysAgoPhrase, formatDate, formatKg, formatMoney } from "@/lib/ui/format";

export const dynamic = "force-dynamic";

const SEX = { male: "Macho", female: "Fêmea", unknown: null } as const;

type Props = { params: Promise<{ id: string }>; searchParams: Promise<{ categoria?: string }> };

export default async function DogPage({ params, searchParams }: Props) {
  const [{ id }, { categoria }] = await Promise.all([params, searchParams]);
  const page = await loadSubjectDetail("dog", id);
  if (page.status !== "ready") return <PageNotice status={page.status} backHref="/caes" />;
  const { today, data } = page;
  const { subject: dog, summary } = data;
  const vaccine = summary.last_by_category.vaccine;
  const deworming = summary.last_by_category.deworming;
  const vet = summary.last_by_category.vet;

  return (
    <SubjectDetail
      back={{ href: "/caes", label: "Cães" }}
      eyebrow={dog.archived_at ? "Cão · arquivado" : "Cão"}
      title={dog.name}
      facts={[
        ["Raça", dog.breed],
        ["Sexo", SEX[dog.sex]],
        ["Idade", dog.birth_date ? agePhrase(dog.birth_date, today) : null],
        ["Nascimento", dog.birth_date ? formatDate(dog.birth_date) : null],
      ]}
      stats={
        <>
          <Stat
            label="Peso"
            value={dog.weight_kg !== null ? formatKg(dog.weight_kg) : "—"}
            hint={summary.weight_series.length === 1 ? `em ${formatDate(summary.weight_series[0]!.done_on)}` : null}
          >
            <WeightSpark series={summary.weight_series} />
          </Stat>
          <Stat label="Vacina" value={vaccine ? daysAgoPhrase(vaccine.done_on, today) : "—"} hint={vaccine?.title ?? null} />
          <Stat label="Vermífugo" value={deworming ? daysAgoPhrase(deworming.done_on, today) : "—"} hint={deworming?.title ?? null} />
          <Stat label="Veterinário" value={vet ? daysAgoPhrase(vet.done_on, today) : "—"} hint={vet?.title ?? null} />
          <Stat
            label={`Gastos em ${summary.costs.year}`}
            value={formatMoney(summary.costs.year_total_cents)}
            hint={summary.costs.all_time_cents > summary.costs.year_total_cents ? `${formatMoney(summary.costs.all_time_cents)} no total` : null}
          >
            <Link
              href={`/financas/lancamentos?origem=dog:${dog.id}`}
              className="mt-2 inline-block text-sm text-accent-dark underline-offset-4 transition-colors duration-300 hover:underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent dark:text-accent-light"
            >
              Ver em Finanças
            </Link>
          </Stat>
        </>
      }
      activeItems={data.active_items}
      events={data.events}
      basePath={`/caes/${dog.id}`}
      category={categoria ?? null}
    />
  );
}
