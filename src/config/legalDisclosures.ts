import { LEGAL_DOCUMENT_VERSIONS } from '../data/firestoreContracts';

export { LEGAL_DOCUMENT_VERSIONS };

export interface LegalDocumentSection {
  readonly heading: string;
  readonly paragraphs: readonly string[];
}

export interface LegalDraftDocument {
  readonly kind: 'terms' | 'privacy';
  readonly title: string;
  readonly version: string;
  readonly draftStatusLabel: string;
  readonly effectiveNotice: string;
  readonly sections: readonly LegalDocumentSection[];
}

export const AGE_ELIGIBILITY_DISCLOSURE = {
  checkboxLabel:
    'I confirm that I am at least 18 years old and eligible to create a personal Kopi account.',
  honestyNote:
    'This is an explicit 18+ self-declaration recorded for pre-launch access gating. It is not an independent identity or government age verification check.',
} as const;

export const CONSENT_CHECKBOX_COPY = {
  labelPrefix: 'I have read and accept the pre-launch ',
  termsLinkLabel: 'Draft Terms of Service',
  labelMiddle: ' and ',
  privacyLinkLabel: 'Draft Privacy Policy',
  labelSuffix: ' (version recorded with timestamp).',
} as const;

export const DRAFT_TERMS_OF_SERVICE: LegalDraftDocument = {
  kind: 'terms',
  title: 'Kopi — Draft Terms of Service',
  version: LEGAL_DOCUMENT_VERSIONS.termsVersion,
  draftStatusLabel: 'Pre-launch Working Draft — Pending Legal Counsel Review',
  effectiveNotice:
    'This document is a pre-launch engineering disclosure placeholder, not final counsel-approved legal terms.',
  sections: [
    {
      heading: '1. Purpose & Illustrative Status',
      paragraphs: [
        'Kopi is an early-stage Business Opportunity Intelligence Platform. Current problem records displayed in Opportunity Radar, Problem Explorer, Problem Investigation, and Opportunity Evaluation are illustrative demonstration examples.',
        'Nothing shown in this pre-launch workspace constitutes verified market research, financial advice, legal advice, or a commercial guarantee.',
      ],
    },
    {
      heading: '2. Eligibility (18+ Self-Declaration)',
      paragraphs: [
        'By signing in to create a personal Kopi account, you confirm that you are 18 years of age or older. Unauthenticated visitors may continue reading the public demonstration problem records without creating an account.',
        'Account creation currently relies on your explicit 18+ self-declaration and Google account sign-in; formal age-assurance workflows remain a pre-launch legal requirement.',
      ],
    },
    {
      heading: '3. Saved Opportunities & Permitted Use',
      paragraphs: [
        'Authenticated accounts allow you to bookmark approved problem records into a personal Saved Opportunities collection under your user identifier.',
        'You agree not to attempt unauthorized access to other user accounts, internal research collections, or restricted database records.',
      ],
    },
    {
      heading: '4. Pre-Launch Limitations',
      paragraphs: [
        'Features including self-service account deletion, data export, AI research workflows, and payments are not yet enabled in this milestone. Pre-launch records and rules remain subject to legal review prior to public release.',
      ],
    },
  ],
};

export const DRAFT_PRIVACY_POLICY: LegalDraftDocument = {
  kind: 'privacy',
  title: 'Kopi — Draft Privacy Policy',
  version: LEGAL_DOCUMENT_VERSIONS.privacyPolicyVersion,
  draftStatusLabel: 'Pre-launch Working Draft — Pending Legal Counsel Review',
  effectiveNotice:
    'This document is a pre-launch plain-language privacy disclosure placeholder, not a final statutory privacy notice or compliance certification.',
  sections: [
    {
      heading: '1. Minimal Account Data Stored',
      paragraphs: [
        'Kopi signs you in through Google Authentication via Firebase Authentication. Your authentication session stays managed by Firebase Authentication.',
        'In Cloud Firestore, Kopi stores only the minimum fields required for account continuity: your Firebase user ID (uid), an optional display name (sanitized, up to 120 characters), your 18+ self-declaration status and timestamp, your Terms and Privacy Policy consent versions and timestamps, and the problem IDs you choose to bookmark.',
        'Kopi intentionally does not write your email address, phone number, profile photo URL, or physical address into your Cloud Firestore user profile document.',
      ],
    },
    {
      heading: '2. How Your Data Is Used & Isolated',
      paragraphs: [
        'Your saved opportunities and consent records are stored under your user-specific Firestore path (users/{uid} and users/{uid}/savedOpportunities) so only your verified signed-in session can read or manage your bookmarks.',
        'Pre-login bookmarks kept in browser storage (localStorage) remain on your device until you explicitly sign in and approve or complete migration to your account.',
      ],
    },
    {
      heading: '3. Pending Account Controls (Pre-Launch Blockers)',
      paragraphs: [
        'Automated data export, self-service account deletion, backup retention schedules, and designated Grievance Officer contact workflows are documented as unresolved pre-launch requirements and are not yet active in this milestone.',
      ],
    },
  ],
};
