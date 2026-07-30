// Inline-SVG icon set for the Calm Ledger primitives (PAIN-POINTS D4).
// 24-unit viewBox, 1.7px stroke, stroke = currentColor, no fill — the shapes
// are the same ones drawn in design-direction-v2.html. Each entry is the inner
// markup of an <svg>; <Icon> supplies the wrapping element and stroke defaults.
// Dot-style icons (`more`) set fill explicitly per-shape, overriding fill:none.

export type IconName =
  | 'today'
  | 'budget'
  | 'manager'
  | 'assets'
  | 'report'
  | 'more'
  | 'add'
  | 'transfer'
  | 'search'
  | 'close'
  | 'chevron-left'
  | 'chevron-right'
  | 'lens'

export const ICON_PATHS: Record<IconName, React.ReactNode> = {
  // Tab bar
  today: (
    <>
      <rect x="3" y="4" width="18" height="17" rx="3" />
      <path d="M8 2v4M16 2v4M3 9h18" />
    </>
  ),
  budget: (
    <>
      <circle cx="12" cy="12" r="9" />
      <path d="M12 7v5l3 2" />
    </>
  ),
  manager: (
    <>
      <path d="M21 12a9 9 0 1 1-9-9" />
      <path d="M12 8a4 4 0 1 0 4 4" />
      <path d="M17 3v4h4" />
    </>
  ),
  assets: (
    <>
      <rect x="3" y="6" width="18" height="13" rx="3" />
      <path d="M3 10h18M7 15h4" />
    </>
  ),
  report: <path d="M3 20h18M6 20v-8M11 20V6M16 20v-11M21 20v-5" />,
  more: (
    <>
      <circle cx="5" cy="12" r="1.4" fill="currentColor" />
      <circle cx="12" cy="12" r="1.4" fill="currentColor" />
      <circle cx="19" cy="12" r="1.4" fill="currentColor" />
    </>
  ),
  // Actions / controls
  add: <path d="M12 5v14M5 12h14" />,
  transfer: (
    <>
      <path d="M8 3 4 7l4 4" />
      <path d="M4 7h16" />
      <path d="m16 21 4-4-4-4" />
      <path d="M20 17H4" />
    </>
  ),
  search: (
    <>
      <circle cx="11" cy="11" r="7" />
      <path d="m20 20-3.2-3.2" />
    </>
  ),
  close: <path d="M6 6l12 12M18 6 6 18" />,
  'chevron-left': <path d="m15 18-6-6 6-6" />,
  'chevron-right': <path d="m9 18 6-6-6-6" />,
  // Spending Lens affordance (B3, PAIN-POINTS.md): a magnifying glass over a
  // currency mark — "what does this really cost me?".
  lens: (
    <>
      <circle cx="10" cy="10" r="7" />
      <path d="M15 15 21 21M8 10h4M10 7.5v5" />
    </>
  ),
}
