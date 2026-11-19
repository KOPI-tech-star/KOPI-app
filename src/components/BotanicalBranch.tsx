interface BotanicalBranchProps {
  className?: string;
  style?: React.CSSProperties;
}

/**
 * Subtle upper-right botanical branch matching the olive-espresso foliage
 * from the Opportunity Radar visual reference and foreground plant palette.
 */
export function BotanicalBranch({ className = '', style }: BotanicalBranchProps) {
  return (
    <svg
      viewBox="0 0 220 190"
      fill="none"
      aria-hidden="true"
      className={className}
      style={style}
    >
      {/* Main curved twig entering from upper-right */}
      <path
        d="M222 86C174 80 132 72 94 58C72 50 52 44 26 42"
        stroke="#51402D"
        strokeWidth="2.4"
        strokeLinecap="round"
      />
      <path
        d="M172 78C164 56 154 38 140 24"
        stroke="#51402D"
        strokeWidth="2"
        strokeLinecap="round"
      />
      <path
        d="M142 73C144 96 152 118 164 136"
        stroke="#51402D"
        strokeWidth="1.9"
        strokeLinecap="round"
      />

      {/* Leaves along upper twig */}
      <path d="M140 24C129 18 124 8 128 2C136 5 142 14 140 24Z" fill="#5A4B33" />
      <path d="M155 42C166 33 179 31 186 36C180 44 166 47 155 42Z" fill="#64553A" />
      <path d="M152 40C141 34 133 25 135 17C144 20 151 30 152 40Z" fill="#4D3E29" />
      <path d="M167 64C180 56 194 56 202 63C193 70 179 71 167 64Z" fill="#5B4D35" />

      {/* Leaves along primary branch */}
      <path d="M26 42C14 39 5 32 4 24C14 24 23 32 26 42Z" fill="#584932" />
      <path d="M47 45C36 33 34 20 40 13C49 20 52 33 47 45Z" fill="#66573C" />
      <path d="M54 46C44 58 34 65 25 65C30 55 42 48 54 46Z" fill="#4F402B" />
      <path d="M84 55C76 41 77 27 84 21C92 29 92 43 84 55Z" fill="#5A4B33" />
      <path d="M90 57C81 71 71 80 61 81C66 70 78 60 90 57Z" fill="#635339" />
      <path d="M118 66C114 52 117 38 125 32C131 41 128 55 118 66Z" fill="#4E3F2A" />

      {/* Leaves along lower secondary stem */}
      <path d="M144 96C131 94 120 100 115 107C126 109 137 104 144 96Z" fill="#5C4D34" />
      <path d="M150 112C163 107 175 108 182 114C173 120 160 120 150 112Z" fill="#66563B" />
      <path d="M164 136C166 149 174 160 182 164C181 153 174 142 164 136Z" fill="#53442E" />
      <path d="M157 125C144 127 134 134 131 143C141 142 152 135 157 125Z" fill="#5B4C34" />
    </svg>
  );
}
