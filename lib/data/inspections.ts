import type { InspectionCategory } from '@/types';

/**
 * The 19-check protocol, filed under the 8 sections our verifiers use. The check
 * names and the per-section counts are read from the live inspection_sections /
 * inspection_items rows — all 11 published files carry these same 19.
 *
 * The notes are illustrative wording for the structure shown on /inspection;
 * this is a sample, not a report issued against a car. Real records are at /cars.
 */
export const verifiedInspection: InspectionCategory[] = [
  {
    id: 'engine',
    title: 'ENGINE & TRANSMISSION',
    passed: 3,
    total: 3,
    items: [
      { name: 'Cold start + idle', result: 'pass', note: 'Stable idle, no warning lamps.' },
      { name: 'Oil + coolant levels', result: 'pass', note: 'Levels correct, no contamination.' },
      { name: 'Gearbox shift quality', result: 'pass', note: 'All gears engage smoothly.' },
    ],
  },
  {
    id: 'brakes',
    title: 'BRAKES',
    passed: 2,
    total: 2,
    items: [
      { name: 'Pad thickness (F/R)', result: 'pass', note: 'Front 7mm, rear 6mm.' },
      { name: 'Brake test 40–0 km/h', result: 'pass', note: 'Straight stop, no judder.' },
    ],
  },
  {
    id: 'suspension',
    title: 'SUSPENSION',
    passed: 2,
    total: 2,
    items: [
      { name: 'Bounce + noise test', result: 'pass', note: 'No knocks over speed breakers.' },
      { name: 'Underbody inspection', result: 'pass', note: 'No damage, surface rust only.' },
    ],
  },
  {
    id: 'tyres',
    title: 'TYRES & WHEELS',
    passed: 2,
    total: 3,
    items: [
      { name: 'Front left tyre', result: 'attention', note: '3.2 mm — replace in ~5k km.' },
      { name: 'Rear tyres', result: 'pass', note: '5.8 mm, even wear.' },
      { name: 'Spare + jack', result: 'pass', note: 'Unused, tools present.' },
    ],
  },
  {
    id: 'exterior',
    title: 'EXTERIOR',
    passed: 1,
    total: 2,
    items: [
      { name: 'Paint meter — panels', result: 'pass', note: 'All panels 90–130 microns.' },
      { name: 'Rear bumper', result: 'attention', note: 'Repainted, invoice on file.' },
    ],
  },
  {
    id: 'interior',
    title: 'INTERIOR',
    passed: 2,
    total: 2,
    items: [
      { name: 'Seats + trim', result: 'pass', note: 'No tears, all adjustments work.' },
      { name: 'AC cooling', result: 'pass', note: '7.2°C at vent in 5 min.' },
    ],
  },
  {
    id: 'electrical',
    title: 'ELECTRICAL',
    passed: 2,
    total: 2,
    items: [
      { name: 'Battery health', result: 'pass', note: '12.6V, 78% health.' },
      { name: 'Lights + infotainment', result: 'pass', note: 'All functions verified.' },
    ],
  },
  {
    id: 'documents',
    title: 'DOCUMENTS',
    passed: 3,
    total: 3,
    items: [
      { name: 'RC', result: 'pass', note: 'Reviewed — matches chassis.' },
      { name: 'Insurance + PUC', result: 'pass', note: 'Valid. Next PUC Feb 2027.' },
      { name: 'Challans + HSRP', result: 'pass', note: 'No pending challans.' },
    ],
  },
];

/**
 * The published protocol, derived from the checklist itself. Marketing strings
 * quote this instead of a literal so the site cannot drift from the file again.
 */
export const PROTOCOL = {
  sections: verifiedInspection.length,
  ...verifiedInspection.reduce(
    (a, c) => ({ passed: a.passed + c.passed, total: a.total + c.total }),
    { passed: 0, total: 0 }
  ),
  flagged: verifiedInspection.flatMap((c) =>
    c.items.filter((i) => i.result !== 'pass').map((i) => i.name)
  ),
};
