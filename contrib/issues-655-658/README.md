# Issues #655, #656, #657, #658

Reference implementations plus tests, kept inside `contrib/` as required for
contributor PRs. Each file imports the stable SDK from `../../src`.

| Issue | File | What it adds |
| ----- | ---- | ------------ |
| #655 | `strict-balances-rpc.ts` | `InvalidTokenContractError` for contracts that are not valid SEP-41 tokens. One simulation, never retried. RPC outages and other simulation failures stay distinct errors. |
| #656 | `strict-balances-rpc.ts`, `decimals-guard.ts` | `getTokenDecimals` read, and `withDecimalsCheck(client, reader)` which throws `TokenDecimalsMismatchError` before a payment is prepared. |
| #657 | `relayer-wait.ts` | `waitForRelayerTransaction` throws `RelayerJobStuckError` (not an on-chain failure) after the 60s default deadline. |
| #658 | `strict-parse-token-amount.ts` | `parseTokenAmountStrict`: documented reject-not-round mode, identical for string and number input. |

## Decimals mismatch warning (README pay example, #656)

`amount` is in raw base units and `decimals` is caller-supplied. If the
`decimals` in the token descriptor differs from the token contract's real
`decimals()`, any amount derived from it (for example with `parseTokenAmount`)
is off by orders of magnitude: 5 tokens becomes 0.05 or 500. Guard `pay()` with:

```ts
import { createStrictRpcBalanceReader } from "./strict-balances-rpc";
import { withDecimalsCheck } from "./decimals-guard";

const reader = createStrictRpcBalanceReader({ rpcUrl, networkPassphrase });
const guarded = withDecimalsCheck(paymentClient, reader);
await guarded.preparePayment({ from, to, token, amount });
```

If the on-chain value cannot be read, the check is skipped.

## Rounding mode (#658)

`parseTokenAmount` and `parseTokenAmountStrict` never round. Input with more
fractional digits than `decimals` throws `InvalidAmountError`, so `0.00000015`
XLM is rejected, not turned into 1 or 2 stroops. Numbers are rejected; pass a
decimal string.

## Integration into core

Maintainers can promote these into the stable surface by folding the error
classes and checks into `src/balances-rpc.ts`, `src/payments-client.ts`,
`src/tx-status.ts` and `src/payments.ts`.
