"use client";

// Horizontal bar chart. Bars start at zero, so their lengths compare honestly.
export interface Bar {
  label: string;
  value: number;
  color: string;
  note?: string;
}

export function BarChart({ bars, unit = "km" }: { bars: Bar[]; unit?: string }) {
  const max = Math.max(...bars.map((b) => b.value), 1e-9);
  return (
    <div className="barchart" role="img" aria-label="Route distance comparison">
      {bars.map((b) => (
        <div key={b.label} className="bar-row">
          <div className="bar-text">
            <span className="bar-label">{b.label}</span>
            {b.note && <span className="bar-note">{b.note}</span>}
          </div>
          <div className="bar-track">
            <div className="bar-fill" style={{ width: `${Math.max((b.value / max) * 100, 1)}%`, background: b.color }} />
          </div>
          <span className="bar-value">
            {b.value.toFixed(2)} {unit}
          </span>
        </div>
      ))}
    </div>
  );
}
