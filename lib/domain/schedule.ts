import { addDays } from "@/lib/domain/dates";
import { addMonths } from "@/lib/domain/finance/dates";
import type { ItemStatus } from "@/lib/domain/types";

export type ScheduleSnapshot = {
  last_done_on: string | null;
  due_date: string | null;
  interval_days: number | null;
  interval_months?: number | null;
  status: ItemStatus;
};

export type ScheduleUpdate = {
  advance: boolean;
  last_done_on: string;
  due_date: string | null;
  status: ItemStatus;
};

export function applyDone(item: ScheduleSnapshot, doneOn: string): ScheduleUpdate {
  const isOlder = item.last_done_on !== null && doneOn < item.last_done_on;
  if (isOlder && item.last_done_on) {
    return {
      advance: false,
      last_done_on: item.last_done_on,
      due_date: item.due_date,
      status: item.status,
    };
  }

  if (item.interval_days && item.interval_days > 0) {
    return {
      advance: true,
      last_done_on: doneOn,
      due_date: addDays(doneOn, item.interval_days),
      status: "active",
    };
  }

  if (item.interval_months && item.interval_months > 0) {
    return {
      advance: true,
      last_done_on: doneOn,
      due_date: addMonths(doneOn, item.interval_months),
      status: "active",
    };
  }

  return {
    advance: true,
    last_done_on: doneOn,
    due_date: item.due_date,
    status: "completed",
  };
}
