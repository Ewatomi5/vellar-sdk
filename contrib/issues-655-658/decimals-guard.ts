import type { PaymentClient } from "../../src/payments-client";

// Issue #656 (payment side): compare caller-supplied token.decimals against
// the token contract's on-chain decimals() before a payment is prepared.

/**
 * Thrown when the caller-supplied token.decimals differs from the token
 * contract's on-chain decimals(). Proceeding would scale the amount by the
 * wrong power of ten, producing a payment off by orders of magnitude.
 */
export class TokenDecimalsMismatchError extends Error {
  constructor(
    readonly contractId: string,
    readonly suppliedDecimals: number,
    readonly onChainDecimals: number,
  ) {
    super(
      `Token ${contractId} reports ${onChainDecimals} decimals on-chain but the token descriptor says ${suppliedDecimals}; paying with the wrong decimals would send an amount off by orders of magnitude`,
    );
    this.name = "TokenDecimalsMismatchError";
  }
}

export interface TokenDecimalsReader {
  getTokenDecimals(tokenContractId: string): Promise<number>;
}

/**
 * Wraps a PaymentClient so preparePayment throws TokenDecimalsMismatchError,
 * before anything is built or signed, when the descriptor's decimals diverge
 * from the chain. If the on-chain value cannot be read, the check is skipped
 * and the payment proceeds unchanged.
 */
export function withDecimalsCheck(
  client: PaymentClient,
  decimalsReader: TokenDecimalsReader,
): PaymentClient {
  return {
    async preparePayment(input) {
      const onChain = await decimalsReader
        .getTokenDecimals(input.token.contractId)
        .catch(() => undefined);
      if (onChain !== undefined && onChain !== input.token.decimals) {
        throw new TokenDecimalsMismatchError(
          input.token.contractId,
          input.token.decimals,
          onChain,
        );
      }
      return client.preparePayment(input);
    },
  };
}
