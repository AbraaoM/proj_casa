import { ListPage } from "@/components/history/list-page";
import { PageNotice } from "@/components/history/page-notice";
import { SubjectCard } from "@/components/history/subject-card";
import { loadSubjectList } from "@/lib/services/subject-pages";
import { daysAgoPhrase, formatKm, formatMoney } from "@/lib/ui/format";

export const dynamic = "force-dynamic";

export default async function CarsPage() {
  const page = await loadSubjectList("vehicle");
  if (page.status !== "ready") return <PageNotice status={page.status} />;
  const { data: vehicles, today } = page;
  return (
    <ListPage title="Carros" intro="Manutenção, quilometragem e gastos de cada veículo." count={vehicles.length} empty="Nenhum veículo cadastrado. O James cadastra pela API.">
      {vehicles.map(({ subject: vehicle, active_items, summary }) => (
        <SubjectCard
          key={vehicle.id}
          href={`/carros/${vehicle.id}`}
          title={vehicle.name}
          subtitle={[[vehicle.make, vehicle.model].filter(Boolean).join(" "), vehicle.year, vehicle.odometer_km !== null ? formatKm(vehicle.odometer_km) : null]
            .filter(Boolean)
            .join(" · ") || null}
          next={active_items[0] ?? null}
          lines={[
            summary.oil
              ? `Óleo ${daysAgoPhrase(summary.oil.done_on, today)}${summary.oil.km_since !== null ? ` · ${formatKm(summary.oil.km_since)} rodados` : ""}`
              : null,
            summary.costs.year_total_cents > 0 ? `${formatMoney(summary.costs.year_total_cents)} em ${summary.costs.year}` : null,
          ].filter((line): line is string => line !== null)}
        />
      ))}
    </ListPage>
  );
}
