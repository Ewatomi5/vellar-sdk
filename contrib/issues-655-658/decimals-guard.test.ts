import { describe, expect, it, vi } from "vitest";
import type { PaymentClient } from "../../src/payments-client";
import { TokenDecimalsMismatchError, withDecimalsCheck } from "./decimals-guard";

const xlm = { symbol: "XLM", contractId: "CNATIVE", decimals: 7 };
const input = { from: "CSMARTWALLET", to: "GRECIPIENT", token: xlm, amount: 5n };

function inner() {
  const prepared = { review: {}, confirm: vi.fn() };
  const preparePayment = vi.fn().mockResolvedValue(prepared);
  return { client: { preparePayment } as unknown as PaymentClient, preparePayment, prepared };
}

describe("withDecimalsCheck", () => {
  it("delegates when on-chain decimals match the token descriptor", async () => {
    const { client, preparePayment, prepared } = inner();
    const getTokenDecimals = vi.fn().mockResolvedValue(7);
    const guarded = withDecimalsCheck(client, { getTokenDecimals });
    await expect(guarded.preparePayment(input)).resolves.toBe(prepared);
    expect(getTokenDecimals).toHaveBeenCalledWith("CNATIVE");
    expect(preparePayment).toHaveBeenCalledWith(input);
  });

  it("throws TokenDecimalsMismatchError before preparing the payment when they diverge", async () => {
    const { client, preparePayment } = inner();
    const guarded = withDecimalsCheck(client, {
      getTokenDecimals: vi.fn().mockResolvedValue(6),
    });
    const err = await guarded.preparePayment(input).catch((e: unknown) => e);
    expect(err).toBeInstanceOf(TokenDecimalsMismatchError);
    expect((err as TokenDecimalsMismatchError).suppliedDecimals).toBe(7);
    expect((err as TokenDecimalsMismatchError).onChainDecimals).toBe(6);
    expect((err as Error).message).toMatch(/orders of magnitude/);
    expect(preparePayment).not.toHaveBeenCalled();
  });

  it("skips the check when the on-chain decimals cannot be read", async () => {
    const { client, preparePayment } = inner();
    const guarded = withDecimalsCheck(client, {
      getTokenDecimals: vi.fn().mockRejectedValue(new Error("rpc down")),
    });
    await expect(guarded.preparePayment(input)).resolves.toBeDefined();
    expect(preparePayment).toHaveBeenCalledTimes(1);
  });
});
