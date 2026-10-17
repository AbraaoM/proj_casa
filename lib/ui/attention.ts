import type { AttentionState, Priority } from "@/lib/domain/types";

export function markerClass(attention: AttentionState): string {
  if (attention === "due_today") return "border-accent";
  if (attention === "overdue") return "border-black dark:border-white";
  return "border-transparent";
}

export function priorityWord(priority: Priority): string | null {
  if (priority === "urgent") return "urgente";
  if (priority === "high") return "alta";
  return null;
}
