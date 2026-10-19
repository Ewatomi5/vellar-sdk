import {
  TransactionTimeoutError,
  waitForTransaction,
  type TxStatusReader,
  type WaitOptions,
} from "../../src/tx-status";

// Issue #657: a relayer that accepts a submission but whose status endpoint
// never leaves "pending" must surface as a named error that cannot be mistaken
// for a transaction that failed on-chain.

// Mirrors the waitForTransaction default.
const DEFAULT_TIMEOUT_MS = 60_000;

/**
 * Thrown when the relayer accepted the transaction but never reported a final
 * status within the polling deadline (a stuck relayer-side job, or a
 * persistent status outage). This is NOT an on-chain failure: a transaction
 * that failed on-chain resolves waitForRelayerTransaction with "failed". Look
 * the hash up on the network before resubmitting, since it may still land.
 */
export class RelayerJobStuckError extends Error {
  constructor(
    readonly hash: string,
    readonly timeoutMs: number,
  ) {
    super(
      `Relayer accepted transaction ${hash} but never reported a final status within ${timeoutMs}ms (not an on-chain failure)`,
    );
    this.name = "RelayerJobStuckError";
  }
}

/**
 * Polls like waitForTransaction. Defaults: 60s deadline (timeoutMs) polled
 * every 2s (intervalMs), so a status that stays "pending" is read at most 31
 * times. On timeout it throws RelayerJobStuckError; an on-chain failure
 * resolves "failed" instead of throwing.
 */
export async function waitForRelayerTransaction(
  reader: TxStatusReader,
  hash: string,
  options: WaitOptions = {},
): Promise<"success" | "failed"> {
  try {
    return await waitForTransaction(reader, hash, options);
  } catch (err) {
    if (err instanceof TransactionTimeoutError) {
      throw new RelayerJobStuckError(hash, options.timeoutMs ?? DEFAULT_TIMEOUT_MS);
    }
    throw err;
  }
}
