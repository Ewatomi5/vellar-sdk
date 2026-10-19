import { describe, expect, it } from "vitest";
import { InvalidAmountError } from "../../src/payments";
import { parseTokenAmountStrict } from "./strict-parse-token-amount";

describe("parseTokenAmountStrict sub-stroop rounding mode (reject, never round)", () => {
  it.each([["0.00000015"], ["0.00000019"], ["0.00000011"], ["1.00000005"], ["0.99999999"]])(
    "rejects %s instead of truncating or rounding it",
    (input) => {
      expect(() => parseTokenAmountStrict(input, 7)).toThrow(InvalidAmountError);
      expect(() => parseTokenAmountStrict(input, 7)).toThrow(/at most 7 decimal places/);
    },
  );

  it("accepts the smallest representable amounts exactly", () => {
    expect(parseTokenAmountStrict("0.0000001", 7)).toBe(1n);
    expect(parseTokenAmountStrict("0.0000015", 7)).toBe(15n);
    expect(parseTokenAmountStrict("5", 7)).toBe(50000000n);
  });

  it("rejects number inputs rather than coercing them, so strings and numbers behave alike", () => {
    for (const n of [0.00000015, 1.5, 5, 1e-7, Number.NaN, Number.POSITIVE_INFINITY]) {
      expect(() => parseTokenAmountStrict(n as unknown as string, 7)).toThrow(InvalidAmountError);
    }
  });

  it("applies the same limit at other precisions", () => {
    expect(parseTokenAmountStrict("0.000001", 6)).toBe(1n);
    expect(() => parseTokenAmountStrict("0.0000015", 6)).toThrow(InvalidAmountError);
    expect(() => parseTokenAmountStrict("1.5", 0)).toThrow(InvalidAmountError);
  });
});
