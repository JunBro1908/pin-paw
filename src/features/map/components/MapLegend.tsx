const LEGEND_ITEMS = [
  { label: "목격", color: "#087A3E", shape: "pin" },
  { label: "유실", color: "#B85C1B", shape: "rounded-square" },
  { label: "보호소", color: "#28736F", shape: "rounded-square" },
] as const;

export function MapLegend() {
  return (
    <section
      aria-label="지도 표시 종류"
      className="border-border-subtle bg-surface absolute top-4 left-4 z-10 rounded-2xl border px-3 py-2 shadow-sm"
    >
      <ul className="text-text-sub flex flex-wrap gap-x-3 gap-y-2 text-xs font-medium">
        {LEGEND_ITEMS.map(({ label, color, shape }) => (
          <li key={label} className="flex items-center gap-1.5">
            <span
              aria-hidden="true"
              data-marker-shape={shape}
              className={
                shape === "pin"
                  ? "h-3.5 w-3.5 rotate-45 rounded-full rounded-bl-none"
                  : "h-3.5 w-3.5 rounded-sm"
              }
              style={{ backgroundColor: color }}
            />
            <span>{label}</span>
          </li>
        ))}
      </ul>
    </section>
  );
}
