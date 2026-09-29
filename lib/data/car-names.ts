/**
 * Canonical car naming.
 *
 * Sellers type make, model and trim into a single free-text MODEL box (the form
 * placeholder used to teach exactly that: "Creta SX"), so this module is the only
 * place that decides how a listing is named. Every rule here is conservative:
 * recognised text is rewritten to its canonical spelling, unrecognised text is
 * tidied and left alone. Nothing is ever dropped or guessed at, because a wrong
 * canonical name silently rewrites a seller's listing.
 *
 * Dependency-free on purpose: tests import this file through node's type
 * stripping, which cannot resolve the "@/..." alias.
 */

export interface CarNameParts {
  make: string;
  model: string;
  variant: string;
}

const MAKES = [
  'Audi', 'BMW', 'Chevrolet', 'Citroen', 'Ford', 'Force Motors', 'Honda', 'Hyundai',
  'Isuzu', 'Jaguar', 'Jeep', 'Kia', 'Land Rover', 'MG', 'Mahindra', 'Maruti Suzuki',
  'Mercedes-Benz', 'Mini', 'Nissan', 'Porsche', 'Renault', 'Skoda', 'Toyota',
  'Volkswagen', 'Volvo', 'BYD',
];

/** Spellings owners use that resolve to a canonical make. */
const MAKE_ALIASES: Record<string, string> = {
  'm&m': 'Mahindra',
  'mahindra & mahindra': 'Mahindra',
  'maruti': 'Maruti Suzuki',
  'maruti suzuki motors': 'Maruti Suzuki',
  'vw': 'Volkswagen',
  'volkswagon': 'Volkswagen',
  'volkswagen india': 'Volkswagen',
  'mercedes': 'Mercedes-Benz',
  'mb': 'Mercedes-Benz',
  'landrover': 'Land Rover',
  'rangerovert': 'Land Rover',
  'hyndai': 'Hyundai',
  'hundai': 'Hyundai',
  'toyoita': 'Toyota',
  'nssan': 'Nissan',
};

/**
 * Model names per make, in the maker's own spelling. Partial on purpose — an
 * omitted model is left untouched, so adding entries only ever improves output.
 */
const MODELS_BY_MAKE: Record<string, string[]> = {
  Hyundai: [
    'Creta', 'Venue', 'Exter', 'i20', 'Elite i20', 'Grand i10 Nios', 'Grand i10',
    'i10', 'Aura', 'Verna', 'Tucson', 'Alcazar', 'Ioniq 5', 'Xcent', 'Elantra',
  ],
  Tata: [
    'Nexon', 'Nexon EV', 'Punch', 'Punch EV', 'Altroz', 'Harrier', 'Safari',
    'Curvv', 'Tiago', 'Tiago EV', 'Tigor', 'Tigor EV', 'Bolt', 'Aria', 'Winger',
    'Yodha', 'Hexa', 'Zest',
  ],
  Mahindra: [
    'Thar', 'Thar RoX', 'XUV700', 'XUV400', 'XUV300', 'Scorpio N', 'Scorpio',
    'Bolero', 'Marazzo', 'Alturas G4', 'KUV100', 'Xylo', 'Suprem', 'BE 6',
    'XEV 9e', 'Furio', 'Pik Up',
  ],
  'Maruti Suzuki': [
    'Swift', 'Swift Dzire', 'Dzire', 'Baleno', 'Baleno RS', 'Fronx', 'Ignis',
    'Wagon R', 'Alto K10', 'Alto', 'Celerio', 'Ertiga', 'XL6', 'S-Presso',
    'Grand Vitara', 'Jimny', 'Tourer S', 'Ciaz', 'A-Star', 'Zen', 'Esteem', 'Kizashi',
  ],
  Toyota: [
    'Glanza', 'Urban Cruiser Hyryder', 'Urban Cruiser', 'Innova Crysta', 'Innova',
    'Fortuner', 'Legender', 'Rumion', 'Taisor', 'Camry', 'Hilux', 'Qualis',
    'Etios', 'bZ4X',
  ],
  Kia: ['Sonet', 'Seltos', 'Carens', 'Carnival', 'Syros', 'EV6', 'Optima'],
  Renault: ['Kwid', 'Triber', 'Kiger', 'Duster', 'Pulse', 'Lodgy', 'Scala', 'Captur'],
  Honda: ['Amaze', 'City', 'Elevate', 'WR-V', 'Jazz', 'Mobilio', 'Civic', 'BR-V', 'Breeze'],
  Skoda: ['Kushaq', 'Slavia', 'Kodiaq', 'Octavia', 'Superb', 'Laura', 'Rapid', 'Yeti'],
  Volkswagen: ['Virtus', 'Taigun', 'Polo', 'Vento', 'Passat', 'Tiguan', 'T-Roc', 'T-Cross'],
  MG: ['Hector', 'Astor', 'ZS EV', 'Gloster', 'Majestor', 'Comet', 'Marvel R', 'Hector Plus'],
  Jeep: ['Compass', 'Meridian', 'Wrangler', 'Grand Cherokee', 'Renegade'],
  Nissan: ['Magnite', 'Kicks', 'X-Trail', 'Terrano', 'Sunny', 'Micra'],
  Ford: ['EcoSport', 'Freestyle', 'Aspire', 'Figo', 'Endeavour', 'Classic', 'S-Max'],
  Chevrolet: ['Beat', 'Sail', 'Enjoy', 'Cruze', 'Tavera', 'Spark', 'Optra'],
};

/** Trim tokens whose canonical form is not simply the uppercase spelling. */
const TRIM_SPELLING: Record<string, string> = {
  vxi: 'VXi', zxi: 'ZXi', zdi: 'ZDi', vdi: 'VDi', ldi: 'LDi', mdi: 'MDi',
  vx: 'VX', vvx: 'VVX', amt: 'AMT', cvt: 'CVT', mt: 'MT', at: 'AT',
  abs: 'ABS', ebd: 'EBD', esp: 'ESP', hse: 'HSE', ev: 'EV',
};

/** Short trim words that are names, not acronyms — keep the owner's casing. */
const TRIM_KEEP_CASE = new Set(['base', 'top', 'mid', 'auto', 'pure', 'sig', 'lux', 'luxe', 'eta', 'zeta']);

const KNOWN_MAKES = new Map(MAKES.map((m) => [m.toLowerCase(), m]));

const SORTED_MODELS_BY_MAKE = new Map<string, string[]>(
  Object.entries(MODELS_BY_MAKE).map(([make, models]) => [
    make,
    [...models].sort((a, b) => b.length - a.length),
  ])
);

function tidy(value: string): string {
  return value.replace(/[,;]+/g, ' ').replace(/\s+/g, ' ').trim();
}

function canonTrimToken(token: string): string {
  const match = /^([^+]*)(\+*)$/.exec(token);
  const base = match?.[1] ?? token;
  const plus = match?.[2] ?? '';
  const key = base.toLowerCase();
  if (TRIM_KEEP_CASE.has(key)) return base + plus;
  const canonical =
    TRIM_SPELLING[key] ??
    (/^[0-9]{0,3}[a-z]{1,3}(\([a-z]{1,3}\))?$/.test(key) ? key.toUpperCase() : base);
  return canonical + plus;
}

/** "E plus" / "xz +" -> "E+" / "XZ+"; unknown tokens keep their spelling. */
function normalizeVariant(raw: string): string {
  const text = tidy(raw).replace(/\bplus\b/gi, '+').replace(/\s+\+/g, '+');
  if (!text) return '';
  return text.split(' ').map(canonTrimToken).join(' ').trim();
}

function canonicalMake(raw: string): string {
  const text = tidy(raw);
  const key = text.toLowerCase();
  return KNOWN_MAKES.get(key) ?? MAKE_ALIASES[key] ?? (text.charAt(0).toUpperCase() + text.slice(1).toLowerCase());
}

/**
 * Split "Creta E plus" into model "Creta" + variant "E+" using the make's known
 * model list. Without a recognised model boundary the string is returned intact
 * as the model, which is the pre-existing behaviour.
 */
function resolveModel(make: string, modelText: string, variantText: string): CarNameParts {
  const known = SORTED_MODELS_BY_MAKE.get(make);
  if (!known) return { make, model: modelText, variant: variantText };
  const lower = modelText.toLowerCase();
  for (const model of known) {
    const prefix = model.toLowerCase();
    if (lower !== prefix && !lower.startsWith(`${prefix} `)) continue;
    const rest = modelText.slice(model.length).trim();
    return { make, model, variant: variantText || normalizeVariant(rest) };
  }
  return { make, model: modelText, variant: variantText };
}

export function normalizeCarName(input: {
  make: string;
  model: string;
  variant?: string | null;
}): CarNameParts {
  const make = canonicalMake(input.make);
  const modelText = tidy(input.model);
  const givenVariant = normalizeVariant(input.variant ?? '');
  if (!modelText) return { make, model: '', variant: givenVariant };
  return resolveModel(make, modelText, givenVariant);
}

/**
 * "Hyundai Creta E+" — the name without the year, for labels and logs.
 * Renders the variant as stored: re-casing is normalizeCarName's job at write
 * time, and doing it here would shout trims the makers spell as words ("Zeta").
 */
export function carModelName(parts: { make: string; model: string; variant?: string | null }): string {
  const variant = (parts.variant ?? '').replace(/\s+/g, ' ').trim();
  return [parts.make.trim(), parts.model.trim(), variant].filter(Boolean).join(' ');
}

/**
 * "2017 Hyundai Creta E+" — the one title formula, for cards, the detail page,
 * meta tags, emails and `listings.title`. '—' is what dbToCar stores when no
 * variant was ever recorded.
 */
export function carTitle(car: { year: number; make: string; model: string; variant?: string | null }): string {
  const variant = car.variant === '—' ? '' : car.variant ?? '';
  return `${car.year} ${carModelName({ make: car.make, model: car.model, variant })}`.trim();
}
