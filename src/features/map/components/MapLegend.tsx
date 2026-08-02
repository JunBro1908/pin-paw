/**
 * Compact map brand chip — kept away from the bottom toolbar and detail sheet.
 * Source types are explained in the detail sheet instead of a colored legend.
 */
export function MapLegend() {
  return (
    <section
      aria-label="지도 제목"
      className="border-border-subtle bg-surface pointer-events-none absolute top-3 left-1/2 z-10 -translate-x-1/2 rounded-2xl border px-3 py-1.5 shadow-sm"
    >
      <p className="text-text-main text-sm font-semibold tracking-tight">
        PinPaw 지도
      </p>
    </section>
  );
}
