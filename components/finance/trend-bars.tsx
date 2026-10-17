import { monthLabel } from "@/lib/domain/history";
import { formatMoney } from "@/lib/ui/format";

/** Six tiny bars, oldest to newest; the last one (the month shown) is emphasized. */
export function TrendBars({ months, values, label }: { months: string[]; values: number[]; label: string }) {
  const max = Math.max(...values, 1);
  const width = 6 * 10 - 4;
  const summary = months.map((month, index) => `${monthLabel(month)}: ${formatMoney(values[index] ?? 0)}`).join("; ");
  return (
    <svg viewBox={`0 0 ${width} 24`} width={width} height={24} role="img" aria-label={`${label}, últimos 6 meses. ${summary}`} className="shrink-0">
      {values.map((value, index) => {
        const height = Math.max(1, Math.round((Math.max(0, value) / max) * 22));
        const last = index === values.length - 1;
        return (
          <rect
            key={months[index]}
            x={index * 10}
            y={24 - height}
            width={6}
            height={height}
            className={last ? "fill-black dark:fill-white" : "fill-ink-faint/60"}
          />
        );
      })}
    </svg>
  );
}
