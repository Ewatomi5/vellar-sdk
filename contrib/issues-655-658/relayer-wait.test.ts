import { describe, expect, it, vi } from "vitest";
import type { TxStatus, TxStatusReader } from "../../src/tx-status";
import { RelayerJobStuckError, waitForRelayerTransaction } from "./relayer-wait";

function stuckRelayer() {
  let time = 0;
  const reader: TxStatusReader = { getStatus: vi.fn().mockResolvedValue("pending") };
  const sleep = vi.fn().mockImplementation(async (ms: number) => {
    time += ms;
  });
  return { reader, sleep, now: () => time };
}

function readerReturning(statuses: TxStatus[]): TxStatusReader {
  const queue = [...statuses];
  return { getStatus: vi.fn().mockImplementation(async () => queue.shift() ?? "pending") };
}

describe("waitForRelayerTransaction with a stuck relayer job", () => {
  it("stops polling at the timeout instead of polling indefinitely", async () => {
    const { reader, sleep, now } = stuckRelayer();
    await expect(
      waitForRelayerTransaction(reader, "h", { timeoutMs: 1000, intervalMs: 100, sleep, now }),
    ).rejects.toBeInstanceOf(RelayerJobStuckError);
    expect(reader.getStatus).toHaveBeenCalledTimes(11);
  });

  it("uses a 60s deadline at 2s intervals by default", async () => {
    const { reader, sleep, now } = stuckRelayer();
    await expect(waitForRelayerTransaction(reader, "h", { sleep, now })).rejects.toBeInstanceOf(
      RelayerJobStuckError,
    );
    expect(reader.getStatus).toHaveBeenCalledTimes(31);
  });

  it("names the error and says the relayer never reported a final status, not an on-chain failure", async () => {
    const { reader, sleep, now } = stuckRelayer();
    const err = (await waitForRelayerTransaction(reader, "abc123", {
      timeoutMs: 100,
      intervalMs: 50,
      sleep,
      now,
    }).catch((e: unknown) => e)) as RelayerJobStuckError;
    expect(err.name).toBe("RelayerJobStuckError");
    expect(err.hash).toBe("abc123");
    expect(err.timeoutMs).toBe(100);
    expect(err.message).toMatch(/never reported a final status/);
    expect(err.message).toMatch(/not an on-chain failure/);
  });

  it("reports an on-chain failure as a resolved failed status, never as the stuck error", async () => {
    await expect(
      waitForRelayerTransaction(readerReturning(["pending", "failed"]), "h", {
        sleep: vi.fn().mockResolvedValue(undefined),
      }),
    ).resolves.toBe("failed");
  });

  it("resolves success when the relayer finishes in time", async () => {
    await expect(
      waitForRelayerTransaction(readerReturning(["pending", "success"]), "h", {
        sleep: vi.fn().mockResolvedValue(undefined),
      }),
    ).resolves.toBe("success");
  });
});
