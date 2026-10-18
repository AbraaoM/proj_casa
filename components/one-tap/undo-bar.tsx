"use client";

import { createContext, useActionState, useCallback, useContext, useEffect, useState, type ReactNode } from "react";
import { UNDO_SECONDS } from "@/lib/domain/one-tap";
import { undoAction, type UndoState } from "@/lib/one-tap/actions";

type Notice = { message: string; undo: string | null; id: number };
type Show = (notice: { message: string; undo: string | null }) => void;

const UndoContext = createContext<Show>(() => {});

export function useUndoBar(): Show {
  return useContext(UndoContext);
}

const INITIAL: UndoState = { status: "idle", message: null, at: 0 };

/**
 * One bar for the whole screen, above the bottom navigation. It lives in the app
 * shell, so it survives the item leaving the list after the tap.
 */
export function UndoProvider({ children }: { children: ReactNode }) {
  const [notice, setNotice] = useState<Notice | null>(null);
  const show = useCallback<Show>((next) => setNotice({ ...next, id: Date.now() }), []);
  return (
    <UndoContext.Provider value={show}>
      {children}
      {notice ? <UndoBar key={notice.id} notice={notice} onClose={() => setNotice(null)} /> : null}
    </UndoContext.Provider>
  );
}

function UndoBar({ notice, onClose }: { notice: Notice; onClose: () => void }) {
  const [left, setLeft] = useState(UNDO_SECONDS);
  const [state, action, pending] = useActionState(undoAction, INITIAL);
  const settled = state.status !== "idle";

  useEffect(() => {
    if (pending) return;
    if (settled || !notice.undo) {
      const timer = setTimeout(onClose, 2000);
      return () => clearTimeout(timer);
    }
    if (left <= 0) {
      onClose();
      return;
    }
    const timer = setTimeout(() => setLeft((value) => value - 1), 1000);
    return () => clearTimeout(timer);
  }, [left, pending, settled, notice.undo, onClose]);

  const text = settled ? state.message : notice.message;
  return (
    <div className="pointer-events-none fixed inset-x-0 bottom-[calc(4.75rem+env(safe-area-inset-bottom))] z-50 flex justify-center px-3 md:bottom-6 md:pl-20 lg:pl-60">
      <div
        role="status"
        aria-live="polite"
        className="pointer-events-auto flex w-full max-w-md items-center gap-3 rounded-xl bg-soft-black px-4 py-2 text-sm text-white shadow-lg dark:bg-white dark:text-soft-black"
      >
        <span className="min-w-0 flex-1 py-2">{text}</span>
        {notice.undo && !settled ? (
          <form action={action}>
            <input type="hidden" name="undo" value={notice.undo} />
            <button
              type="submit"
              disabled={pending}
              className="min-h-11 rounded-md px-2 font-medium text-accent-light focus-visible:outline-2 focus-visible:outline-accent dark:text-accent-dark"
            >
              {pending ? "Desfazendo…" : `Desfazer (${left})`}
            </button>
          </form>
        ) : null}
      </div>
    </div>
  );
}
