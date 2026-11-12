/** App mark: bold R over a dumbbell charged to 75%. The Home Screen icons in public/ use the same drawing.
 *  Colours come from CSS tokens, so it follows the light/dark theme. */
const R =
  'M352 180 H552 A120 120 0 0 1 552 420 L680 600 H570 L462 436 H448 V600 H352 Z M448 268 H544 A36 36 0 0 1 544 340 H448 Z'

export function Logo({ size = 28 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 1024 1024" aria-hidden="true">
      <defs>
        <linearGradient id="rf-bg" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" style={{ stopColor: 'var(--logo-bg1)' }} />
          <stop offset="1" style={{ stopColor: 'var(--logo-bg2)' }} />
        </linearGradient>
        <linearGradient id="rf-ch" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" style={{ stopColor: 'var(--logo-ch1)' }} />
          <stop offset="1" style={{ stopColor: 'var(--logo-ch2)' }} />
        </linearGradient>
      </defs>
      <rect x="6" y="6" width="1012" height="1012" rx="226" fill="url(#rf-bg)" style={{ stroke: 'var(--logo-edge)' }} strokeWidth="12" />
      <path d={R} style={{ fill: 'var(--logo-r)' }} fillRule="evenodd" transform="translate(512 380) scale(1.02) translate(-516 -390)" />
      <g style={{ fill: 'var(--logo-plate)' }}>
        <rect x="692" y="746" width="40" height="48" rx="8" />
        <rect x="732" y="670" width="56" height="200" rx="16" />
        <rect x="796" y="704" width="36" height="132" rx="14" />
        <rect x="292" y="746" width="40" height="48" rx="8" />
        <rect x="236" y="670" width="56" height="200" rx="16" />
        <rect x="192" y="704" width="36" height="132" rx="14" />
      </g>
      <rect x="332" y="714" width="360" height="112" rx="56" style={{ fill: 'var(--logo-cell)', stroke: 'var(--logo-plate)' }} strokeWidth="12" />
      <rect x="348" y="730" width="246" height="80" rx="40" fill="url(#rf-ch)" />
    </svg>
  )
}
