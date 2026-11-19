export interface HeadlineWord {
  text: string;
  font: 'newsreader' | 'cormorant';
  weight: 600;
  style: 'normal' | 'italic';
  color: '#392419' | '#C65A1B';
  line: 1 | 2;
}

export interface NavItem {
  id: 'home' | 'explore' | 'resources' | 'about' | 'sign-in';
  label: string;
  href: string;
  isPrimaryAction?: boolean;
  plannedRouteNote: string;
}

export const HERO_HEADLINE_WORDS: readonly HeadlineWord[] = [
  { text: 'Find', font: 'newsreader', weight: 600, style: 'normal', color: '#392419', line: 1 },
  { text: 'real', font: 'newsreader', weight: 600, style: 'normal', color: '#392419', line: 1 },
  { text: 'problems.', font: 'newsreader', weight: 600, style: 'normal', color: '#392419', line: 1 },
  { text: 'Uncover', font: 'newsreader', weight: 600, style: 'normal', color: '#392419', line: 2 },
  { text: 'real', font: 'newsreader', weight: 600, style: 'normal', color: '#392419', line: 2 },
  { text: 'opportunities.', font: 'cormorant', weight: 600, style: 'italic', color: '#C65A1B', line: 2 },
] as const;

export const HERO_DESCRIPTION =
  'Turn everyday complaints into meaningful business ideas.';

export const HERO_CTA_LABEL = 'Explore Opportunities';

export const NAV_ITEMS: readonly NavItem[] = [
  {
    id: 'home',
    label: 'Home',
    href: '#top',
    plannedRouteNote: 'You are viewing the KOPI introduction screen.',
  },
  {
    id: 'explore',
    label: 'Explore',
    href: '#explore',
    plannedRouteNote:
      'Opportunity Radar and Problem Explorer will connect here once the discovery workspace screens are built.',
  },
  {
    id: 'resources',
    label: 'Resources',
    href: '#resources',
    plannedRouteNote:
      'Editorial research guides and methodology notes are scheduled for an upcoming screen.',
  },
  {
    id: 'about',
    label: 'About',
    href: '#about',
    plannedRouteNote:
      'Platform background and editorial principles are scheduled for an upcoming screen.',
  },
  {
    id: 'sign-in',
    label: 'Sign In',
    href: '#sign-in',
    isPrimaryAction: true,
    plannedRouteNote:
      'Authentication (Google and Email magic link) will connect here once the auth flow is implemented.',
  },
] as const;

export const MEDIA_ASSETS = {
  mobileVideo: '/assets/aistudio/screen_1_animated_57f7d1f8.mp4',
  mobileFallback: '/assets/aistudio/mobile_bg_544bdbdc.png',
  tabletBg: '/assets/aistudio/tab_bg_0a831155.png',
  desktopBg: '/assets/aistudio/laptop_bg_16294420.png',
  officialLogo: '/assets/kopi-logo.png',
} as const;

export function selectBackgroundMode(viewportWidth: number): 'mobile' | 'tablet' | 'desktop' {
  if (viewportWidth <= 767) return 'mobile';
  if (viewportWidth <= 1024) return 'tablet';
  return 'desktop';
}
