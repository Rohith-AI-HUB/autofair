export type ListingStatus = 'LIVE' | 'IN REVIEW' | 'DRAFT';

export interface SampleInquiry {
  who: string;
  what: string;
  when: string;
}

export interface Listing {
  id: string;
  slug: string;
  title: string;
  price: string;
  priceNum: number;
  createdAt: number;
  publishedAt: number | null;
  priceLabel: string;
  spec: string;
  inspectionId: string;
  status: ListingStatus;
  /** e.g. "✓ 82/82 CHECKS  •  1.2k views  •  14 inquiries" */
  meta: string;
  metaTone: 'teal' | 'muted';
  views: string;
  viewsNum: number;
  inquiries: number;
  image: string;
  primaryAction: string;
  secondaryAction: string;
  inquiriesSample: SampleInquiry[];
}

export const listings: Listing[] = [
  {
    id: 'L1',
    slug: '2022-hyundai-creta-sx',
    title: '2022 Hyundai Creta SX',
    price: '₹12.40 Lakh',
    priceNum: 1240000,
    createdAt: 1700000000000,
    publishedAt: 1700000000000,
    priceLabel: 'VIEW INQUIRIES (14) →',
    spec: '2022  •  PETROL  •  28K KM  •  KA-05-MN-4218',
    inspectionId: 'AF-2026-008421',
    status: 'LIVE',
    meta: '✓ 82/82 CHECKS  •  1.2k views  •  14 inquiries',
    metaTone: 'teal',
    views: '1.2k views',
    viewsNum: 1200,
    inquiries: 14,
    image:
      'https://images.unsplash.com/photo-1630809325355-4807a4a6b944?crop=entropy&cs=tinysrgb&fit=max&fm=jpg&q=80&w=1080',
    primaryAction: 'Open file →',
    secondaryAction: 'Edit',
    inquiriesSample: [
      { who: 'Buyer • Whitefield', what: 'Asked for the inspection PDF', when: '2h ago' },
      { who: 'Buyer • HSR Layout', what: 'Requested a test drive slot', when: '1d ago' },
      { who: 'Buyer • Electronic City', what: 'Negotiated ₹12.10 Lakh', when: '2d ago' },
    ],
  },
  {
    id: 'L2',
    slug: '2021-maruti-baleno-zeta',
    title: '2021 Maruti Baleno Zeta',
    price: '₹7.85 Lakh',
    priceNum: 785000,
    createdAt: 1699900000000,
    publishedAt: null,
    priceLabel: 'WHAT HAPPENS NEXT?',
    spec: '2021  •  PETROL  •  41K KM  •  KA-03-NP-7731',
    inspectionId: 'AF-2026-008417',
    status: 'IN REVIEW',
    meta: '◷ REPORT IN ~24H  •  320 views  •  3 inquiries',
    metaTone: 'muted',
    views: '320 views',
    viewsNum: 320,
    inquiries: 3,
    image:
      'https://images.unsplash.com/photo-1716702148744-15262e2433ac?crop=entropy&cs=tinysrgb&fit=max&fm=jpg&q=80&w=1080',
    primaryAction: 'Preview →',
    secondaryAction: 'Edit',
    inquiriesSample: [
      { who: 'Buyer • Koramangala', what: 'Asked when the report goes live', when: '5h ago' },
    ],
  },
  {
    id: 'L3',
    slug: '2019-hyundai-i20-asta',
    title: '2019 Hyundai i20 Asta',
    price: '₹6.25 Lakh',
    priceNum: 625000,
    createdAt: 1699800000000,
    publishedAt: null,
    priceLabel: 'EXPECTED PRICE',
    spec: '2019  •  DIESEL  •  62K KM  •  DOCS PENDING',
    inspectionId: 'AF-2026-008398',
    status: 'DRAFT',
    meta: '○ 60% COMPLETE  •  RC PENDING  •  0 views',
    metaTone: 'muted',
    views: '0 views',
    viewsNum: 0,
    inquiries: 0,
    image:
      'https://images.unsplash.com/photo-1590375953693-25bf8beb5297?crop=entropy&cs=tinysrgb&fit=max&fm=jpg&q=80&w=1080',
    primaryAction: 'Resume draft →',
    secondaryAction: 'Delete',
    inquiriesSample: [],
  },
];
