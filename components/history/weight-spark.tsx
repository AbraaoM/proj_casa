import { formatDate, formatKg } from "@/lib/ui/format";

/** Tiny inline SVG line of the weight series. No chart library. */
export function WeightSpark({ series }: { series: Array<{ done_on: string; weight_kg: number }> }) {
  if (series.length < 2) return null;
  const width = 160;
  const height = 40;
  const pad = 4;
  const values = series.map((point) => point.weight_kg);
  const min = Math.min(...values);
  const max = Math.max(...values);
  const span = max - min || 1;
  const points = series.map((point, index) => {
    const x = pad + (index / (series.length - 1)) * (width - pad * 2);
    const y = pad + (1 - (point.weight_kg - min) / span) * (height - pad * 2);
    return [Math.round(x * 10) / 10, Math.round(y * 10) / 10] as const;
  });
  const last = points[points.length - 1]!;
  const first = series[0]!;
  const latest = series[series.length - 1]!;
  return (
    <figure className="mt-3">
      <svg
        viewBox={`0 0 ${width} ${height}`}
        className="h-10 w-40 text-black dark:text-white"
        role="img"
        aria-label={`Peso de ${formatKg(first.weight_kg)} em ${formatDate(first.done_on)} para ${formatKg(latest.weight_kg)} em ${formatDate(latest.done_on)}`}
      >
        <polyline
          points={points.map(([x, y]) => `${x},${y}`).join(" ")}
          fill="none"
          stroke="currentColor"
          strokeWidth="1.5"
          strokeLinejoin="round"
          strokeLinecap="round"
        />
        <circle cx={last[0]} cy={last[1]} r="3" className="fill-accent" />
      </svg>
      <figcaption className="mt-1 text-xs text-ink-muted">
        {series.length} pesagens desde {formatDate(first.done_on)}
      </figcaption>
    </figure>
  );
}
