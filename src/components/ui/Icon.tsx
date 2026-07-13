import { ICON_PATHS, type IconName } from './icons/paths'

export type { IconName }

interface Props {
  name: IconName
  /** Rendered size in px, on a 24-unit grid. Default 20. */
  size?: number
  /** Stroke width in the 24-unit coordinate space. Default 1.7. */
  strokeWidth?: number
  /** Accessible label. When omitted the icon is decorative (aria-hidden). */
  'aria-label'?: string
  style?: React.CSSProperties
  className?: string
}

// Single stroke-based SVG icon. Colour follows `currentColor`, so callers set
// colour via the surrounding element (e.g. a tab's active colour) — no per-icon
// palette. Path data lives in ./icons/paths.tsx.
export function Icon({
  name,
  size = 20,
  strokeWidth = 1.7,
  'aria-label': ariaLabel,
  style,
  className,
}: Props) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={strokeWidth}
      strokeLinecap="round"
      strokeLinejoin="round"
      role={ariaLabel ? 'img' : undefined}
      aria-label={ariaLabel}
      aria-hidden={ariaLabel ? undefined : true}
      style={{ display: 'block', flexShrink: 0, ...style }}
      className={className}
    >
      {ICON_PATHS[name]}
    </svg>
  )
}
