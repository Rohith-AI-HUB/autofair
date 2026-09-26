import { cn } from '@/lib/utils';

const BTN =
  'block w-full px-6 py-3 text-center font-sans text-[14px] font-bold transition-colors disabled:opacity-60';

// All buyer inquiries route through the AutoFair office line; sellers'
// personal numbers are never shown to buyers.
const OFFICE_PHONE_DISPLAY = '+91 96864 13636';
const OFFICE_PHONE_WA = '919686413636';

export function SellerContact({
  inspectionId,
  variant = 'dossier',
}: {
  vehicleId: string;
  inspectionId: string;
  variant?: 'dossier' | 'trust';
}) {
  const href = `https://wa.me/${OFFICE_PHONE_WA}?text=${encodeURIComponent(
    `Hi AutoFair, I'm interested in ${inspectionId} on AutoFair.`
  )}`;
  const cls =
    variant === 'trust'
      ? 'bg-teal text-navy hover:bg-[#12a295]'
      : 'bg-navy text-white hover:bg-navy-2';

  return (
    <a
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      className={cn(BTN, cls)}
      aria-label={`Chat with AutoFair on WhatsApp about ${inspectionId}: ${OFFICE_PHONE_DISPLAY}`}
    >
      {OFFICE_PHONE_DISPLAY}
    </a>
  );
}
