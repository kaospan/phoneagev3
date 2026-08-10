// Shared between the real game board (GameTop2D) and the tutorial mini-grid (TutorialOverlay) so
// the "ladder"/cave goal looks identical in both places — previously the tutorial used a crude
// placeholder (a plain green blob) that didn't resemble the real tile at all.
export const CaveTile = ({ uid, isStart = false, rotate }: { uid: string; isStart?: boolean; rotate?: boolean }) => (
  <svg viewBox="0 0 100 100" width="100%" height="100%" style={{ display: "block", transform: rotate ? "rotate(90deg)" : undefined }}>
    <defs>
      {/* Rocky frame gradient */}
      <linearGradient id={`cvf${uid}`} x1="0%" y1="0%" x2="100%" y2="100%">
        <stop offset="0%" stopColor="#524030" />
        <stop offset="100%" stopColor="#302014" />
      </linearGradient>
      {/* Interior void — slightly bluer/darker for exit to contrast with green */}
      <radialGradient id={`cvd${uid}`} cx="50%" cy="55%" r="70%">
        <stop offset="0%" stopColor={isStart ? "#1E1408" : "#060A08"} />
        <stop offset="65%" stopColor={isStart ? "#0E0A06" : "#020604"} />
        <stop offset="100%" stopColor="#000000" />
      </radialGradient>
      {/* Base atmospheric glow — gold (start) / green (exit) */}
      <radialGradient id={`cvglow${uid}`} cx="50%" cy="100%" r="58%">
        <stop offset="0%" stopColor={isStart ? "rgba(220,170,60,0.25)" : "rgba(34,197,94,0.32)"} />
        <stop offset="100%" stopColor="rgba(0,0,0,0)" />
      </radialGradient>
      {/* Clip: restrict ladder to the inside of the arch */}
      <clipPath id={`archclip${uid}`}>
        <path d="M16,100 L16,48 Q16,10 50,10 Q84,10 84,48 L84,100 Z" />
      </clipPath>
      {/* Metallic green gradient for ladder rails + rungs (horizontal → tube look) */}
      <linearGradient id={`ldr${uid}`} x1="0%" y1="0%" x2="100%" y2="0%">
        <stop offset="0%"   stopColor="#14532D" />
        <stop offset="30%"  stopColor="#16A34A" />
        <stop offset="55%"  stopColor="#22C55E" />
        <stop offset="80%"  stopColor="#15803D" />
        <stop offset="100%" stopColor="#14532D" />
      </linearGradient>
      {/* Green depth glow around the ladder */}
      <radialGradient id={`cvgr${uid}`} cx="50%" cy="62%" r="36%">
        <stop offset="0%" stopColor="rgba(34,197,94,0.26)" />
        <stop offset="100%" stopColor="rgba(34,197,94,0)" />
      </radialGradient>
    </defs>

    {/* ── Rocky outer frame ── */}
    <rect width="100" height="100" fill={`url(#cvf${uid})`} />

    {/* ── Dark void inside arch ── */}
    <path d="M16,100 L16,48 Q16,10 50,10 Q84,10 84,48 L84,100 Z" fill={`url(#cvd${uid})`} />

    {/* ── Exit cave: green ladder descending into the dark ── */}
    {!isStart && (
      <g clipPath={`url(#archclip${uid})`}>
        {/* Diffuse green ambient light cast from the ladder */}
        <ellipse cx="50" cy="62" rx="20" ry="30" fill={`url(#cvgr${uid})`} />
        {/* Left rail */}
        <rect x="37" y="18" width="4.5" height="80" rx="2.25" fill={`url(#ldr${uid})`} />
        <rect x="37.5" y="18" width="1.5" height="80" rx="0.75" fill="rgba(187,247,208,0.50)" />
        {/* Right rail */}
        <rect x="58.5" y="18" width="4.5" height="80" rx="2.25" fill={`url(#ldr${uid})`} />
        <rect x="59" y="18" width="1.5" height="80" rx="0.75" fill="rgba(187,247,208,0.50)" />
        {/* Rungs */}
        {[25, 35, 45, 55, 65, 75, 85, 93].map((ry) => (
          <g key={ry}>
            <rect x="37" y={ry} width="26" height="3.5" rx="1.75" fill={`url(#ldr${uid})`} />
            <rect x="38" y={ry + 0.5} width="24" height="1.2" rx="0.6" fill="rgba(187,247,208,0.55)" />
          </g>
        ))}
        {/* Subtle green floor reflection at bottom */}
        <ellipse cx="50" cy="98" rx="16" ry="4" fill="rgba(34,197,94,0.14)" />
      </g>
    )}

    {/* ── Atmospheric bottom glow (gold/green) ── */}
    <ellipse cx="50" cy="96" rx="26" ry="11" fill={`url(#cvglow${uid})`} />

    {/* ── Arch stone rim ── */}
    <path d="M16,48 Q16,10 50,10 Q84,10 84,48"
          fill="none" stroke="rgba(160,130,90,0.72)" strokeWidth="3" />
    {/* Inner receding arch shadow */}
    <path d="M23,100 L23,50 Q23,20 50,20 Q77,20 77,50 L77,100 Z" fill="rgba(0,0,0,0.22)" />
    <path d="M23,50 Q23,20 50,20 Q77,20 77,50"
          fill="none" stroke="rgba(80,60,40,0.48)" strokeWidth="1.5" />
    {/* Keystone block */}
    <path d="M44,10 L50,4 L56,10 Z" fill="rgba(150,118,75,0.65)" />

    {/* ── Frame rock texture — left ── */}
    <path d="M4,24 Q11,18 17,24 Q19,32 12,34 Q3,33 4,24Z" fill="rgba(255,255,255,0.07)" />
    <path d="M4,56 Q11,50 17,55 Q19,63 12,65 Q3,64 4,56Z" fill="rgba(0,0,0,0.12)" />
    <path d="M4,78 Q10,73 15,77 Q16,84 10,85 Q3,85 4,78Z" fill="rgba(255,255,255,0.05)" />
    {/* ── Frame rock texture — right ── */}
    <path d="M83,36 Q90,30 97,36 Q99,44 92,46 Q83,45 83,36Z" fill="rgba(255,255,255,0.07)" />
    <path d="M84,60 Q91,54 98,60 Q100,68 93,70 Q84,69 84,60Z" fill="rgba(0,0,0,0.10)" />
    <path d="M84,80 Q90,75 96,79 Q98,86 92,88 Q84,87 84,80Z" fill="rgba(255,255,255,0.05)" />

    {/* ── Top bevel ── */}
    <polygon points="0,0 100,0 86,13 14,13" fill="rgba(255,255,255,0.08)" />
    <polygon points="0,0 14,13 14,86 0,100" fill="rgba(255,255,255,0.06)" />
    <rect width="100" height="100" fill="none" stroke="rgba(0,0,0,0.42)" strokeWidth="1.5" />
  </svg>
);
