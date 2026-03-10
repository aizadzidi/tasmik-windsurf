"use client";

import React from "react";
import Portal from "@/components/Portal";

export type PlannerContextAction = {
  id: string;
  label: string;
  tone?: "default" | "danger";
  disabled?: boolean;
  onSelect: () => void;
};

type PlannerContextMenuProps = {
  open: boolean;
  x: number;
  y: number;
  title?: string;
  actions: PlannerContextAction[];
  onClose: () => void;
};

export function PlannerContextMenu({
  open,
  x,
  y,
  title,
  actions,
  onClose,
}: PlannerContextMenuProps) {
  React.useEffect(() => {
    if (!open) return;
    const close = () => onClose();
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    window.addEventListener("click", close);
    window.addEventListener("contextmenu", close);
    window.addEventListener("keydown", onKeyDown);
    return () => {
      window.removeEventListener("click", close);
      window.removeEventListener("contextmenu", close);
      window.removeEventListener("keydown", onKeyDown);
    };
  }, [open, onClose]);

  if (!open) return null;

  return (
    <Portal>
      <div
        className="fixed z-[70] min-w-56 rounded-2xl border border-slate-200 bg-white p-2 shadow-[0_24px_80px_rgba(15,23,42,0.18)]"
        style={{
          left: Math.min(x, window.innerWidth - 260),
          top: Math.min(y, window.innerHeight - 280),
        }}
      >
        {title ? (
          <div className="border-b border-slate-100 px-3 py-2 text-[11px] font-semibold uppercase tracking-[0.22em] text-slate-400">
            {title}
          </div>
        ) : null}
        <div className="py-1">
          {actions.map((action) => (
            <button
              key={action.id}
              type="button"
              disabled={action.disabled}
              onClick={() => {
                action.onSelect();
                onClose();
              }}
              className={`flex w-full items-center justify-between rounded-xl px-3 py-2 text-left text-sm transition ${
                action.disabled
                  ? "cursor-not-allowed text-slate-300"
                  : action.tone === "danger"
                    ? "text-rose-600 hover:bg-rose-50"
                    : "text-slate-700 hover:bg-slate-50"
              }`}
            >
              <span>{action.label}</span>
            </button>
          ))}
        </div>
      </div>
    </Portal>
  );
}
