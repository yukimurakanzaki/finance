// ponytail: stub — the real i18n module was never committed (App.tsx on main
// references it, but no commit on any branch contains src/i18n). This keeps the
// app compiling until translations actually land.
export function useI18n() {
  return { init: () => {} }
}
