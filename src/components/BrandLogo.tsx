import { useId } from "react";

/**
 * The LiveMaid brand mark — the SAME artwork as the app favicon (`src/app/icon.svg`): a rounded
 * indigo→violet gradient tile containing a small flowchart (rounded-rect node connected down to a
 * decision diamond and a stadium node). Inlined as an SVG so it scales crisply and needs no network
 * fetch. The gradient id is made unique per instance (`useId`) so multiple logos on one page never
 * collide. The tile already includes its own rounded background, so render it WITHOUT a wrapper box.
 */
export function BrandLogo({ className = "w-9 h-9" }: { className?: string }) {
  const gradId = useId();
  return (
    <svg viewBox="0 0 512 512" className={className} role="img" aria-label="LiveMaid logo">
      <defs>
        <linearGradient id={gradId} x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" stopColor="#a855f7" />
          <stop offset="100%" stopColor="#4f46e5" />
        </linearGradient>
      </defs>
      <rect width="512" height="512" rx="128" fill={`url(#${gradId})`} />
      <g stroke="#ffffff" strokeWidth="36" strokeLinecap="round" strokeLinejoin="round" fill="none">
        {/* Top node (rounded rectangle) */}
        <rect x="186" y="110" width="140" height="80" rx="24" />
        {/* Connector lines */}
        <path d="M256 190 v50" />
        <path d="M156 240 H356" />
        <path d="M156 240 v40" />
        <path d="M356 240 v40" />
        {/* Left node (decision diamond) */}
        <path d="M156 280 L206 330 L156 380 L106 330 Z" />
        {/* Right node (start/end stadium) */}
        <rect x="296" y="290" width="120" height="80" rx="40" />
      </g>
    </svg>
  );
}
