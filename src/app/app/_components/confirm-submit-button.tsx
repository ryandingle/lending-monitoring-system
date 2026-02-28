"use client";

import type { ButtonHTMLAttributes } from "react";
import { useMemo, useRef, useState } from "react";
import { Modal } from "./modal";

export function ConfirmSubmitButton(
  props: ButtonHTMLAttributes<HTMLButtonElement> & {
    confirmMessage: string;
    loadingText?: string;
  },
) {
  const { confirmMessage, loadingText = "Deleting...", onClick, children, ...rest } = props;
  const [open, setOpen] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const btnRef = useRef<HTMLButtonElement | null>(null);

  const submitLabel = useMemo(() => {
    if (typeof children === "string") return children;
    return "Confirm";
  }, [children]);

  const handleConfirm = () => {
    const form = btnRef.current?.form;
    if (!form) return;

    setIsSubmitting(true);

    // Submit the form
    if (typeof (form as any).requestSubmit === "function") {
      (form as any).requestSubmit();
    } else {
      form.submit();
    }
  };

  return (
    <>
      <button
        {...rest}
        ref={btnRef}
        type="button"
        onClick={(e) => {
          setOpen(true);
          setIsSubmitting(false);
          onClick?.(e);
        }}
      >
        {children}
      </button>

      <Modal
        open={open}
        title="Confirm action"
        description={confirmMessage}
        onClose={() => {
          if (!isSubmitting) {
            setOpen(false);
          }
        }}
        footer={
          <>
            <button
              type="button"
              onClick={() => setOpen(false)}
              disabled={isSubmitting}
              className="rounded-lg border border-slate-200 bg-white px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={handleConfirm}
              disabled={isSubmitting}
              className="rounded-lg bg-red-600 px-4 py-2 text-sm font-medium text-white hover:bg-red-700 disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2 transition-all"
            >
              {isSubmitting && (
                <svg
                  className="h-4 w-4 animate-spin"
                  xmlns="http://www.w3.org/2000/svg"
                  fill="none"
                  viewBox="0 0 24 24"
                >
                  <circle
                    className="opacity-25"
                    cx="12"
                    cy="12"
                    r="10"
                    stroke="currentColor"
                    strokeWidth="4"
                  />
                  <path
                    className="opacity-75"
                    fill="currentColor"
                    d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
                  />
                </svg>
              )}
              {isSubmitting ? loadingText : submitLabel}
            </button>
          </>
        }
      />
    </>
  );
}
