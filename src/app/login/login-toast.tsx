"use client";

import { useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";

export function LoginToast() {
    const searchParams = useSearchParams();

    const [show, setShow] = useState(
        () => searchParams.get("error") === "invalid"
    );

    useEffect(() => {
        if (!show) return;

        const timer = setTimeout(() => setShow(false), 5000);
        return () => clearTimeout(timer);
    }, [show]);

    if (!show) return null;

    return (
        <div className="fixed top-4 right-4 z-[10000] max-w-md animate-in slide-in-from-right">
            <div className="flex items-start gap-3 rounded-lg border border-red-700 bg-red-900/90 p-4 text-red-100 shadow-lg backdrop-blur-sm">
                <div className="flex-shrink-0 mt-0.5">
                    <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                    </svg>
                </div>
                <div className="flex-1 text-sm font-medium">
                    Invalid username or password. Please try again.
                </div>
                <button
                    onClick={() => setShow(false)}
                    className="flex-shrink-0 rounded-lg p-1 hover:bg-white/10 transition-colors"
                    aria-label="Close"
                >
                    <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                    </svg>
                </button>
            </div>
        </div>
    );
}
