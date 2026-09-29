import React from "react";

const N = {
  generate: { x: 70, y: 110, label: "GENERATE", color: "#38bdf8" },
  sandbox: { x: 280, y: 110, label: "SANDBOX", color: "#eab308" },
  reject: { x: 280, y: 260, label: "REJECT", color: "#ef4444" },
  diagnose: { x: 480, y: 260, label: "DIAGNOSE", color: "#c084fc" },
  patch: { x: 680, y: 260, label: "PATCH", color: "#3b82f6" },
  backtest: { x: 680, y: 110, label: "BACKTEST", color: "#eab308" },
  validated: { x: 930, y: 110, label: "VALIDATED", color: "#10b981" },
  dead: { x: 930, y: 260, label: "DEAD", color: "#6b7280" },
};

const WIRES = [
  "M100 110 H250",
  "M280 140 V230",
  "M310 260 H450",
  "M510 260 H650",
  "M680 230 C 680 190 520 150 310 118",
  "M310 104 H650",
  "M710 110 H900",
  "M710 260 H900",
];

// journeys
const PASS = "M100 110 H280 H680 H930";
const REPAIR_PASS = "M100 110 H280 V260 H480 H680 C 680 190 520 150 300 114 H680 H930";
const DIE = "M100 110 H280 V260 H480 H680 H930";

export function LivingPipeline({ counts }) {
  return (
    <svg viewBox="0 0 1000 330" style={{ width: "100%", height: "auto", display: "block" }} data-testid="living-pipeline" role="img"
      aria-label="Strategy pipeline: generate, sandbox, reject, diagnose, patch, backtest, validated or dead">
      <defs>
        <filter id="lp-glow" x="-100%" y="-100%" width="300%" height="300%">
          <feGaussianBlur stdDeviation="3.2" result="b" />
          <feMerge><feMergeNode in="b" /><feMergeNode in="SourceGraphic" /></feMerge>
        </filter>
      </defs>

      {WIRES.map((d, i) => (
        <path key={i} d={d} fill="none" stroke="#1e293b" strokeWidth="1.6" strokeDasharray="4 6" />
      ))}
      <text x="480" y="168" textAnchor="middle" fontFamily="var(--mono)" fontSize="10" fill="#475569">patched code re-enters the sandbox</text>

      {Object.entries(N).map(([id, n]) => (
        <g key={id} data-testid={`pipeline-node-${id}`}>
          <circle cx={n.x} cy={n.y} r="30" fill="#0b0f17" stroke={n.color} strokeWidth="1.5" />
          <circle cx={n.x} cy={n.y} r="30" fill="none" stroke={n.color} strokeWidth="8" opacity="0.1" />
          <text x={n.x} y={n.y - 40} textAnchor="middle" fontFamily="var(--mono)" fontSize="11" fontWeight="600" letterSpacing="1.2" fill={n.color}>{n.label}</text>
          {counts?.[id] != null && (
            <text x={n.x} y={n.y + 5} textAnchor="middle" fontFamily="var(--mono)" fontSize="15" fontWeight="700" fill="#f8fafc">{counts[id]}</text>
          )}
        </g>
      ))}

      {/* most packets die in the loop */}
      {[0, 1.7, 3.4, 5.1].map((b, i) => (
        <circle key={`d${i}`} r="4.2" filter="url(#lp-glow)" fill="#ef4444">
          <animateMotion dur="6.5s" begin={`${b}s`} repeatCount="indefinite" path={DIE} keyPoints="0;0.22;1" keyTimes="0;0.25;1" calcMode="linear" />
          <animate attributeName="fill" values="#38bdf8;#ef4444;#c084fc;#3b82f6;#6b7280" keyTimes="0;0.22;0.5;0.72;1" dur="6.5s" begin={`${b}s`} repeatCount="indefinite" />
          <animate attributeName="opacity" values="0;1;1;0.2" keyTimes="0;0.04;0.9;1" dur="6.5s" begin={`${b}s`} repeatCount="indefinite" />
        </circle>
      ))}
      {/* some get repaired and pass */}
      {[0.9, 5.8].map((b, i) => (
        <circle key={`r${i}`} r="4.8" filter="url(#lp-glow)" fill="#10b981">
          <animateMotion dur="9s" begin={`${b}s`} repeatCount="indefinite" path={REPAIR_PASS} />
          <animate attributeName="fill" values="#38bdf8;#ef4444;#c084fc;#3b82f6;#eab308;#10b981" keyTimes="0;0.15;0.3;0.45;0.7;1" dur="9s" begin={`${b}s`} repeatCount="indefinite" />
          <animate attributeName="opacity" values="0;1;1;0" keyTimes="0;0.03;0.93;1" dur="9s" begin={`${b}s`} repeatCount="indefinite" />
        </circle>
      ))}
      {/* rare clean first-time pass */}
      <circle r="4.5" filter="url(#lp-glow)" fill="#10b981">
        <animateMotion dur="4.5s" begin="3s" repeatCount="indefinite" path={PASS} />
        <animate attributeName="opacity" values="0;1;1;0" keyTimes="0;0.05;0.9;1" dur="4.5s" begin="3s" repeatCount="indefinite" />
      </circle>
    </svg>
  );
}
