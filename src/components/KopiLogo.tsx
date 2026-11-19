import { useState } from 'react';
import { MEDIA_ASSETS } from '../config/firstScreen';

interface KopiLogoProps {
  className?: string;
}

/**
 * Displays the official transparent KOPI logo PNG (extracted from the uploaded
 * brand asset) at its natural aspect ratio (399x105).
 */
export function KopiLogo({ className = '' }: KopiLogoProps) {
  const [loadError, setLoadError] = useState(false);

  if (loadError) {
    return (
      <span className={`font-dm-sans text-lg font-bold tracking-wider text-[var(--kopi-brown)] ${className}`}>
        KOPI™
      </span>
    );
  }

  return (
    <img
      data-testid="kopi-official-logo"
      src={MEDIA_ASSETS.officialLogo}
      alt="KOPI"
      width={399}
      height={105}
      onError={() => setLoadError(true)}
      className={`block h-[26px] sm:h-[28px] md:h-[30px] lg:h-[32px] w-auto select-none ${className}`}
      decoding="async"
    />
  );
}
