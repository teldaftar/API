/**
 * Normalise an Uzbek phone number to canonical `998XXXXXXXXX` (12 digits).
 * Accepts inputs like `+998 90 123 45 67`, `90 123 45 67`, `0901234567`.
 * Returns null when the result can't be a valid 12-digit 998 number.
 */
export function normalizeUzPhone(raw: string): string | null {
  let digits = raw.replace(/\D/g, '');

  if (digits.startsWith('998')) {
    // already country-prefixed
  } else if (digits.length === 9) {
    digits = '998' + digits;
  } else if (digits.length === 10 && digits.startsWith('0')) {
    digits = '998' + digits.slice(1);
  } else {
    return null;
  }

  return digits.length === 12 && digits.startsWith('998') ? digits : null;
}
