/**
 * Money helpers for HR/payroll.
 *
 * New HR financial fields (salary, payroll, etc.) are stored as integer minor
 * units (e.g. 1 AFN = 100 minor units) to avoid floating-point rounding errors.
 * The legacy Employee.salary Float field is preserved for backward compatibility
 * but canonical amounts live in *_Minor integer fields.
 */
export const MINOR_PER_UNIT = 100;

/**
 * Round a major-unit AFN amount (Float fields: Expense.amount, machinery
 * rates, contractor financials) to 2 decimal places. All server-side money
 * math on Float fields must round through this helper so routes, services,
 * and PDFs agree on the same figures.
 */
export function round2(value: number): number {
  return Math.round(value * 100) / 100;
}

export function toMinor(amount: number | string): number {
  const n = typeof amount === "string" ? parseFloat(amount) : amount;
  if (!Number.isFinite(n)) return 0;
  return Math.round(n * MINOR_PER_UNIT);
}

export function fromMinor(minor: number | null | undefined): number {
  if (minor == null) return 0;
  return minor / MINOR_PER_UNIT;
}

export function formatMinor(
  minor: number | null | undefined,
  currency = "AFN"
): string {
  return formatMajor(fromMinor(minor), currency);
}

/**
 * Format a major-unit amount (Float fields such as `Wallet.balance` and
 * `WalletTransaction.amount`, where 1 AFN = 1 unit). Use this for any value
 * that is already in major units — passing one to `formatMinor` would divide
 * it by 100 and display it 100× too small.
 */
export function formatMajor(
  amount: number | null | undefined,
  currency = "AFN"
): string {
  const value = amount ?? 0;
  try {
    return new Intl.NumberFormat("en-US", {
      style: "currency",
      currency,
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    }).format(value);
  } catch {
    return `${value.toFixed(2)} ${currency}`;
  }
}
