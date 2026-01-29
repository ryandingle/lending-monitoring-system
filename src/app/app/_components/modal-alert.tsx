"use client";

import { useState } from "react";
import { Modal } from "./modal";

export function ModalAlert({
  title,
  message,
}: {
  title: string;
  message: string;
}) {
  const [open, setOpen] = useState(true);

  return (
    <Modal
      open={open}
      title={title}
      description={message}
      onClose={() => setOpen(false)}
      footer={
        <button
          type="button"
          onClick={() => setOpen(false)}
          className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700"
        >
          OK
        </button>
      }
    />
  );
}

