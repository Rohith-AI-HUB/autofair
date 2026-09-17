/** Strong password policy for administrator-created internal accounts. */
export function isStrongStaffPassword(value: string): boolean {
  return value.length >= 12 && /[a-z]/.test(value) && /[A-Z]/.test(value) && /\d/.test(value) && /[^A-Za-z0-9]/.test(value);
}

export const STAFF_PASSWORD_MESSAGE =
  'Use at least 12 characters, including uppercase, lowercase, a number, and a symbol.';
