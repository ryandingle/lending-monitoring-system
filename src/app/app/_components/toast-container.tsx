"use client";

import { useEffect, useState, useCallback } from "react";
import { useSearchParams } from "next/navigation";

type ToastType = "success" | "error" | "warning" | "info";

interface Toast {
    id: string;
    type: ToastType;
    message: string;
}

export function ToastContainer() {
    const searchParams = useSearchParams();

    // Initialize state from URL params (NO effects)
    const [toasts, setToasts] = useState<Toast[]>(() => {
        const initial: Toast[] = [];

        const push = (type: ToastType, message: string) => {
            initial.push({
                id: `${initial.length}-${Date.now()}`,
                type,
                message,
            });
        };

        if (searchParams.get("saved") === "1")
            push("success", "Changes saved successfully!");
        if (searchParams.get("saved") === "0")
            push("error", "Failed to save changes.");

        if (searchParams.get("created") === "1")
            push("success", "Created successfully!");
        if (searchParams.get("created") === "0")
            push("error", "Failed to create.");

        if (searchParams.get("deleted") === "1")
            push("success", "Deleted successfully!");
        if (searchParams.get("deleted") === "0")
            push("error", "Failed to delete.");

        const error = searchParams.get("error");
        const success = searchParams.get("success");
        const warning = searchParams.get("warning");

        if (error) push("error", decodeURIComponent(error));
        if (success) push("success", decodeURIComponent(success));
        if (warning) push("warning", decodeURIComponent(warning));

        return initial;
    });

    // Stable remover
    const removeToast = useCallback((id: string) => {
        setToasts((prev) => prev.filter((t) => t.id !== id));
    }, []);

    // Auto-dismiss effect (REACTS to state — allowed)
    useEffect(() => {
        if (toasts.length === 0) return;

        const timers = toasts.map((toast) =>
            setTimeout(() => removeToast(toast.id), 5000)
        );

        return () => timers.forEach(clearTimeout);
    }, [toasts, removeToast]);

    if (toasts.length === 0) return null;

    return (
        <div className="fixed top-4 right-4 z-[10000] flex flex-col gap-2 max-w-md">
            {toasts.map((toast) => (
                <ToastItem
                    key={toast.id}
                    toast={toast}
                    onClose={() => removeToast(toast.id)}
                />
            ))}
        </div>
    );
}

function ToastItem({ toast, onClose }: { toast: Toast; onClose: () => void }) {
    const [isExiting, setIsExiting] = useState(false);

    const handleClose = () => {
        setIsExiting(true);
        setTimeout(onClose, 300);
    };

    const styles = {
        success: "bg-green-50 border-green-200 text-green-800",
        error: "bg-red-50 border-red-200 text-red-800",
        warning: "bg-yellow-50 border-yellow-200 text-yellow-800",
        info: "bg-blue-50 border-blue-200 text-blue-800",
    };

    const icons = {
        success: (
            <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
            </svg>
        ),
        error: (
            <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
        ),
        warning: (
            <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
            </svg>
        ),
        info: (
            <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
        ),
    };

    return (
        <div
            className={`
        ${styles[toast.type]}
        flex items-start gap-3 rounded-lg border p-4 shadow-lg backdrop-blur-sm
        transition-all duration-300 ease-out
        ${isExiting ? "translate-x-[120%] opacity-0" : "translate-x-0 opacity-100"}
        animate-in slide-in-from-right
      `}
        >
            <div className="flex-shrink-0 mt-0.5">{icons[toast.type]}</div>
            <div className="flex-1 text-sm font-medium">{toast.message}</div>
            <button
                onClick={handleClose}
                className="flex-shrink-0 rounded-lg p-1 hover:bg-black/5 transition-colors"
                aria-label="Close"
            >
                <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
            </button>
        </div>
    );
}
