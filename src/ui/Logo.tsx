/** Bolt path in a 100x100 box. The Home Screen icons in public/ use the same shape. */
export const BOLT = 'M60 4 L22 56 H48 L40 96 L78 42 H52 Z'

export function Logo({ size = 28 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 100 100" aria-hidden="true">
      <rect width="100" height="100" rx="24" fill="var(--brand)" />
      <path d={BOLT} fill="#fff" transform="translate(20 20) scale(0.6)" />
    </svg>
  )
}
