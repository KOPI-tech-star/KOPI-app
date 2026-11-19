import type { CSSProperties } from 'react';

interface CoffeeSteamSvgProps {
  className?: string;
  style?: CSSProperties;
}

export function CoffeeSteamSvg({ className, style }: CoffeeSteamSvgProps) {
  return (
    <svg
      viewBox="0 0 64 96"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      aria-hidden="true"
      data-testid="coffee-steam-svg"
      className={className}
      style={{
        ...style,
        opacity: 'var(--kopi-steam-opacity, 0)',
        willChange: 'opacity',
      }}
    >
      <path
        d="M28 88 C23 74, 34 62, 27 48 C21 36, 33 24, 27 10"
        pathLength={100}
        stroke="#FFFDF9"
        strokeWidth="5"
        strokeLinecap="round"
        strokeDasharray="100"
        strokeDashoffset="calc(100 * (1 - var(--kopi-steam-draw, 0)))"
        opacity="0.92"
      />
      <path
        d="M40 90 C44 76, 35 65, 42 52 C48 40, 38 28, 43 16"
        pathLength={100}
        stroke="#F6D5B0"
        strokeWidth="3.8"
        strokeLinecap="round"
        strokeDasharray="100"
        strokeDashoffset="calc(100 * (1 - var(--kopi-steam-draw, 0)))"
        opacity="0.82"
      />
      <path
        d="M19 86 C15 74, 24 64, 18 53 C14 44, 21 34, 17 24"
        pathLength={100}
        stroke="#E8BE92"
        strokeWidth="3"
        strokeLinecap="round"
        strokeDasharray="100"
        strokeDashoffset="calc(100 * (1 - var(--kopi-steam-draw, 0)))"
        opacity="0.72"
      />
    </svg>
  );
}
