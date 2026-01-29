export function IconDashboard(props: { className?: string }) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      className={props.className ?? "h-5 w-5"}
    >
      <path d="M3 13h8V3H3v10z" />
      <path d="M13 21h8V11h-8v10z" />
      <path d="M13 3h8v6h-8V3z" />
      <path d="M3 17h8v4H3v-4z" />
    </svg>
  );
}

export function IconUsers(props: { className?: string }) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      className={props.className ?? "h-5 w-5"}
    >
      <path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" />
      <circle cx="9" cy="7" r="4" />
      <path d="M22 21v-2a4 4 0 0 0-3-3.87" />
      <path d="M16 3.13a4 4 0 0 1 0 7.75" />
    </svg>
  );
}

export function IconFolder(props: { className?: string }) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      className={props.className ?? "h-5 w-5"}
    >
      <path d="M3 7a2 2 0 0 1 2-2h5l2 2h7a2 2 0 0 1 2 2v10a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V7z" />
    </svg>
  );
}

export function IconSettings(props: { className?: string }) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      className={props.className ?? "h-5 w-5"}
    >
      <path d="M12 15.5a3.5 3.5 0 1 0 0-7 3.5 3.5 0 0 0 0 7z" />
      <path d="M19.4 15a1.7 1.7 0 0 0 .33 1.87l.06.06a2 2 0 0 1-1.42 3.42h-.17a1.7 1.7 0 0 0-1.6 1.1 2 2 0 0 1-3.72 0 1.7 1.7 0 0 0-1.6-1.1H9.62a1.7 1.7 0 0 0-1.6 1.1 2 2 0 0 1-3.72 0 1.7 1.7 0 0 0-1.6-1.1H2.5a2 2 0 0 1-1.42-3.42l.06-.06A1.7 1.7 0 0 0 1.47 15a2 2 0 0 1 0-6 1.7 1.7 0 0 0-.33-1.87l-.06-.06A2 2 0 0 1 2.5 3.65h.17a1.7 1.7 0 0 0 1.6-1.1 2 2 0 0 1 3.72 0 1.7 1.7 0 0 0 1.6 1.1h.16a1.7 1.7 0 0 0 1.6-1.1 2 2 0 0 1 3.72 0 1.7 1.7 0 0 0 1.6 1.1h.17A2 2 0 0 1 22.92 6.9l-.06.06A1.7 1.7 0 0 0 22.53 9a2 2 0 0 1 0 6 1.7 1.7 0 0 0-1.13 0Z" />
    </svg>
  );
}

export function IconShield(props: { className?: string }) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      className={props.className ?? "h-5 w-5"}
    >
      <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
      <path d="M9 12l2 2 4-4" />
    </svg>
  );
}

