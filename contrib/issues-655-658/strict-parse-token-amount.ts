import { InvalidAmountError, parseTokenAmount } from "../../src/payments";

// Issue #658: explicit rounding mode for converting a human amount into base
// units, applied identically for string and number input.

/**
 * Parses a user-entered decimal amount into raw token units.
 *
 * Rounding mode: none. Sub-unit precision is REJECTED, never truncated or
 * rounded: with 7 decimals, "0.00000015" throws InvalidAmountError instead of
 * becoming 1 or 2 stroops, so a payment never differs from what was entered.
 *
 * Input must be a decimal string. Numbers are rejected with InvalidAmountError
 * rather than coerced, because binary floats cannot represent most decimal
 * amounts exactly (and String(1e-7) is "1e-7"), so a number could not honour
 * the same rule as a string.
 */
export function parseTokenAmountStrict(input: string, decimals: number): bigint {
  if (typeof input !== "string") {
    throw new InvalidAmountError(`Amount must be a decimal string, got ${typeof input}`);
  }
  return parseTokenAmount(input, decimals);
}
