import { useEffect, useRef, useState } from 'react';
import { Menu, X } from 'lucide-react';
import { NAV_ITEMS, type NavItem } from '../config/firstScreen';
import { KopiLogo } from './KopiLogo';

interface HeaderProps {
  onSelectNavItem: (item: NavItem) => void;
}

export function Header({ onSelectNavItem }: HeaderProps) {
  const [menuOpen, setMenuOpen] = useState(false);
  const menuButtonRef = useRef<HTMLButtonElement>(null);
  const closeButtonRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (!menuOpen) return;

    closeButtonRef.current?.focus();

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setMenuOpen(false);
        menuButtonRef.current?.focus();
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [menuOpen]);

  const handleNavClick = (item: NavItem) => {
    setMenuOpen(false);
    onSelectNavItem(item);
  };

  return (
    <header className="relative z-20 w-full pt-[max(1.25rem,env(safe-area-inset-top))] md:pt-7 lg:pt-8">
      <div className="mx-auto flex w-full max-w-[1380px] items-center justify-between px-6 sm:px-8 md:px-10 lg:px-14">
        <a
          href="#top"
          onClick={(event) => {
            event.preventDefault();
            onSelectNavItem(NAV_ITEMS[0]);
          }}
          className="inline-flex shrink-0 items-center rounded-md py-1 focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-[var(--kopi-brown)]"
          aria-label="KOPI Home"
        >
          <KopiLogo />
        </a>

        {/* Desktop navigation (>= 1025px) */}
        <nav
          aria-label="Primary navigation"
          className="kopi-nav-desktop items-center gap-8"
        >
          {NAV_ITEMS.map((item) => {
            if (item.isPrimaryAction) {
              return (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => handleNavClick(item)}
                  className="font-dm-sans whitespace-nowrap shrink-0 cursor-pointer rounded-full border border-[#392419]/28 px-5 py-2 text-[0.9375rem] font-medium leading-none text-[#392419] transition-colors duration-200 hover:border-[#392419] hover:bg-[#392419]/6 active:scale-[0.99] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#392419]"
                >
                  {item.label}
                </button>
              );
            }

            return (
              <button
                key={item.id}
                type="button"
                onClick={() => handleNavClick(item)}
                className="font-dm-sans whitespace-nowrap shrink-0 cursor-pointer py-1.5 text-[0.9375rem] font-medium leading-none text-[#392419] underline-offset-4 transition-opacity duration-200 hover:underline hover:opacity-80 focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-[#392419]"
              >
                {item.label}
              </button>
            );
          })}
        </nav>

        {/* Mobile & Tablet hamburger trigger (<= 1024px) */}
        <div className="kopi-nav-mobile-tablet items-center">
          <button
            ref={menuButtonRef}
            type="button"
            aria-label={menuOpen ? 'Close navigation menu' : 'Open navigation menu'}
            aria-expanded={menuOpen}
            aria-controls="kopi-mobile-menu"
            onClick={() => setMenuOpen((prev) => !prev)}
            className="inline-flex h-11 w-11 cursor-pointer items-center justify-center rounded-full text-[#392419] transition-colors duration-200 hover:bg-[#392419]/8 active:bg-[#392419]/12 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#392419]"
          >
            {menuOpen ? <X size={22} strokeWidth={1.9} /> : <Menu size={22} strokeWidth={1.9} />}
          </button>
        </div>
      </div>

      {/* Mobile & Tablet Navigation Drawer */}
      {menuOpen && (
        <div className="fixed inset-0 z-40 flex justify-end">
          <div
            className="fixed inset-0 bg-[#2F1B13]/25 transition-opacity"
            onClick={() => {
              setMenuOpen(false);
              menuButtonRef.current?.focus();
            }}
            aria-hidden="true"
          />
          <nav
            id="kopi-mobile-menu"
            aria-label="Mobile navigation"
            className="relative z-50 flex h-full w-[min(82vw,320px)] flex-col bg-[var(--kopi-cream)] px-7 pt-[max(1.5rem,env(safe-area-inset-top))] pb-8 shadow-xl"
          >
            <div className="flex items-center justify-between pb-8 border-b border-[#392419]/10">
              <KopiLogo />
              <button
                ref={closeButtonRef}
                type="button"
                aria-label="Close navigation menu"
                onClick={() => {
                  setMenuOpen(false);
                  menuButtonRef.current?.focus();
                }}
                className="inline-flex h-11 w-11 cursor-pointer items-center justify-center rounded-full text-[#392419] transition-colors duration-200 hover:bg-[#392419]/8 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#392419]"
              >
                <X size={22} strokeWidth={1.9} />
              </button>
            </div>

            <ul className="mt-6 flex flex-col gap-2">
              {NAV_ITEMS.map((item) => (
                <li key={item.id}>
                  <button
                    type="button"
                    onClick={() => handleNavClick(item)}
                    className={`font-dm-sans w-full cursor-pointer text-left text-[1.0625rem] font-medium leading-snug text-[#392419] transition-colors duration-150 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#392419] ${
                      item.isPrimaryAction
                        ? 'mt-4 rounded-full border border-[#392419]/30 px-5 py-3 text-center hover:border-[#392419] hover:bg-[#392419]/5'
                        : 'rounded-lg px-2 py-3 hover:bg-[#392419]/6'
                    }`}
                  >
                    {item.label}
                  </button>
                </li>
              ))}
            </ul>
          </nav>
        </div>
      )}
    </header>
  );
}
