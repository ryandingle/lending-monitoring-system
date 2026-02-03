"use client";

import { useFormStatus } from "react-dom";
import { ButtonHTMLAttributes } from "react";

interface SubmitButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
    children: React.ReactNode;
    loadingText?: string;
    variant?: "primary" | "secondary" | "danger";
}

export function SubmitButton({
    children,
    loadingText = "Processing...",
    variant = "primary",
    className = "",
    disabled,
    ...props
}: SubmitButtonProps) {
    const { pending } = useFormStatus();

    const baseStyles = "rounded-lg px-4 py-2 text-sm font-medium transition-all disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2 justify-center";

    const variantStyles = {
        primary: "bg-blue-600 text-white hover:bg-blue-700",
        secondary: "border border-slate-800 bg-slate-950 text-slate-200 hover:bg-slate-900/60",
        danger: "bg-red-600 text-white hover:bg-red-700",
    };

    return (
        <button
            type="submit"
            disabled={pending || disabled}
            className={`${baseStyles} ${variantStyles[variant]} ${className}`}
            {...props}
        >
            {pending && (
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
            {pending ? loadingText : children}
        </button>
    );
}
