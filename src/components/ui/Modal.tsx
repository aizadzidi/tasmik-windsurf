"use client";

import React from "react";
import Portal from "@/components/Portal";

type ModalProps = {
  open: boolean;
  title: string;
  description?: string;
  children: React.ReactNode;
  footer?: React.ReactNode;
  onClose: () => void;
};

export function Modal({ open, title, description, children, footer, onClose }: ModalProps) {
  React.useEffect(() => {
    if (!open) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [open, onClose]);

  if (!open) return null;

  return (
    <Portal>
      <div className="fixed inset-0 z-50">
        <button
          type="button"
          aria-label="Close dialog"
          className="absolute inset-0 bg-black/35 backdrop-blur-[2px]"
          onClick={onClose}
        />
        <div className="absolute inset-x-0 bottom-0 flex justify-center p-3 sm:inset-0 sm:items-center sm:p-6">
          <div
            role="dialog"
            aria-modal="true"
            aria-label={title}
            className="w-full max-w-xl rounded-2xl border border-gray-200 bg-white shadow-[0_30px_80px_rgba(15,23,42,0.18)] dark:border-slate-700 dark:bg-slate-900"
          >
            <div className="flex items-start justify-between gap-4 border-b border-gray-100 px-5 py-4 dark:border-slate-800">
              <div className="min-w-0">
                <h2 className="truncate text-sm font-semibold text-gray-900 dark:text-slate-50">{title}</h2>
                {description ? (
                  <p className="mt-1 text-xs text-gray-500 dark:text-slate-400">{description}</p>
                ) : null}
              </div>
              <button
                type="button"
                onClick={onClose}
                className="inline-flex h-8 w-8 items-center justify-center rounded-full text-gray-500 transition hover:bg-gray-100 hover:text-gray-900 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-offset-1 dark:text-slate-400 dark:hover:bg-slate-800 dark:hover:text-slate-100"
              >
                <span className="sr-only">Close</span>
                <svg viewBox="0 0 24 24" className="h-4 w-4" aria-hidden="true">
                  <path
                    d="M6 6l12 12M18 6L6 18"
                    stroke="currentColor"
                    strokeWidth="2"
                    strokeLinecap="round"
                  />
                </svg>
              </button>
            </div>
            <div className="px-5 py-4">{children}</div>
            {footer ? (
              <div className="border-t border-gray-100 px-5 py-4 dark:border-slate-800">{footer}</div>
            ) : null}
          </div>
        </div>
      </div>
    </Portal>
  );
}

