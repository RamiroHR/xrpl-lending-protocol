/**
 * Shared XRPL utilities for Phase B scripts.
 * Centralises: ripple-epoch helpers, phase-gate polling, env upsert,
 * tx-metadata helpers, and assertSuccess.
 */
import * as fs from 'fs';
import * as path from 'path';
import { Client } from 'xrpl';

const RIPPLE_EPOCH = 946684800;

export function toRippleTime(unixSec: number): number {
  return Math.floor(unixSec) - RIPPLE_EPOCH;
}

export function fromRippleTime(rippleTime: number): number {
  return rippleTime + RIPPLE_EPOCH;
}

export function xrplTimeNow(): number {
  return toRippleTime(Date.now() / 1000);
}

export function rippleTimeToISO(rippleTime: number): string {
  return new Date(fromRippleTime(rippleTime) * 1000).toISOString();
}

export function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export function extractCreatedLedgerId(
  result: { result: { meta?: unknown } },
  entryType: string,
): string | null {
  const meta = result.result.meta as Record<string, unknown> | undefined;
  const nodes = (meta?.AffectedNodes as Array<Record<string, unknown>>) ?? [];
  for (const node of nodes) {
    const created = node.CreatedNode as Record<string, unknown> | undefined;
    if (created?.LedgerEntryType === entryType) return created.LedgerIndex as string;
  }
  return null;
}

export function assertSuccess(
  result: { result: { meta?: unknown; hash?: string } },
  label: string,
): void {
  const meta = result.result.meta as Record<string, unknown> | undefined;
  const code = (meta?.TransactionResult as string) ?? '';
  if (code && code !== 'tesSUCCESS') {
    throw new Error(`${label} failed: ${code} (hash: ${result.result.hash ?? ''})`);
  }
}

/**
 * Polls server_info every 5s until the validated ledger close_time passes
 * targetRippleTime. Prints a countdown so the user knows the script is alive.
 * No-op if the boundary has already passed.
 */
/** Extract ledger close_time from a server_info response in Ripple epoch seconds.
 *  Falls back to closed_ledger (returned when validated_ledger is unavailable),
 *  then to wall-clock time so the poller never stalls on a missing field. */
function ledgerCloseTime(info: Record<string, unknown>): number {
  const vl = info?.validated_ledger as Record<string, unknown> | undefined;
  const cl = info?.closed_ledger as Record<string, unknown> | undefined;
  const fromLedger = (vl?.close_time ?? cl?.close_time) as number | undefined;
  return fromLedger ?? xrplTimeNow();
}

export async function waitForPhase(
  client: Client,
  targetRippleTime: number,
  label: string,
): Promise<void> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const si0 = await (client as any).request({ command: 'server_info' });
  const now: number = ledgerCloseTime(si0.result.info ?? {});
  if (now > targetRippleTime) {
    console.log(`${label} already open (ledger ${now} > target ${targetRippleTime})`);
    return;
  }
  const remaining = targetRippleTime - now;
  const targetISO = rippleTimeToISO(targetRippleTime);
  console.log(`\nWaiting for ${label}  (target: ${targetISO},  ~${remaining}s on ledger clock)`);
  while (true) {
    await sleep(5000);
    try {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const si = await (client as any).request({ command: 'server_info' });
      const ledgerTime: number = ledgerCloseTime(si.result.info ?? {});
      const rem = targetRippleTime - ledgerTime;
      if (rem <= 0) {
        process.stdout.write('\n');
        console.log(`  ${label} OPEN — proceeding\n`);
        return;
      }
      process.stdout.write(`  ${rem}s remaining...\r`);
    } catch { /* ignore transient polling errors */ }
  }
}

/**
 * Read-modify-write a single key=value line in .env.
 * Replaces an existing key rather than appending, so re-runs stay clean.
 */
export function upsertEnvVar(key: string, value: string): void {
  const envPath = path.join(process.cwd(), '.env');
  let content = '';
  try { content = fs.readFileSync(envPath, 'utf8'); } catch { /* file may not exist */ }
  const lines = content
    .split(/\r?\n/)
    .filter((l) => !l.startsWith(`${key}=`));
  lines.push(`${key}=${value}`);
  // trim trailing blank lines to keep .env tidy
  while (lines.length > 0 && lines[lines.length - 1].trim() === '') lines.pop();
  fs.writeFileSync(envPath, lines.join('\n') + '\n');
  console.log(`  .env ← ${key}=${value}`);
}

/** Fetch the Vault ledger entry via vault_info RPC. */
export async function fetchVaultInfo(
  client: Client,
  vaultId: string,
): Promise<Record<string, unknown>> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const res = await (client as any).request({ command: 'vault_info', vault_id: vaultId });
  const vault =
    (res.result?.vault as Record<string, unknown>) ??
    (res.result?.vault_data as Record<string, unknown>);
  if (!vault) throw new Error(`vault_info returned unexpected shape: ${JSON.stringify(Object.keys(res.result ?? {}))}`);
  return vault;
}

/** Compute PPS given vault AssetsTotal (drops) and MPTIssuance OutstandingAmount (shares). */
export function computePPS(assetsTotal: string, totalShares: string): number {
  const a = Number(assetsTotal);
  const s = Number(totalShares);
  return s > 0 ? a / s : 0;
}

/** Read total outstanding shares for a vault's ShareMPTID from the ledger.
 *  Uses the mpt_issuance sub-object (not index) because ShareMPTID is a
 *  48-char MPTokenIssuanceID, not a 64-char ledger entry index. */
export async function fetchTotalShares(client: Client, shareMPTID: string): Promise<string> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const res = await (client as any).request({
    command: 'ledger_entry',
    mpt_issuance: shareMPTID,
    ledger_index: 'validated',
  });
  return String((res.result?.node as Record<string, unknown>)?.OutstandingAmount ?? '0');
}

/** Read an investor's MPT share balance for a specific MPTIssuance. */
export async function fetchShareBalance(
  client: Client,
  accountAddress: string,
  shareMPTID: string,
): Promise<string> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const res = await (client as any).request({
    command: 'account_objects',
    account: accountAddress,
    type: 'mptoken',
    ledger_index: 'validated',
  });
  const tokens = (res.result?.account_objects as Array<Record<string, unknown>>) ?? [];
  const token = tokens.find((t) => t.MPTokenIssuanceID === shareMPTID);
  return String(token?.MPTAmount ?? '0');
}
