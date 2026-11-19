import { useEffect, useRef } from 'react';
import {
  ArrowRight,
  Bookmark,
  BookOpen,
  Compass,
  GitCompare,
  HelpCircle,
  Home,
  Radar,
  X,
} from 'lucide-react';
import {
  RADAR_DASHBOARD_COPY,
  SIDEBAR_NAV_ITEMS,
  type SidebarNavId,
  type SidebarNavItem,
} from '../config/opportunityRadar';
import { KopiLogo } from './KopiLogo';

interface RadarSidebarProps {
  activeNavId: SidebarNavId;
  savedCount: number;
  mobileOpen: boolean;
  onCloseMobile: () => void;
  onSelectNavItem: (item: SidebarNavItem) => void;
  onSubmitProblem: () => void;
}

function getNavIcon(id: SidebarNavId, isActive: boolean) {
  const colorClass = isActive ? 'text-[#C65A1B]' : 'text-[#705848]';
  const props = { size: 17, strokeWidth: 1.9, className: `shrink-0 ${colorClass}` };

  switch (id) {
    case 'home':
      return <Home {...props} aria-hidden="true" />;
    case 'opportunity-radar':
      return <Radar {...props} aria-hidden="true" />;
    case 'problem-explorer':
      return <Compass {...props} aria-hidden="true" />;
    case 'compare':
      return <GitCompare {...props} aria-hidden="true" />;
    case 'saved':
      return <Bookmark {...props} aria-hidden="true" />;
    case 'methodology':
      return <BookOpen {...props} aria-hidden="true" />;
    case 'how-it-works':
      return <HelpCircle {...props} aria-hidden="true" />;
  }
}

export function RadarSidebar({
  activeNavId,
  savedCount,
  mobileOpen,
  onCloseMobile,
  onSelectNavItem,
  onSubmitProblem,
}: RadarSidebarProps) {
  const closeButtonRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (!mobileOpen) return;

    closeButtonRef.current?.focus();

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        onCloseMobile();
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [mobileOpen, onCloseMobile]);

  const primaryItems = SIDEBAR_NAV_ITEMS.filter((i) => i.section === 'primary');
  const secondaryItems = SIDEBAR_NAV_ITEMS.filter(
    (i) => i.section === 'secondary'
  );

  const handleNavClick = (item: SidebarNavItem) => {
    onCloseMobile();
    onSelectNavItem(item);
  };

  const renderSidebarBody = (showMobileClose: boolean) => (
    <div className="flex h-full flex-col justify-between px-4 py-5">
      <div>
        <div className="flex items-center justify-between px-2 pb-5">
          <button
            type="button"
            onClick={() => handleNavClick(primaryItems[0])}
            aria-label="KOPI — Return to Home"
            className="inline-flex cursor-pointer items-center rounded-md py-1 transition-opacity duration-150 hover:opacity-80 focus-visible:outline-2 focus-visible:outline-offset-3 focus-visible:outline-[#402818]"
          >
            <KopiLogo className="!h-[26px]" />
          </button>

          {showMobileClose && (
            <button
              ref={closeButtonRef}
              type="button"
              onClick={onCloseMobile}
              aria-label="Close navigation menu"
              className="inline-flex h-10 w-10 cursor-pointer items-center justify-center rounded-full text-[#402818] transition-colors duration-150 hover:bg-[#402818]/8 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#402818]"
            >
              <X size={20} strokeWidth={1.9} />
            </button>
          )}
        </div>

        <nav aria-label="Primary workspace navigation" className="space-y-1">
          {primaryItems.map((item) => {
            const isActive = item.id === activeNavId;
            return (
              <button
                key={item.id}
                type="button"
                aria-current={isActive ? 'page' : undefined}
                onClick={() => handleNavClick(item)}
                className={`font-dm-sans flex w-full cursor-pointer items-center justify-between rounded-xl px-3 py-2.5 text-left text-[0.9rem] transition-colors duration-150 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#402818] ${
                  isActive
                    ? 'border border-[#402818]/14 bg-[#FFF2E5] font-semibold text-[#402818] shadow-2xs'
                    : 'border border-transparent font-medium text-[#402818]/80 hover:bg-[#402818]/6 hover:text-[#402818]'
                }`}
              >
                <span className="flex items-center gap-2.5">
                  {getNavIcon(item.id, isActive)}
                  <span>{item.label}</span>
                </span>
                {item.id === 'saved' && savedCount > 0 && (
                  <span
                    data-testid="sidebar-saved-count"
                    className="font-dm-sans text-xs font-semibold tabular-nums text-[#C65A1B]"
                  >
                    {savedCount}
                  </span>
                )}
              </button>
            );
          })}
        </nav>

        <div className="my-4 border-t border-[#402818]/10" />

        <nav aria-label="Secondary guide navigation" className="space-y-1">
          {secondaryItems.map((item) => {
            const isActive = item.id === activeNavId;
            return (
              <button
                key={item.id}
                type="button"
                onClick={() => handleNavClick(item)}
                className="font-dm-sans flex w-full cursor-pointer items-center gap-2.5 rounded-xl border border-transparent px-3 py-2 text-left text-[0.875rem] font-medium text-[#705848] transition-colors duration-150 hover:bg-[#402818]/6 hover:text-[#402818] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#402818]"
              >
                {getNavIcon(item.id, isActive)}
                <span>{item.label}</span>
              </button>
            );
          })}
        </nav>
      </div>

      {/* Bottom Promotional Card */}
      <aside
        aria-label="Submit a problem"
        className="mt-6 rounded-2xl border border-[#402818]/12 bg-[#FFF2E5] p-4"
      >
        <p className="font-newsreader text-[1.0625rem] font-semibold leading-snug text-[#402818]">
          {RADAR_DASHBOARD_COPY.promoTitle}
        </p>
        <p className="font-dm-sans mt-1.5 text-[0.8125rem] leading-relaxed text-[#705848]">
          {RADAR_DASHBOARD_COPY.promoBody}
        </p>
        <button
          type="button"
          onClick={() => {
            onCloseMobile();
            onSubmitProblem();
          }}
          className="font-dm-sans group mt-3.5 inline-flex w-full cursor-pointer items-center justify-center gap-2 rounded-full bg-[#402818] px-4 py-2.5 text-[0.8125rem] font-semibold text-white transition-colors duration-150 hover:bg-[#2F1B13] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#402818]"
        >
          <span>{RADAR_DASHBOARD_COPY.promoCta}</span>
          <ArrowRight
            size={14}
            strokeWidth={2.2}
            aria-hidden="true"
            className="shrink-0 transition-transform duration-150 group-hover:translate-x-0.5"
          />
        </button>
      </aside>
    </div>
  );

  return (
    <>
      {/* Persistent Desktop Sidebar (>= 1024px) */}
      <aside
        data-testid="radar-desktop-sidebar"
        aria-label="Opportunity Radar sidebar"
        className="hidden w-[236px] shrink-0 border-r border-[#402818]/10 bg-[#F6E2CE]/75 lg:sticky lg:top-0 lg:block lg:h-[100dvh] lg:overflow-y-auto"
      >
        {renderSidebarBody(false)}
      </aside>

      {/* Mobile & Tablet Slide-over Drawer (< 1024px) */}
      {mobileOpen && (
        <div
          data-testid="radar-mobile-drawer"
          className="fixed inset-0 z-50 flex lg:hidden"
          role="dialog"
          aria-modal="true"
          aria-label="Workspace navigation"
        >
          <div
            className="fixed inset-0 bg-[#2F1B13]/35"
            onClick={onCloseMobile}
            aria-hidden="true"
          />
          <div className="relative z-10 h-full w-[272px] max-w-[82vw] overflow-y-auto border-r border-[#402818]/12 bg-[#F6E2CE] shadow-xl">
            {renderSidebarBody(true)}
          </div>
        </div>
      )}
    </>
  );
}
