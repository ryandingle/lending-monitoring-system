"use client";

import { createContext, useContext, useState } from "react";

type ReportsRangeContextValue = {
  from: string;
  to: string;
  setRange: (from: string, to: string) => void;
};

const ReportsRangeContext = createContext<ReportsRangeContextValue | null>(null);

export function ReportsRangeProvider({
  initialFrom,
  initialTo,
  children,
}: {
  initialFrom: string;
  initialTo: string;
  children: React.ReactNode;
}) {
  const [range, setRange] = useState({ from: initialFrom, to: initialTo });

  return (
    <ReportsRangeContext.Provider
      value={{
        from: range.from,
        to: range.to,
        setRange: (from, to) => {
          setRange({ from, to });
          // Keep the range in the URL (shareable / survives refresh) without a
          // server roundtrip, since the reports read it from this state.
          window.history.replaceState(null, "", `/app/reports?from=${from}&to=${to}`);
        },
      }}
    >
      {children}
    </ReportsRangeContext.Provider>
  );
}

export function useReportsRange() {
  const context = useContext(ReportsRangeContext);
  if (!context) {
    throw new Error("useReportsRange must be used within ReportsRangeProvider");
  }
  return context;
}
