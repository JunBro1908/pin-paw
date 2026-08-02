import { MAP_PIN_STATUS_COLORS } from "../lib/map-marker-presentation";

const STATUS_LEGEND = [
  { label: "안 본 제보", color: MAP_PIN_STATUS_COLORS.unseen },
  { label: "본 제보", color: MAP_PIN_STATUS_COLORS.seen },
  { label: "즐겨찾기", color: MAP_PIN_STATUS_COLORS.claimed },
] as const;

/**
 * Top-left map chrome: brand title + short guide + pin status colors.
 * Kept clear of bottom-right filters and the detail sheet.
 */
export function MapLegend() {
  return (
    <section
      aria-label="지도 제목"
      className="border-border-subtle bg-surface pointer-events-none absolute top-3 left-3 z-10 max-w-[min(calc(100%-5.5rem),17rem)] rounded-2xl border px-3 py-2.5 shadow-sm"
    >
      <p className="text-text-main text-sm font-semibold tracking-tight">
        PinPaw 지도
      </p>
      <p className="text-text-caption mt-0.5 text-xs leading-snug">
        반려동물의 흔적을 찾아보세요.
      </p>
      <ul className="text-text-sub mt-2 flex flex-col gap-1.5 text-xs font-medium">
        {STATUS_LEGEND.map(({ label, color }) => (
          <li key={label} className="flex items-center gap-1.5">
            <span
              aria-hidden="true"
              className="h-3 w-3 rotate-45 rounded-full rounded-bl-none"
              style={{ backgroundColor: color }}
            />
            <span>{label}</span>
          </li>
        ))}
      </ul>
    </section>
  );
}
