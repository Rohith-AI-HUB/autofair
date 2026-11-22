import type { Metadata } from 'next';
import { LegalPage, type LegalSection } from '@/components/shared/LegalPage';
import { CONTACT_EMAIL, CONTACT_PHONE } from '@/lib/seo';

export const metadata: Metadata = {
  title: 'Terms of Use | AutoFair',
  description:
    'The rules for listing a car or enquiring through AutoFair: what our verification covers, what it does not, and who is responsible for the sale.',
  alternates: { canonical: '/terms' },
  openGraph: {
    title: 'Terms of Use | AutoFair',
    description:
      'What AutoFair verification covers, what it does not, and who is responsible for the sale.',
    url: 'https://www.autofair.online/terms',
  },
};

const sections: LegalSection[] = [
  {
    h: 'What AutoFair is',
    p: [
      'AutoFair is an independent listing and verification service. We photograph, check and publish a file about a used car, and we pass enquiries between the people who own it and the people who want it.',
      'Unless a page says AutoFair is the seller, we are not the owner of any vehicle listed, not the agent taking delivery or payment, and not a party to the sale contract. The agreement for purchase is between buyer and seller. No money changes hands on this website, and we never ask you to pay us through it.',
    ],
  },
  {
    h: 'Using the site',
    p: [
      'You must be 18 or older and legally able to own and transfer a motor vehicle. Keep your password to yourself — you are responsible for activity under your account. Tell us promptly at {email} if you think someone else has it.'.replace('{email}', CONTACT_EMAIL),
      'Do not: submit false information, upload photographs that are not yours, place enquiries you have no intention of following up, scrape or re-publish dossiers or inspection records elsewhere without written permission, interfere with the site or its checks, or use an Inspection ID that was issued for another vehicle.',
    ],
  },
  {
    h: 'If you list a car',
    p: [
      { b: 'You declare: ' , t: 'that you own the vehicle or are authorised by the owner, that the details and documents you give are true, and that the photographs are yours to publish. You keep that responsibility after the listing goes down.' },
      { b: 'Visibility: ' , t: 'a published file is public and indexed by search engines. Its text and photographs may appear in Google, in AI answers and in cached copies even after you take the listing down.' },
      { b: 'Removing a listing: ' , t: 'while a file is live it cannot be deleted outright, because a verification has already been published against it. Mark it SOLD or PAUSED from your own listings page and it leaves the browse pages and the sitemap immediately. Ask us in writing if the file itself must come down.' },
      { b: 'Price: ' , t: 'the figure you set is displayed as what you are asking, not what we have valued the car at. Negotiation happens between you and the buyer.' },
    ],
  },
  {
    h: 'If you are buying',
    p: [
      'A dossier is our verifier’s record of what we observed on the date stated — checks, documents seen, and anything we flagged for attention. It is not a guarantee of mechanical fitness, hidden damage, title, or that the car has not changed since we looked at it.',
      'Before you pay anyone: see the car, drive it, match the registration number and chassis/engine numbers against the RC, and take it to a mechanic you trust. Complete the transfer with the transport office within the period the RTO requires, in the name that actually bought the car. Nobody at AutoFair can do that step for you.',
    ],
  },
  {
    h: 'Verification limits',
    p: [
      'We verify what is presentable on the day: the car at the stated location and the documents the seller produces. We do not run an ownership dispute search, we do not certify a future condition, and a file marked with attention items is a normal outcome, not a failed car. Files with critical safety problems are not published at all.',
    ],
  },
  {
    h: 'Content, photographs and marks',
    p: [
      'Your car details and photographs stay yours. By listing you give AutoFair permission to publish, edit the layout of, and keep them for as long as the file exists, plus in archives and caches. The dossier structure, wording, scoring and site design are ours; the AutoFair name and layout are not to be reused as if they were yours.',
      'Figures shown in marketing previews on this site are illustrative sample files, not live listings.',
    ],
  },
  {
    h: 'Availability and changes',
    p: [
      'The site is provided as it runs, and we may change features, checks or the look of a file. We will keep the record honest: if a check is added or dropped, the file shows what was actually done for that car. We may refuse or remove a listing that puts buyers at risk or breaches these terms.',
    ],
  },
  {
    h: 'No warranty and limitation of liability',
    p: [
      'To the maximum extent allowed by Indian law, the site and the dossiers are provided “as is” and “as available”, without warranty of any kind beyond what is written in a specific file. AutoFair is not liable for a vehicle’s condition, for a transaction between a buyer and a seller, for loss of earnings, or for indirect or consequential loss. Nothing here limits liability that cannot lawfully be limited, including for our own fraud or wilful misconduct.',
    ],
  },
  {
    h: 'If you cause a problem',
    p: [
      'If a claim comes from information you submitted, photographs you uploaded, or your use of the site in breach of these terms, you cover the resulting loss and costs rather than AutoFair.',
    ],
  },
  {
    h: 'Governing law and contact',
    p: [
      'These terms are governed by the laws of India, and the courts at Bangalore, Karnataka have jurisdiction. Questions: {email} or {phone}.'
        .replace('{email}', CONTACT_EMAIL)
        .replace('{phone}', CONTACT_PHONE),
    ],
  },
];

export default function TermsPage() {
  return (
    <LegalPage
      eyebrow="TERMS  •  THE RULES BETWEEN US"
      title="Terms of Use"
      intro="Short version: we publish an honest file, you stay responsible for what you tell us and for the deal you actually make. These terms set out what that means in detail."
      updated="22 November 2026"
      sections={sections}
    />
  );
}
