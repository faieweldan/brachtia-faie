export default function Logo({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 64 64" fill="none" className={className} aria-hidden="true">
      <path
        d="M4 40 L26 14 L34 23 M60 40 L38 14 L26 28"
        stroke="currentColor"
        strokeWidth="3"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <rect x="26" y="34" width="5" height="5" stroke="currentColor" strokeWidth="2" />
      <rect x="34" y="34" width="5" height="5" stroke="currentColor" strokeWidth="2" />
      <rect x="26" y="42" width="5" height="5" stroke="currentColor" strokeWidth="2" />
      <rect x="34" y="42" width="5" height="5" stroke="currentColor" strokeWidth="2" />
    </svg>
  );
}
