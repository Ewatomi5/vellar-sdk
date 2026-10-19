import {
  Account,
  Address,
  Operation,
  rpc,
  scValToBigInt,
  scValToNative,
  TransactionBuilder,
  type xdr,
} from "@stellar/stellar-sdk";
import type { BalanceReader } from "../../src/balances";

// Issues #655 and #656 (read side): an RPC-backed BalanceReader that tells a
// contract which is not a SEP-41 token apart from an RPC outage, and that can
// read the token's on-chain decimals().

const SIMULATION_SOURCE = "GAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAWHF";

/**
 * Thrown when the contract address is reachable but does not implement the
 * SEP-41 token interface (e.g. a non-token contract passed in by mistake):
 * the simulation reports a missing method, or the method returns the wrong
 * type. This is deterministic for a given contract, so it is never retried.
 * An RPC/network outage is NOT wrapped in this error: it propagates as the
 * underlying transport error, and other simulation failures (e.g. a contract
 * trap) surface as a plain "Balance read failed" Error.
 */
export class InvalidTokenContractError extends Error {
  constructor(
    readonly contractId: string,
    readonly method: string,
    detail: string,
  ) {
    super(
      `Contract ${contractId} does not implement the SEP-41 token interface (${method}): ${detail}`,
    );
    this.name = "InvalidTokenContractError";
  }
}

const WRONG_INTERFACE_PATTERN =
  /non-existent contract function|Error\(WasmVm, (?:MissingValue|InvalidAction)\)|UnreachableCodeReached/i;

export interface StrictRpcBalanceReaderOptions {
  rpcUrl: string;
  networkPassphrase: string;
}

/** A BalanceReader that can also read the token's on-chain decimals. */
export interface StrictRpcBalanceReader extends BalanceReader {
  getTokenDecimals(tokenContractId: string): Promise<number>;
}

/**
 * Reads token balances and decimals over Soroban RPC.
 *
 * Errors from getTokenBalance / getTokenDecimals:
 * - InvalidTokenContractError: the contract is not a valid SEP-41 token
 *   (missing method or wrong return type). Not retried.
 * - Error("Balance read failed ..."): any other simulation failure.
 * - Transport errors from the RPC server are rethrown unchanged.
 */
export function createStrictRpcBalanceReader(
  options: StrictRpcBalanceReaderOptions,
): StrictRpcBalanceReader {
  const server = new rpc.Server(options.rpcUrl);

  async function simulateRead(
    tokenContractId: string,
    method: string,
    args: xdr.ScVal[],
  ): Promise<xdr.ScVal> {
    const tx = new TransactionBuilder(new Account(SIMULATION_SOURCE, "0"), {
      fee: "100",
      networkPassphrase: options.networkPassphrase,
    })
      .addOperation(
        Operation.invokeContractFunction({
          contract: tokenContractId,
          function: method,
          args,
        }),
      )
      .setTimeout(60)
      .build();

    const sim = await server.simulateTransaction(tx);
    if (!rpc.Api.isSimulationSuccess(sim)) {
      const detail = "error" in sim ? sim.error : "unknown simulation error";
      if (WRONG_INTERFACE_PATTERN.test(detail)) {
        throw new InvalidTokenContractError(tokenContractId, method, detail);
      }
      throw new Error(`Balance read failed for ${tokenContractId}: ${detail}`);
    }
    const retval = sim.result?.retval;
    if (!retval) {
      throw new Error(`Balance read for ${tokenContractId} returned no result`);
    }
    return retval;
  }

  return {
    async getTokenBalance(tokenContractId, holder) {
      const retval = await simulateRead(tokenContractId, "balance", [
        new Address(holder).toScVal(),
      ]);
      try {
        return scValToBigInt(retval);
      } catch {
        throw new InvalidTokenContractError(
          tokenContractId,
          "balance",
          "balance(id) did not return an integer",
        );
      }
    },
    async getTokenDecimals(tokenContractId) {
      const retval = await simulateRead(tokenContractId, "decimals", []);
      const decimals = scValToNative(retval);
      if (typeof decimals !== "number" || !Number.isInteger(decimals) || decimals < 0) {
        throw new InvalidTokenContractError(
          tokenContractId,
          "decimals",
          "decimals() did not return a u32",
        );
      }
      return decimals;
    },
  };
}
