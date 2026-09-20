import type { Car } from '@/types';

export const cars: Car[] = [
  {
    id: '1',
    slug: '2022-hyundai-creta-sx',
    make: 'Hyundai',
    model: 'Creta',
    variant: 'SX',
    year: 2022,
    price: 1240000,
    mileageKm: 42180,
    fuel: 'Diesel',
    transmission: 'Manual',
    ownership: 'First owner',
    location: 'Bangalore',
    registration: 'KA-05-MN-4218',
    images: [
      'https://images.unsplash.com/photo-1781197824875-c6e07188896b?crop=entropy&cs=tinysrgb&fit=max&fm=jpg&q=80&w=1080',
      'https://images.unsplash.com/photo-1670122872487-8fea1dd1c08c?crop=entropy&cs=tinysrgb&fit=max&fm=jpg&q=80&w=1080',
    ],
    inspectionId: 'AF-2026-008421',
    score: 8.7,
    condition: {
      mechanical: 'GOOD',
      exterior: 'GOOD',
      interior: 'VERY GOOD',
      tyres: 'ATTENTION',
    },
    verification: {
      verified: true,
      inspection: '82 / 82 DONE',
      documents: 'VERIFIED',
      accidentHistory: 'CLEAR',
    },
  },
  {
    id: '2',
    slug: '2021-maruti-baleno-zeta',
    make: 'Maruti',
    model: 'Baleno',
    variant: 'Zeta',
    year: 2021,
    price: 785000,
    mileageKm: 35640,
    fuel: 'Petrol',
    transmission: 'AMT',
    ownership: 'First owner',
    location: 'Mumbai',
    registration: 'MH-02-EK-7734',
    images: [
      'https://images.unsplash.com/photo-1609831489866-3a2fe235f093?crop=entropy&cs=tinysrgb&fit=max&fm=jpg&q=80&w=1080',
    ],
    inspectionId: 'AF-2026-008417',
    score: 8.4,
    condition: {
      mechanical: 'GOOD',
      exterior: 'GOOD',
      interior: 'GOOD',
      tyres: 'GOOD',
    },
    verification: {
      verified: true,
      inspection: '82 / 82 DONE',
      documents: 'VERIFIED',
      accidentHistory: 'CLEAR',
    },
  },
  {
    id: '3',
    slug: '2020-honda-city-vx',
    make: 'Honda',
    model: 'City',
    variant: 'VX',
    year: 2020,
    price: 990000,
    mileageKm: 51200,
    fuel: 'Petrol',
    transmission: 'Manual',
    ownership: 'Second owner',
    location: 'Delhi NCR',
    registration: 'DL-08-AB-9921',
    images: [
      'https://images.unsplash.com/photo-1764271721894-eada6ad13bf1?crop=entropy&cs=tinysrgb&fit=max&fm=jpg&q=80&w=1080',
    ],
    inspectionId: 'AF-2026-008402',
    score: 8.1,
    condition: {
      mechanical: 'GOOD',
      exterior: 'GOOD',
      interior: 'VERY GOOD',
      tyres: 'GOOD',
    },
    verification: {
      verified: true,
      inspection: '80 / 82 DONE',
      documents: 'VERIFIED',
      accidentHistory: 'DISCLOSED',
    },
  },
  {
    id: '4',
    slug: '2023-tata-nexon-xz-plus',
    make: 'Tata',
    model: 'Nexon',
    variant: 'XZ+',
    year: 2023,
    price: 1120000,
    mileageKm: 22900,
    fuel: 'Diesel',
    transmission: 'Manual',
    ownership: 'First owner',
    location: 'Pune',
    registration: 'MH-12-RT-4456',
    images: [
      'https://images.unsplash.com/photo-1759505738499-8c9b26c1b7e7?crop=entropy&cs=tinysrgb&fit=max&fm=jpg&q=80&w=1080',
    ],
    inspectionId: 'AF-2026-008433',
    score: 8.9,
    condition: {
      mechanical: 'VERY GOOD',
      exterior: 'GOOD',
      interior: 'VERY GOOD',
      tyres: 'GOOD',
    },
    verification: {
      verified: true,
      inspection: '82 / 82 DONE',
      documents: '1 PENDING',
      accidentHistory: 'CLEAR',
    },
    docsPending: true,
  },
  {
    id: '5',
    slug: '2019-hyundai-i20-asta',
    make: 'Hyundai',
    model: 'i20',
    variant: 'Asta',
    year: 2019,
    price: 625000,
    mileageKm: 58300,
    fuel: 'Petrol',
    transmission: 'Manual',
    ownership: 'Second owner',
    location: 'Bangalore',
    registration: 'KA-03-MJ-1109',
    images: [
      'https://images.unsplash.com/photo-1670122872487-8fea1dd1c08c?crop=entropy&cs=tinysrgb&fit=max&fm=jpg&q=80&w=1080',
    ],
    inspectionId: 'AF-2026-008398',
    score: 7.8,
    condition: {
      mechanical: 'GOOD',
      exterior: 'ATTENTION',
      interior: 'GOOD',
      tyres: 'ATTENTION',
    },
    verification: {
      verified: true,
      inspection: '78 / 82 DONE',
      documents: 'VERIFIED',
      accidentHistory: 'DISCLOSED',
    },
  },
  {
    id: '6',
    slug: '2022-kia-seltos-htx',
    make: 'Kia',
    model: 'Seltos',
    variant: 'HTX',
    year: 2022,
    price: 1345000,
    mileageKm: 31800,
    fuel: 'Diesel',
    transmission: 'Automatic',
    ownership: 'First owner',
    location: 'Mumbai',
    registration: 'MH-04-KL-8823',
    images: [
      'https://images.unsplash.com/photo-1781197824875-c6e07188896b?crop=entropy&cs=tinysrgb&fit=max&fm=jpg&q=80&w=1080',
    ],
    inspectionId: 'AF-2026-008429',
    score: 8.6,
    condition: {
      mechanical: 'GOOD',
      exterior: 'VERY GOOD',
      interior: 'VERY GOOD',
      tyres: 'GOOD',
    },
    verification: {
      verified: true,
      inspection: '82 / 82 DONE',
      documents: 'VERIFIED',
      accidentHistory: 'CLEAR',
    },
  },
];

export function getCarBySlug(slug: string): Car | undefined {
  return cars.find((c) => c.slug === slug);
}

export function formatPrice(n: number): string {
  const lakh = n / 100000;
  return `₹${lakh.toFixed(2)} Lakh`;
}

export function formatKm(n: number): string {
  return `${n.toLocaleString('en-IN')} km`;
}

export function carTitle(car: Pick<Car, 'year' | 'make' | 'model' | 'variant'>): string {
  const v = car.variant && car.variant.trim() && car.variant.trim() !== '—' ? ` ${car.variant.trim()}` : '';
  return `${car.year} ${car.make} ${car.model}${v}`;
}
