"use client";

import type { ButtonHTMLAttributes } from "react";
import { useMemo, useRef, useState } from "react";
import { Modal } from "./modal";

export function ConfirmSubmitButton(
  props: ButtonHTMLAttributes<HTMLButtonElement> & {
    confirmMessage: string;
  },
) {
  const { confirmMessage, onClick, children, ...rest } = props;
  const [open, setOpen] = useState(false);
  const btnRef = useRef<HTMLButtonElement | null>(null);

  const submitLabel = useMemo(() => {
    if (typeof children === "string") return children;
    return "Confirm";
  }, [children]);

  return (
    <>
      <button
        {...rest}
        ref={btnRef}
        type="button"
        onClick={(e) => {
          setOpen(true);
          onClick?.(e);
        }}
      >
        {children}
      </button>

      <Modal
        open={open}
        title="Confirm action"
        description={confirmMessage}
        onClose={() => setOpen(false)}
        footer={
          <>
            <button
              type="button"
              onClick={() => setOpen(false)}
              className="rounded-lg border border-slate-800 bg-slate-950 px-4 py-2 text-sm font-medium text-slate-200 hover:bg-slate-900/60"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={() => {
                const form = btnRef.current?.form;
                setOpen(false);
                if (!form) return;
                if (typeof (form as any).requestSubmit === "function") {
                  (form as any).requestSubmit();
                } else {
                  form.submit();
                }
              }}
              className="rounded-lg bg-red-600 px-4 py-2 text-sm font-medium text-white hover:bg-red-700"
            >
              {submitLabel}
            </button>
          </>
        }
      />
    </>
  );
}

