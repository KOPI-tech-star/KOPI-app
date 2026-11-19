import { useEffect, useState } from 'react';
import { ArrowRight } from 'lucide-react';
import {
  HERO_CTA_LABEL,
  HERO_DESCRIPTION,
  HERO_HEADLINE_WORDS,
  type NavItem,
} from '../config/firstScreen';
import { SCROLL_TRACK_SVH } from '../config/scrollTimeline';
import { useScrollStory } from '../hooks/useScrollStory';
import { HeroBackground } from './HeroBackground';
import { Header } from './Header';
import {
  RoutePlaceholderModal,
  type RoutePlaceholderState,
} from './RoutePlaceholderModal';

interface WelcomeScreenProps {
  onNavigateToRadar?: () => void;
}

export function WelcomeScreen({ onNavigateToRadar }: WelcomeScreenProps) {
  const [activeRoute, setActiveRoute] = useState<RoutePlaceholderState | null>(null);
  const [prefersReducedMotion, setPrefersReducedMotion] = useState(false);
  const { trackRef, stageRef } = useScrollStory();

  useEffect(() => {
    const mediaQuery = window.matchMedia('(prefers-reduced-motion: reduce)');
    setPrefersReducedMotion(mediaQuery.matches);

    const handleChange = (event: MediaQueryListEvent) => {
      setPrefersReducedMotion(event.matches);
    };

    mediaQuery.addEventListener('change', handleChange);
    return () => mediaQuery.removeEventListener('change', handleChange);
  }, []);

  const lineOneWords = HERO_HEADLINE_WORDS.filter((w) => w.line === 1);
  const lineTwoWords = HERO_HEADLINE_WORDS.filter((w) => w.line === 2);

  const handleSelectNavItem = (item: NavItem) => {
    if (item.id === 'home') {
      window.scrollTo({ top: 0, behavior: 'smooth' });
      return;
    }

    if (item.id === 'explore' && onNavigateToRadar) {
      onNavigateToRadar();
      return;
    }

    setActiveRoute({
      title: item.label,
      description: item.plannedRouteNote,
    });
  };

  const handleExploreClick = () => {
    if (onNavigateToRadar) {
      onNavigateToRadar();
      return;
    }

    setActiveRoute({
      title: HERO_CTA_LABEL,
      description:
        'Opportunity Radar and Problem Explorer will connect to this action once the discovery workspace screen is implemented.',
    });
  };

  return (
    <div
      id="top"
      data-testid="welcome-screen"
      className="relative w-full bg-[var(--kopi-cream)] text-[var(--kopi-brown)]"
    >
      {/* Bounded native scroll-story track (175svh on motion-enabled devices, 100svh when reduced motion) */}
      <section
        ref={trackRef}
        data-testid="welcome-scroll-track"
        aria-label="KOPI Welcome story"
        className="relative w-full min-h-[100svh]"
        style={
          prefersReducedMotion
            ? undefined
            : { height: `${SCROLL_TRACK_SVH}svh` }
        }
      >
        <div
          ref={stageRef}
          data-testid="welcome-sticky-stage"
          className="sticky top-0 flex h-[100svh] w-full flex-col overflow-hidden bg-[var(--kopi-cream)]"
        >
          <HeroBackground />

          <Header onSelectNavItem={handleSelectNavItem} />

          <main className="relative z-10 flex flex-1 flex-col">
            <section
              aria-labelledby="kopi-hero-heading"
              className="kopi-hero-layout mx-auto w-full max-w-[1380px] px-6 pb-8 sm:px-8 md:px-10 lg:px-14"
            >
              <div className="max-w-[340px] sm:max-w-[430px] md:max-w-[560px] lg:max-w-[580px] xl:max-w-[660px]">
                <h1
                  id="kopi-hero-heading"
                  className="m-0 tracking-[-0.02em] text-[#392419]"
                >
                  <span className="block text-[clamp(2.1rem,8.4vw,2.75rem)] md:text-[clamp(2.85rem,5.4vw,3.5rem)] lg:text-[clamp(2.85rem,3.6vw,3.65rem)] leading-[1.09]">
                    {lineOneWords.map((word, index) => (
                      <span
                        key={`l1-${word.text}-${index}`}
                        data-headline-word={word.text}
                        className="font-newsreader font-semibold not-italic text-[#392419]"
                      >
                        {word.text}
                        {index < lineOneWords.length - 1 ? ' ' : ''}
                      </span>
                    ))}
                  </span>

                  <span className="mt-0.5 block text-[clamp(2.1rem,8.4vw,2.75rem)] md:text-[clamp(2.85rem,5.4vw,3.5rem)] lg:text-[clamp(2.85rem,3.6vw,3.65rem)] leading-[1.09]">
                    {lineTwoWords.map((word, index) => {
                      const isCormorant = word.font === 'cormorant';
                      return (
                        <span
                          key={`l2-${word.text}-${index}`}
                          data-headline-word={word.text}
                          className={
                            isCormorant
                              ? 'font-cormorant-italic text-[1.12em] leading-[1] tracking-[-0.015em] text-[#C65A1B]'
                              : 'font-newsreader font-semibold not-italic text-[#392419]'
                          }
                        >
                          {word.text}
                          {index < lineTwoWords.length - 1 ? ' ' : ''}
                        </span>
                      );
                    })}
                  </span>
                </h1>

                <p
                  data-testid="hero-description"
                  className="font-dm-sans mt-3.5 max-w-[295px] text-[1rem] font-normal leading-[1.48] text-[#392419] sm:max-w-[340px] sm:text-[1.0625rem] md:mt-4 md:max-w-[540px] md:text-[1.125rem] lg:mt-4 lg:max-w-[560px] lg:text-[1.125rem]"
                >
                  {HERO_DESCRIPTION}
                </p>

                <div className="mt-6 md:mt-7">
                  <button
                    type="button"
                    onClick={handleExploreClick}
                    className="font-dm-sans group inline-flex cursor-pointer items-center gap-2.5 rounded-full bg-[var(--kopi-brown)] px-6 py-3 text-[0.9375rem] font-semibold leading-none text-white transition-all duration-200 hover:bg-[var(--kopi-dark)] active:scale-[0.99] focus-visible:outline-2 focus-visible:outline-offset-3 focus-visible:outline-[var(--kopi-brown)] md:px-7 md:py-3.5 md:text-[1rem]"
                  >
                    <span className="whitespace-nowrap">{HERO_CTA_LABEL}</span>
                    <ArrowRight
                      size={17}
                      strokeWidth={2.2}
                      aria-hidden="true"
                      className="shrink-0 transition-transform duration-200 group-hover:translate-x-0.5"
                    />
                  </button>
                </div>
              </div>
            </section>
          </main>
        </div>
      </section>

      <RoutePlaceholderModal
        activeRoute={activeRoute}
        onClose={() => setActiveRoute(null)}
      />
    </div>
  );
}
