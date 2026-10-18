import { OneTapButtons } from "@/components/one-tap/one-tap-buttons";
import { actionsFor, payLabel, type TapBill } from "@/lib/domain/one-tap";
import type { CareItem } from "@/lib/domain/types";

type ItemLike = Pick<
  CareItem,
  "id" | "title" | "subject_name" | "status" | "due_date" | "next_due_at" | "interval_days" | "interval_months" | "interval_hours"
>;

/** The one-tap buttons of a pending item: Paguei for a bill's reminder, Dose dada, or Feito / +1 dia / Ignorar. */
export function ItemActions({ item, bill = null, className = "mt-3" }: { item: ItemLike; bill?: TapBill | null; className?: string }) {
  const actions = actionsFor(item, bill);
  if (actions.length === 0) return null;
  const label = item.subject_name ? `${item.title} · ${item.subject_name}` : item.title;
  if (bill) return <OneTapButtons id={bill.id} shown={bill.next_due_date} actions={actions} label={label} className={className} />;
  const shown = item.interval_hours ? item.next_due_at : item.due_date;
  return <OneTapButtons id={item.id} shown={shown} actions={actions} label={label} className={className} />;
}

/** "Paguei" for a bill row on the finance screens. Income and inactive bills get nothing. */
export function BillActions({ bill, name, className = "" }: { bill: TapBill & { status: string }; name: string; className?: string }) {
  if (bill.status !== "active" || bill.kind === "income") return null;
  return (
    <OneTapButtons
      id={bill.id}
      shown={bill.next_due_date}
      actions={[{ kind: "pay", label: payLabel(bill), primary: true }]}
      label={name}
      className={className}
    />
  );
}
