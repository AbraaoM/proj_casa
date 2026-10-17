import { PageNotice } from "@/components/history/page-notice";
import { Stat } from "@/components/history/stat";
import { SubjectDetail } from "@/components/history/subject-detail";
import { loadSubjectDetail } from "@/lib/services/subject-pages";
import { categoryLabel, daysAgoPhrase, formatKm, formatMoney } from "@/lib/ui/format";

export const dynamic = "force-dynamic";

type Props = { params: Promise<{ id: string }>; searchParams: Promise<{ categoria?: string }> };

export default async function CarPage({ params, searchParams }: Props) {
  const [{ id }, { categoria }] = await Promise.all([params, searchParams]);
  const page = await loadSubjectDetail("vehicle", id);
  if (page.status !== "ready") return <PageNotice status={page.status} backHref="/carros" />;
  const { today, data } = page;
  const { subject: vehicle, summary } = data;
  const service = summary.last_by_category.service;
  const tire = summary.last_by_category.tire;
  const topCategory = Object.entries(summary.costs.year_by_category).sort((a, b) => b[1] - a[1])[0];

  return (
    <SubjectDetail
      back={{ href: "/carros", label: "Carros" }}
      eyebrow={vehicle.archived_at ? "Carro · arquivado" : "Carro"}
      title={vehicle.name}
      facts={[
        ["Modelo", [vehicle.make, vehicle.model].filter(Boolean).join(" ") || null],
        ["Ano", vehicle.year !== null ? String(vehicle.year) : null],
        ["Placa", vehicle.plate],
      ]}
      stats={
        <>
          <Stat label="Hodômetro" value={vehicle.odometer_km !== null ? formatKm(vehicle.odometer_km) : "—"} />
          <Stat
            label="Óleo"
            value={summary.oil ? (summary.oil.km_since !== null ? formatKm(summary.oil.km_since) : daysAgoPhrase(summary.oil.done_on, today)) : "—"}
            hint={summary.oil ? (summary.oil.km_since !== null ? `rodados · ${daysAgoPhrase(summary.oil.done_on, today)}` : null) : null}
          />
          <Stat label="Revisão" value={service ? daysAgoPhrase(service.done_on, today) : "—"} hint={service?.title ?? null} />
          <Stat label="Pneus" value={tire ? daysAgoPhrase(tire.done_on, today) : "—"} hint={tire?.title ?? null} />
          <Stat
            label={`Gastos em ${summary.costs.year}`}
            value={formatMoney(summary.costs.year_total_cents)}
            hint={topCategory ? `maior: ${categoryLabel(topCategory[0])}, ${formatMoney(topCategory[1])}` : null}
          />
        </>
      }
      activeItems={data.active_items}
      events={data.events}
      basePath={`/carros/${vehicle.id}`}
      category={categoria ?? null}
    />
  );
}
