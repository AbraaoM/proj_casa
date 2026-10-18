"use client";

import { useActionState, useEffect } from "react";
import type { TapAction } from "@/lib/domain/one-tap";
import { tapAction, type TapState } from "@/lib/one-tap/actions";
import { useUndoBar } from "@/components/one-tap/undo-bar";

const INITIAL: TapState = { status: "idle", message: null, undo: null, at: 0 };

const BASE =
  "inline-flex min-h-11 items-center rounded-full px-4 text-sm font-medium transition-colors duration-200 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent disabled:opacity-60";
const PRIMARY = `${BASE} bg-accent text-soft-black hover:bg-accent-light`;
const SECONDARY = `${BASE} bg-line text-soft-black hover:bg-ink-faint/40 dark:bg-line-dark dark:text-white dark:hover:bg-ink-muted/40`;

/**
 * The one-tap buttons of an item or bill. One form: the tapped button sends its kind.
 * `shown` is what the screen showed (due date or dose time), so a stale tab replays.
 */
export function OneTapButtons({
  id,
  shown,
  actions,
  label,
  className = "",
}: {
  id: string;
  shown: string | null;
  actions: TapAction[];
  /** Accessible name of the thing, e.g. "Vermífugo · Thor". */
  label: string;
  className?: string;
}) {
  const [state, action, pending] = useActionState(tapAction, INITIAL);
  const show = useUndoBar();

  useEffect(() => {
    if (state.status === "idle") return;
    show({ message: state.message ?? "", undo: state.status === "done" ? state.undo : null });
  }, [state, show]);

  if (actions.length === 0) return null;
  return (
    <form action={action} className={`flex flex-wrap gap-2 ${className}`} aria-label={`Ações: ${label}`}>
      <input type="hidden" name="id" value={id} />
      <input type="hidden" name="shown" value={shown ?? ""} />
      {actions.map((item) => (
        <button
          key={item.kind}
          type="submit"
          name="kind"
          value={item.kind}
          disabled={pending}
          aria-label={`${item.label}: ${label}`}
          className={item.primary ? PRIMARY : SECONDARY}
        >
          {item.label}
        </button>
      ))}
    </form>
  );
}
