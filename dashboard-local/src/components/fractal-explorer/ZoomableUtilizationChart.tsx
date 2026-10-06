import { useCallback, useRef, useState, type WheelEvent, type MouseEvent } from "react";
import type { ContextWindowEntry } from "../log-browser/tool-timeline-types";

interface ZoomableUtilizationChartProps {
  entries: ContextWindowEntry[];
  width?: number;
  height?: number;
}

const MARGIN = { top: 20, right: 16, bottom: 28, left: 50 };

function utilizationColor(pct: number): string {
  if (pct > 80) return "#ef4444";
  if (pct > 60) return "#f59e0b";
  return "#22c55e";
}

export function ZoomableUtilizationChart({ entries, width = 700, height = 260 }: ZoomableUtilizationChartProps) {
  const svgRef = useRef<SVGSVGElement>(null);
  const innerW = width - MARGIN.left - MARGIN.right;
  const innerH = height - MARGIN.top - MARGIN.bottom;

  if (entries.length === 0) {
    return <div className="text-dim text-xs">No context window data</div>;
  }

  const minTs = entries[0].tsMs;
  const maxTs = entries[entries.length - 1].tsMs;
  const spanMs = Math.max(maxTs - minTs, 1);

  // viewBox-based zoom state: [xMin, xMax] in domain (0..1)
  const [domain, setDomain] = useState<[number, number]>([0, 1]);
  const [dragStart, setDragStart] = useState<{ x: number; domain: [number, number] } | null>(null);

  const domainSpan = domain[1] - domain[0];

  const scaleX = (tsMs: number) => {
    const normalized = (tsMs - minTs) / spanMs;
    return ((normalized - domain[0]) / domainSpan) * innerW;
  };

  const scaleY = (util: number) => innerH - (util / 100) * innerH;

  // Build area path
  const points = entries.map((e) => ({ x: scaleX(e.tsMs), y: scaleY(e.utilization), util: e.utilization }));
  const linePath = points.map((p, i) => `${i === 0 ? "M" : "L"}${p.x},${p.y}`).join(" ");
  const areaPath = `${linePath} L${points[points.length - 1].x},${innerH} L${points[0].x},${innerH} Z`;

  // Detect compaction events (>10 point drop)
  const compactions: { tsMs: number; before: number; after: number }[] = [];
  for (let i = 1; i < entries.length; i++) {
    if (entries[i - 1].utilization - entries[i].utilization > 10) {
      compactions.push({ tsMs: entries[i].tsMs, before: entries[i - 1].utilization, after: entries[i].utilization });
    }
  }

  // Gradient for utilization zones
  const gradientId = "util-gradient";

  const handleWheel = useCallback(
    (e: WheelEvent<SVGSVGElement>) => {
      e.preventDefault();
      const rect = svgRef.current!.getBoundingClientRect();
      const mouseX = e.clientX - rect.left - MARGIN.left;
      const mouseRatio = domain[0] + (mouseX / innerW) * domainSpan;
      const factor = e.deltaY > 0 ? 1.15 : 0.87;
      const newSpan = Math.min(1, Math.max(0.01, domainSpan * factor));
      let newMin = mouseRatio - (mouseRatio - domain[0]) * (newSpan / domainSpan);
      let newMax = newMin + newSpan;
      if (newMin < 0) {
        newMax -= newMin;
        newMin = 0;
      }
      if (newMax > 1) {
        newMin -= newMax - 1;
        newMax = 1;
      }
      setDomain([Math.max(0, newMin), Math.min(1, newMax)]);
    },
    [domain, domainSpan, innerW],
  );

  const handleMouseDown = useCallback(
    (e: MouseEvent<SVGSVGElement>) => {
      setDragStart({ x: e.clientX, domain: [...domain] });
    },
    [domain],
  );

  const handleMouseMove = useCallback(
    (e: MouseEvent<SVGSVGElement>) => {
      if (!dragStart) return;
      const dx = e.clientX - dragStart.x;
      const shift = -(dx / innerW) * domainSpan;
      let newMin = dragStart.domain[0] + shift;
      let newMax = dragStart.domain[1] + shift;
      if (newMin < 0) {
        newMax -= newMin;
        newMin = 0;
      }
      if (newMax > 1) {
        newMin -= newMax - 1;
        newMax = 1;
      }
      setDomain([Math.max(0, newMin), Math.min(1, newMax)]);
    },
    [dragStart, innerW, domainSpan],
  );

  const handleMouseUp = useCallback(() => setDragStart(null), []);

  // X axis ticks
  const domainMinTs = minTs + domain[0] * spanMs;
  const domainMaxTs = minTs + domain[1] * spanMs;
  const tickCount = 5;
  const xTicks = Array.from({ length: tickCount }, (_, i) => {
    const tsMs = domainMinTs + (i / (tickCount - 1)) * (domainMaxTs - domainMinTs);
    return { tsMs, x: scaleX(tsMs), label: formatTime(tsMs) };
  });

  // Tooltip
  const [tooltip, setTooltip] = useState<{ x: number; y: number; entry: ContextWindowEntry } | null>(null);

  const handleHover = useCallback(
    (e: MouseEvent<SVGSVGElement>) => {
      const rect = svgRef.current!.getBoundingClientRect();
      const mouseX = e.clientX - rect.left - MARGIN.left;
      const ratio = domain[0] + (mouseX / innerW) * domainSpan;
      const targetTs = minTs + ratio * spanMs;
      let closest = entries[0];
      let closestDist = Math.abs(entries[0].tsMs - targetTs);
      for (const entry of entries) {
        const dist = Math.abs(entry.tsMs - targetTs);
        if (dist < closestDist) {
          closest = entry;
          closestDist = dist;
        }
      }
      setTooltip({ x: scaleX(closest.tsMs), y: scaleY(closest.utilization), entry: closest });
    },
    [entries, domain, domainSpan, innerW, minTs, spanMs],
  );

  return (
    <svg
      ref={svgRef}
      width={width}
      height={height}
      className="select-none"
      onWheel={handleWheel}
      onMouseDown={handleMouseDown}
      onMouseMove={(e) => {
        handleMouseMove(e);
        handleHover(e);
      }}
      onMouseUp={handleMouseUp}
      onMouseLeave={() => {
        setDragStart(null);
        setTooltip(null);
      }}
    >
      <defs>
        <linearGradient id={gradientId} x1="0" x2="0" y1="0" y2="1">
          <stop offset="0%" stopColor="#ef4444" stopOpacity="0.3" />
          <stop offset="40%" stopColor="#f59e0b" stopOpacity="0.2" />
          <stop offset="100%" stopColor="#22c55e" stopOpacity="0.1" />
        </linearGradient>
        <clipPath id="chart-clip">
          <rect x="0" y="0" width={innerW} height={innerH} />
        </clipPath>
      </defs>

      <g transform={`translate(${MARGIN.left},${MARGIN.top})`}>
        {/* Y axis grid + labels */}
        {[0, 25, 50, 75, 100].map((v) => (
          <g key={v}>
            <line x1={0} x2={innerW} y1={scaleY(v)} y2={scaleY(v)} stroke="currentColor" strokeOpacity="0.1" />
            <text x={-8} y={scaleY(v) + 3} textAnchor="end" fontSize="10" fill="currentColor" opacity="0.5">
              {v}%
            </text>
          </g>
        ))}

        <g clipPath="url(#chart-clip)">
          {/* Area fill */}
          <path d={areaPath} fill={`url(#${gradientId})`} />
          {/* Line */}
          <path d={linePath} fill="none" stroke="#60a5fa" strokeWidth="1.5" />

          {/* Compaction event lines */}
          {compactions.map((c, i) => (
            <line
              key={i}
              x1={scaleX(c.tsMs)}
              x2={scaleX(c.tsMs)}
              y1={0}
              y2={innerH}
              stroke="#f59e0b"
              strokeWidth="1"
              strokeDasharray="4 3"
              opacity="0.7"
            />
          ))}

          {/* Data points */}
          {points.map((p, i) => (
            <circle key={i} cx={p.x} cy={p.y} r="2" fill={utilizationColor(p.util)} />
          ))}

          {/* Tooltip crosshair */}
          {tooltip && (
            <>
              <line
                x1={tooltip.x}
                x2={tooltip.x}
                y1={0}
                y2={innerH}
                stroke="#60a5fa"
                strokeWidth="0.5"
                strokeDasharray="2 2"
              />
              <circle cx={tooltip.x} cy={tooltip.y} r="4" fill="#60a5fa" stroke="white" strokeWidth="1" />
            </>
          )}
        </g>

        {/* X axis ticks */}
        {xTicks.map((t, i) => (
          <text key={i} x={t.x} y={innerH + 16} textAnchor="middle" fontSize="9" fill="currentColor" opacity="0.5">
            {t.label}
          </text>
        ))}
      </g>

      {/* Tooltip box */}
      {tooltip && (
        <g transform={`translate(${MARGIN.left + tooltip.x + 10},${MARGIN.top + tooltip.y - 10})`}>
          <rect x="0" y="-24" width="140" height="36" rx="4" fill="#1e293b" stroke="#334155" />
          <text x="6" y="-10" fontSize="10" fill="#94a3b8">
            {formatTime(tooltip.entry.tsMs)}
          </text>
          <text x="6" y="4" fontSize="10" fill="#f1f5f9">
            {tooltip.entry.utilization.toFixed(1)}% — {tooltip.entry.usedTokens.toLocaleString()}/
            {tooltip.entry.maxTokens.toLocaleString()}
          </text>
        </g>
      )}
    </svg>
  );
}

function formatTime(tsMs: number): string {
  const d = new Date(tsMs);
  return `${d.getUTCHours().toString().padStart(2, "0")}:${d.getUTCMinutes().toString().padStart(2, "0")}:${d.getUTCSeconds().toString().padStart(2, "0")}`;
}
