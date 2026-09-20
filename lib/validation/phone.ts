/**
 * Indian mobile helpers (WhatsApp reveal).
 * Stored canonical: E.164 `+91XXXXXXXXXX`. Display: `+91 96864 13636`.
 */

export function normalizeIndianMobile(input: string): string | null {
  const digits = (input ?? '').replace(/\D/g, '');
  let ten = digits;
  if (digits.length === 12 && digits.startsWith('91')) ten = digits.slice(2);
  else if (digits.length === 11 && digits.startsWith('0')) ten = digits.slice(1);
  if (!/^[6-9]\d{9}$/.test(ten)) return null;
  return `+91${ten}`;
}

export function formatIndianMobileDisplay(e164: string): string {
  const digits = (e164 ?? '').replace(/\D/g, '');
  const ten = digits.length === 12 && digits.startsWith('91') ? digits.slice(2) : digits;
  if (!/^[6-9]\d{9}$/.test(ten)) return e164;
  return `+91 ${ten.slice(0, 5)} ${ten.slice(5)}`;
}

export function waNumberFromE164(e164: string): string | null {
  const digits = (e164 ?? '').replace(/\D/g, '');
  if (digits.length === 12 && digits.startsWith('91') && /^[6-9]/.test(digits.slice(2, 3))) {
    return digits;
  }
  return null;
}
