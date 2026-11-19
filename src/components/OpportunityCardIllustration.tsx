import type { OpportunityIllustrationKey } from '../config/opportunityRadar';

interface OpportunityCardIllustrationProps {
  variant: OpportunityIllustrationKey;
}

/**
 * Compact editorial SVG illustrations in KOPI's warm parchment, espresso,
 * muted sage, and burnt-orange palette for illustrative opportunity cards.
 */
export function OpportunityCardIllustration({
  variant,
}: OpportunityCardIllustrationProps) {
  if (variant === 'monsoon') {
    return (
      <svg
        viewBox="0 0 240 112"
        preserveAspectRatio="xMidYMid slice"
        className="h-full w-full"
        fill="none"
        aria-hidden="true"
      >
        <rect width="240" height="112" rx="12" fill="#F6E2CE" />
        {/* Soft rain clouds & horizon */}
        <path
          d="M0 86C42 78 82 88 124 84C168 80 204 82 240 86V112H0V86Z"
          fill="#E5CBB1"
        />
        {/* Rain streaks */}
        <g stroke="#705848" strokeOpacity="0.35" strokeWidth="1.5" strokeLinecap="round">
          <line x1="48" y1="18" x2="43" y2="32" />
          <line x1="74" y1="12" x2="69" y2="26" />
          <line x1="170" y1="16" x2="165" y2="30" />
          <line x1="196" y1="22" x2="191" y2="36" />
        </g>
        {/* Threshold doormat & puddle */}
        <ellipse cx="144" cy="91" rx="38" ry="8" fill="#C9A889" fillOpacity="0.55" />
        <rect
          x="56"
          y="78"
          width="58"
          height="14"
          rx="3"
          fill="#705848"
          fillOpacity="0.22"
          stroke="#402818"
          strokeOpacity="0.35"
          strokeWidth="1.2"
        />
        {/* Umbrella */}
        <path
          d="M84 54C84 36 102 25 120 25C138 25 156 36 156 54H84Z"
          fill="#C65A1B"
        />
        <path
          d="M102 54C102 39 110 27 120 25C130 27 138 39 138 54H102Z"
          fill="#D97236"
        />
        <path
          d="M120 21V83C120 87 124 90 128 90C131.5 90 134 87.5 134 84"
          stroke="#402818"
          strokeWidth="2.4"
          strokeLinecap="round"
        />
        {/* Water drops */}
        <circle cx="164" cy="74" r="3" fill="#402818" fillOpacity="0.28" />
        <circle cx="174" cy="80" r="2" fill="#402818" fillOpacity="0.25" />
      </svg>
    );
  }

  if (variant === 'nutrition') {
    return (
      <svg
        viewBox="0 0 240 112"
        preserveAspectRatio="xMidYMid slice"
        className="h-full w-full"
        fill="none"
        aria-hidden="true"
      >
        <rect width="240" height="112" rx="12" fill="#F6E2CE" />
        {/* Desk surface */}
        <path
          d="M0 84H240V112H0V84Z"
          fill="#E5CBB1"
        />
        {/* Open notebook */}
        <rect
          x="40"
          y="58"
          width="68"
          height="32"
          rx="4"
          fill="#FFF2E5"
          stroke="#402818"
          strokeOpacity="0.35"
          strokeWidth="1.4"
        />
        <line
          x1="74"
          y1="58"
          x2="74"
          y2="90"
          stroke="#402818"
          strokeOpacity="0.25"
          strokeWidth="1.2"
        />
        <line x1="48" y1="68" x2="66" y2="68" stroke="#705848" strokeOpacity="0.45" strokeWidth="1.5" strokeLinecap="round" />
        <line x1="48" y1="75" x2="64" y2="75" stroke="#705848" strokeOpacity="0.35" strokeWidth="1.5" strokeLinecap="round" />
        <line x1="82" y1="68" x2="100" y2="68" stroke="#705848" strokeOpacity="0.45" strokeWidth="1.5" strokeLinecap="round" />
        {/* Warm meal bowl */}
        <path
          d="M126 64H188C188 80 174 90 157 90C140 90 126 80 126 64Z"
          fill="#402818"
        />
        <ellipse cx="157" cy="64" rx="31" ry="6" fill="#C65A1B" />
        {/* Greens & garnish */}
        <circle cx="147" cy="62" r="6" fill="#788269" />
        <circle cx="164" cy="61" r="5" fill="#8C967B" />
        <circle cx="157" cy="59" r="4" fill="#F5DCC7" />
        {/* Steam & clock badge */}
        <path
          d="M148 48C146 44 150 40 148 36"
          stroke="#705848"
          strokeOpacity="0.55"
          strokeWidth="1.6"
          strokeLinecap="round"
        />
        <path
          d="M162 46C160 42 164 38 162 34"
          stroke="#705848"
          strokeOpacity="0.55"
          strokeWidth="1.6"
          strokeLinecap="round"
        />
        <circle
          cx="198"
          cy="32"
          r="13"
          fill="#FFF2E5"
          stroke="#402818"
          strokeOpacity="0.35"
          strokeWidth="1.4"
        />
        <path
          d="M198 25V32L203 35"
          stroke="#C65A1B"
          strokeWidth="1.8"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </svg>
    );
  }

  return (
    <svg
      viewBox="0 0 240 112"
      preserveAspectRatio="xMidYMid slice"
      className="h-full w-full"
      fill="none"
      aria-hidden="true"
    >
      <rect width="240" height="112" rx="12" fill="#F6E2CE" />
      <path d="M0 86H240V112H0V86Z" fill="#E5CBB1" />
      {/* Oversized outer carton */}
      <rect
        x="68"
        y="30"
        width="104"
        height="60"
        rx="6"
        fill="#D8B38E"
        stroke="#402818"
        strokeOpacity="0.4"
        strokeWidth="1.5"
      />
      <path
        d="M68 44H172"
        stroke="#402818"
        strokeOpacity="0.25"
        strokeWidth="1.4"
      />
      {/* Tape strip */}
      <rect x="111" y="30" width="18" height="22" fill="#FFF2E5" fillOpacity="0.7" />
      {/* Tiny inner item showing wasted space */}
      <rect
        x="105"
        y="60"
        width="30"
        height="22"
        rx="4"
        fill="#788269"
        stroke="#402818"
        strokeOpacity="0.35"
        strokeWidth="1.2"
      />
      {/* Dashed void-space indicators */}
      <rect
        x="77"
        y="52"
        width="86"
        height="32"
        rx="4"
        stroke="#402818"
        strokeOpacity="0.3"
        strokeWidth="1.2"
        strokeDasharray="4 4"
      />
      {/* Leaf sustainability mark */}
      <path
        d="M188 46C188 34 198 26 208 26C208 38 200 46 188 46Z"
        fill="#788269"
      />
      <path
        d="M188 46L199 35"
        stroke="#FFF2E5"
        strokeWidth="1.4"
        strokeLinecap="round"
      />
    </svg>
  );
}
