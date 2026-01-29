"use client";

import { Children, useEffect, useMemo, useRef } from "react";

export function Modal({
  open,
  title,
  description,
  onClose,
  children,
  footer,
}: {
  open: boolean;
  title: string;
  description?: string;
  onClose: () => void;
  children?: React.ReactNode;
  footer?: React.ReactNode;
}) {
  const closeBtnRef = useRef<HTMLButtonElement | null>(null);

  useEffect(() => {
    if (!open) return;
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = prevOverflow;
    };
  }, [open]);

  useEffect(() => {
    if (!open) return;
    function onKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [open, onClose]);

  useEffect(() => {
    if (!open) return;
    // focus close button for keyboard users
    queueMicrotask(() => closeBtnRef.current?.focus());
  }, [open]);

  const content = useMemo(() => {
    if (!open) return null;
    const hasBody = Children.count(children) > 0;
    return (
      <div className="fixed inset-0 z-50">
        <button
          type="button"
          aria-label="Close dialog"
          className="absolute inset-0 cursor-default bg-slate-950/70"
          onClick={onClose}
        />
        <div className="absolute inset-0 grid place-items-center p-4">
          <div
            role="dialog"
            aria-modal="true"
            aria-label={title}
            className="w-full max-w-lg overflow-hidden rounded-2xl border border-slate-800 bg-slate-950 shadow-2xl"
          >
            <div className="flex items-start justify-between gap-4 border-b border-slate-800 px-5 py-4">
              <div className="min-w-0">
                <div className="text-base font-semibold text-slate-100">{title}</div>
                {description ? (
                  <div className="mt-1 text-sm text-slate-400">{description}</div>
                ) : null}
              </div>
              <button
                ref={closeBtnRef}
                type="button"
                onClick={onClose}
                className="grid h-9 w-9 place-items-center rounded-lg border border-slate-800 bg-slate-950 text-slate-200 hover:bg-slate-900/60"
              >
                <span className="sr-only">Close</span>
                <svg
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                  className="h-5 w-5"
                >
                  <path d="M18 6 6 18" />
                  <path d="M6 6l12 12" />
                </svg>
              </button>
            </div>

            {hasBody ? <div className="px-5 py-4">{children}</div> : null}

            {footer ? (
              <div className="flex flex-wrap items-center justify-end gap-2 border-t border-slate-800 px-5 py-4">
                {footer}
              </div>
            ) : null}
          </div>
        </div>
      </div>
    );
  }, [children, description, footer, onClose, open, title]);

  return content;
}

