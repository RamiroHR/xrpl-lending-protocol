/**
 * D1 — Coupon Injection Probe: probes whether tfVaultDonation (Flags: 0x00010000)
 * is supported on devnet rippled 3.4.0-rc5 (XLS-65 V1.1).
 *
 * tfVaultDonation is NOT exported from xrpl.js, NOT in ripple-binary-codec
 * definitions, and NOT referenced in published XRPL docs (rippled 3.3.x).
 * This script probes the candidate flag bit and captures the result either way.
 */
import * as dotenv from 'dotenv';
import { withClient } from '../config/client';
import { loadAccounts } from '../config/accounts';
import {
  fetchVaultInfo,
  fetchTotalShares,
  computePPS,
} from '../config/xrpl-utils';

dotenv.config();

function requireEnv(key: string): string {
  const v = process.env[key];
  if (!v) throw new Error(`Missing ${key} in .env`);
  return v;
}

async function main(): Promise<void> {
  console.log('=== D1: Coupon Injection Probe ===\n');

  const vaultId = requireEnv('VAULT_ID');
  const { broker } = loadAccounts();

  await withClient(async (client) => {

    // ── Fetch vault state before probe ───────────────────────────────────
    const vaultBefore = await fetchVaultInfo(client, vaultId);
    const assetsBefore = vaultBefore.AssetsTotal as string;
    const shareMPTID   = vaultBefore.ShareMPTID as string;
    const totalSharesBefore = await fetchTotalShares(client, shareMPTID);
    const ppsBefore = computePPS(assetsBefore, totalSharesBefore);

    console.log(`VAULT_ID   : ${vaultId}`);
    console.log(`AssetsTotal: ${assetsBefore} drops  (${Number(assetsBefore) / 1e6} XRP)`);
    console.log(`TotalShares: ${totalSharesBefore}`);
    console.log(`PPS before : ${ppsBefore}`);
    console.log();

    // ── DevEx notice ─────────────────────────────────────────────────────
    console.log('[DX-13 PROBE] tfVaultDonation not in xrpl.js SDK, ripple-binary-codec, or published docs.');
    console.log('Official XRPL docs (rippled 3.3.x): VaultDeposit has no flags.');
    console.log('Probing Flags: 0x00010000 on devnet rippled 3.4.0-rc5 (XLS-65 V1.1)...');
    console.log();

    // ── Build and submit VaultDeposit with candidate tfVaultDonation flag ─
    const tx = {
      TransactionType: 'VaultDeposit',
      Account: broker.classicAddress,
      VaultID: vaultId,
      Amount: '1000000',    // 1 XRP in drops
      Flags: 0x00010000,    // candidate tfVaultDonation — DX-13 probe
    };

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const prepared = await (client as any).autofill(tx);
    const signed   = broker.sign(prepared);

    let txResult = 'UNKNOWN';
    let hash     = '';

    try {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const result = await (client as any).submitAndWait(signed.tx_blob);
      const meta = result.result.meta as Record<string, unknown> | undefined;
      txResult = (meta?.TransactionResult as string) ?? 'UNKNOWN';
      hash     = result.result.hash ?? '';
    } catch (err: unknown) {
      // tem* errors are rejected pre-ledger — submitAndWait throws instead of returning
      const msg = err instanceof Error ? err.message : String(err);
      const codeMatch = msg.match(/\b(tem\w+|tec\w+|tef\w+|tel\w+|ter\w+)\b/);
      txResult = codeMatch ? codeMatch[1] : `ERROR: ${msg.slice(0, 80)}`;
      hash     = '';
    }

    if (txResult === 'tesSUCCESS') {
      // Probe succeeded — fetch updated vault state and compute PPS delta
      const vaultAfter  = await fetchVaultInfo(client, vaultId);
      const assetsAfter = vaultAfter.AssetsTotal as string;
      const totalSharesAfter = await fetchTotalShares(client, shareMPTID);
      const ppsAfter    = computePPS(assetsAfter, totalSharesAfter);
      const ppsDelta    = (ppsAfter - ppsBefore).toFixed(8);
      const sharesUnchanged = totalSharesAfter === totalSharesBefore
        ? '✓ no new shares minted (donation confirmed)'
        : `✗ shares changed: ${totalSharesBefore} → ${totalSharesAfter}`;

      console.log('✅ tfVaultDonation WORKS on this devnet build.');
      console.log(`   Hash       : ${hash}`);
      console.log(`   Explorer   : https://devnet.xrpl.org/transactions/${hash}`);
      console.log(`   AssetsTotal: ${assetsBefore} drops → ${assetsAfter} drops  (Δ +1,000,000)`);
      console.log(`   PPS        : ${ppsBefore} → ${ppsAfter}  (Δ +${ppsDelta})`);
      console.log(`   Shares minted (delta should be 0): ${sharesUnchanged}`);
    } else {
      // Probe failed — expected outcome given missing doc/SDK coverage
      console.log(`❌ tfVaultDonation probe FAILED: ${txResult}`);
      if (hash) {
        console.log(`   Hash    : ${hash}`);
        console.log(`   Explorer: https://devnet.xrpl.org/transactions/${hash}`);
      } else {
        console.log(`   Hash    : (rejected pre-ledger — no on-chain hash)`);
      }
      console.log('[DX-13] tfVaultDonation (Flags: 0x00010000) rejected by this devnet build.');
      console.log('Flag is absent from published docs, xrpl.js SDK, and ripple-binary-codec.');
      // Do NOT exit(1) — probe failure is an expected and valid outcome
    }

    console.log('\n=== D1 complete ===');
  });
}

main().catch((err: Error) => {
  console.error('\nFAILED:', err.message);
  process.exit(1);
});
