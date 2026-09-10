import type { InspectionCategory } from '@/types';

/**
 * Sample inspection data — mirrors the approved Pen.dev dossier.
 * Labelled as SAMPLE in UI. Do not present as certified claims.
 */
export const sampleInspection: InspectionCategory[] = [
  {
    id: 'engine',
    title: 'ENGINE & TRANSMISSION',
    passed: 14,
    total: 14,
    items: [
      { name: 'Cold start + idle', result: 'pass', note: 'Stable idle, no warning lamps.' },
      { name: 'Oil + coolant levels', result: 'pass', note: 'Levels correct, no contamination.' },
      { name: 'Gearbox shift quality', result: 'pass', note: 'All gears engage smoothly.' },
    ],
  },
  {
    id: 'brakes',
    title: 'BRAKES',
    passed: 8,
    total: 8,
    items: [
      { name: 'Pad thickness (F/R)', result: 'pass', note: 'Front 7mm, rear 6mm.' },
      { name: 'Brake test 40–0 km/h', result: 'pass', note: 'Straight stop, no judder.' },
    ],
  },
  {
    id: 'suspension',
    title: 'SUSPENSION',
    passed: 9,
    total: 9,
    items: [
      { name: 'Bounce + noise test', result: 'pass', note: 'No knocks over speed breakers.' },
      { name: 'Underbody inspection', result: 'pass', note: 'No damage, surface rust only.' },
    ],
  },
  {
    id: 'tyres',
    title: 'TYRES & WHEELS',
    passed: 7,
    total: 8,
    items: [
      { name: 'Front left tyre', result: 'attention', note: '3.2 mm — replace in ~5k km.' },
      { name: 'Rear tyres', result: 'pass', note: '5.8 mm, even wear.' },
      { name: 'Spare + jack', result: 'pass', note: 'Unused, tools present.' },
    ],
  },
  {
    id: 'exterior',
    title: 'EXTERIOR',
    passed: 15,
    total: 16,
    items: [
      { name: 'Paint meter — panels', result: 'pass', note: 'All panels 90–130 microns except rear bumper.' },
      { name: 'Rear bumper', result: 'attention', note: 'Repainted 2019, invoice on file.' },
    ],
  },
  {
    id: 'interior',
    title: 'INTERIOR',
    passed: 12,
    total: 12,
    items: [
      { name: 'Seats + trim', result: 'pass', note: 'No tears, all adjustments work.' },
      { name: 'AC cooling', result: 'pass', note: '7.2°C at vent in 5 min.' },
    ],
  },
  {
    id: 'electrical',
    title: 'ELECTRICAL',
    passed: 10,
    total: 10,
    items: [
      { name: 'Battery health', result: 'pass', note: '12.6V, 78% health.' },
      { name: 'Lights + infotainment', result: 'pass', note: 'All functions verified.' },
    ],
  },
  {
    id: 'documents',
    title: 'DOCUMENTS',
    passed: 5,
    total: 5,
    items: [
      { name: 'RC', result: 'pass', note: 'Sample reviewed — matches chassis.' },
      { name: 'Insurance + PUC', result: 'pass', note: 'Valid. Next PUC Feb 2027 (sample).' },
      { name: 'Challans + HSRP', result: 'pass', note: 'No pending challans in sample.' },
    ],
  },
];
