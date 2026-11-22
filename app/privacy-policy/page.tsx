import type { Metadata } from 'next';
import { LegalPage, type LegalSection } from '@/components/shared/LegalPage';
import { CONTACT_EMAIL } from '@/lib/seo';

export const metadata: Metadata = {
  title: 'Privacy Policy | AutoFair',
  description:
    'What AutoFair collects when you list or enquire about a used car, who sees it, how long we keep it and how to get it deleted.',
  alternates: { canonical: '/privacy-policy' },
  openGraph: {
    title: 'Privacy Policy | AutoFair',
    description:
      'What AutoFair collects when you list or enquire about a used car, who sees it and how to get it deleted.',
    url: 'https://www.autofair.online/privacy-policy',
  },
};

const sections: LegalSection[] = [
  {
    h: 'What this page covers',
    p: [
      'This policy applies to autofair.online — the used-car listing and verification service we run from Bangalore, Karnataka. It does not apply to a buyer, a seller or a workshop you deal with after you leave our site. Their own policies govern that relationship.',
      'We are not a payment business. No purchase, booking amount or transfer fee is taken on this website, so no card, bank or wallet details ever reach us.',
    ],
  },
  {
    h: 'What we collect from you',
    p: [
      { b: 'Account. ', t: 'Your name, email address and a password. The password is stored as a hash by our authentication provider — we never see it in plain text. When you sign in as a buyer or seller we ask for an Indian mobile number before opening the workspace.' },
      { b: 'Listing details. ', t: 'If you sell through AutoFair: registration number, make, model, variant, year, fuel, transmission, kilometres driven, ownership history, location, expected price, and the photographs you upload.' },
      { b: 'Documents. ', t: 'RC, insurance, PUC, service history, challan status and HSRP are reviewed by our verifier. We record the outcome and a note, not a scanned copy of your ID.' },
      { b: 'Enquiries. ', t: 'When you ask about a car we keep your message, the enquiry type, any price you offered and the contact detail you type in, so the office can follow up.' },
    ],
  },
  {
    h: 'What we record about a car',
    p: [
      'Our verifier opens a file for each vehicle: a result for every check, section scores, notes on anything that needs attention, and sometimes an evidence photo taken during that check. This record is the dossier a buyer reads. It is our observation on a stated date, made by our staff.',
      'Photographs you upload are stored so they can be shown on the listing. They are served from public storage, which means anyone with the listing URL can view them. Do not upload a photo that contains a document number, address or face you want kept private.',
    ],
  },
  {
    h: 'What is collected automatically',
    p: [
      'Our hosting provider keeps standard request logs — IP address, the page requested, time, browser and referring site — used to keep the service running and to investigate abuse. Page visits are measured with Vercel Web Analytics, which is cookieless and does not build an advertising profile of you. We run no advertising pixels and no social trackers.',
    ],
  },
  {
    h: 'What we never collect',
    p: [
      'No Aadhaar number, no KYC document images, no card or bank credentials, no precise location from your device (we switch device geolocation off), and no contact list. We do not sell, rent or trade any personal information.',
    ],
  },
  {
    h: 'Who sees your information',
    p: [
      { b: 'On the public listing: ' , t: 'the car details, the inspection record and the photographs. Not your phone number, not your email, not your account name.' },
      { b: 'Your mobile number is not printed anywhere on the site. ' , t: 'Buyers and sellers reach each other through AutoFair; the office passes the enquiry across.' },
      { b: 'AutoFair staff. ' , t: 'The verifier assigned to your file and the office team can see the listing and enquiry records they need for their job.' },
      { b: 'Legal requests. ' , t: 'We will disclose records if a lawful order from an Indian authority requires it.' },
    ],
  },
  {
    h: 'Our service providers',
    p: [
      'Each of them processes data under its own terms so the site can work:',
      { b: 'Supabase — ' , t: 'the PostgreSQL database, file storage for photographs and the sign-in system.' },
      { b: 'Vercel — ' , t: 'hosting, and cookieless web analytics.' },
      { b: 'Resend — ' , t: 'transactional email such as enquiry notifications and sign-in links.' },
      { b: 'Cloudflare — ' , t: 'domain name resolution.' },
    ],
  },
  {
    h: 'Cookies and sign-in',
    p: [
      'Your signed-in session is stored in your own browser by our authentication provider so you are not asked for a password on every page. Clearing site data signs you out. There is no advertising cookie and no cross-site tracking cookie on this site.',
    ],
  },
  {
    h: 'How we use information',
    p: [
      'To publish and verify the dossier, to route an enquiry to the right party, to contact you about a listing you own or asked about, to spot duplicate or fraudulent submissions, to meet a legal obligation, and to understand which pages are useful.',
    ],
  },
  {
    h: 'How long we keep it, and deletion',
    p: [
      'We keep a listing while it is live. When you mark it sold or paused it stops appearing in the public browse pages; the record itself is retained because it documents a verification we published. An enquiry stays with the file it belongs to.',
      'Write to us at the address at the foot of this page and we will delete your account, your listings and your photographs, or send you a copy of what we hold. We keep only the minimum needed for a legal or fraud record after that, and we say so when we do.',
    ],
  },
  {
    h: 'Your rights and grievance contact',
    p: [
      `You may ask to access, correct or delete the personal data you gave us, withdraw a consent you have given, or nominate someone to act on your account. The same address handles complaints: ${CONTACT_EMAIL}. We answer within a reasonable period and tell you what we changed.`,
    ],
  },
  {
    h: 'Security, children and changes',
    p: [
      'The whole site is HTTPS with HTTP Strict Transport Security enabled for two years, database access is row-level-scoped per role, and staff work through their own accounts rather than a shared login. No system is unbreakable, so keep your password to yourself.',
      'The site is for people 18 and older who can own and transfer a vehicle. If we change this policy we update the date at the top of the page; material changes are announced on the site before they take effect.',
    ],
  },
];

export default function PrivacyPolicyPage() {
  return (
    <LegalPage
      eyebrow="PRIVACY  •  WHAT WE HOLD ABOUT YOU"
      title="Privacy Policy"
      intro="AutoFair exists to publish a fuller record about a used car than a classified ad does. That means we hold real information about the people who list and enquire. This page says exactly what we hold, where it goes and how to have it removed."
      updated="22 November 2026"
      sections={sections}
    />
  );
}
