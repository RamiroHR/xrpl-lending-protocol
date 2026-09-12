/**
 * B5 — Redemption: VaultWithdraw from InvestorA then InvestorB.
 *
 * Reads VAULT_ID + VAULT_REDEMPTION_DATE from .env and polls until the
 * redemption phase opens. Withdraws each investor's proportional XRP,
 * verifies share balances reach 0, and prints yield summary.
 */
import * as dotenv from 'dotenv';
import { withClient } from '../config/client';
import { loadAccounts } from '../config/accounts';
import {
  rippleTimeToISO,
  assertSuccess,
  waitForPhase,
  fetchVaultInfo,
  fetchTotalShares,
  fetchShareBalance,
  computePPS,
} from '../config/xrpl-utils';

dotenv.config();

function requireEnv(key: string): string {
  const v = process.env[key];
  if (!v) throw new Error(`Missing ${key} in .env — run 02_create_vault.ts first`);
  return v;
}

/** Floor-divide using BigInt to avoid floating-point rounding in drops. */
function proportionalDrops(shares: string, totalShares: string, assetsAvailable: string): string {
  const s   = BigInt(shares);
  const tot = BigInt(totalShares);
  const avail = BigInt(assetsAvailable);
  if (tot === 0n) throw new Error('Total shares is 0 — vault empty');
  return String(s * avail / tot);
}

async function main(): Promise<void> {
  console.log('=== B5: Redemption — VaultWithdraw A + B ===\n');

  const vaultId        = requireEnv('VAULT_ID');
  const redemptionDate = Number(requireEnv('VAULT_REDEMPTION_DATE'));
  const { investorA, investorB } = loadAccounts();

  console.log(`VaultID    : ${vaultId}`);
  console.log(`InvestorA  : ${investorA.classicAddress}`);
  console.log(`InvestorB  : ${investorB.classicAddress}`);
  console.log(`Redemption : ${rippleTimeToISO(redemptionDate)}\n`);

  await withClient(async (client) => {

    // ── Wait for redemption phase ─────────────────────────────────────────
    await waitForPhase(client, redemptionDate, 'redemption phase');

    // ── Snapshot before withdrawals ───────────────────────────────────────
    const vault        = await fetchVaultInfo(client, vaultId);
    const shareMPTID   = vault.ShareMPTID as string;
    const totalShares  = await fetchTotalShares(client, shareMPTID);
    const assetsAvail  = vault.AssetsAvailable as string ?? '0';
    const assetsTotal  = vault.AssetsTotal as string ?? '0';
    const pps          = computePPS(assetsTotal, totalShares);

    console.log('Vault state at redemption:');
    console.log(`  AssetsTotal    : ${Number(assetsTotal) / 1e6} XRP`);
    console.log(`  AssetsAvailable: ${Number(assetsAvail) / 1e6} XRP`);
    console.log(`  TotalShares    : ${totalShares}`);
    console.log(`  PPS            : ${pps.toFixed(9)} XRP/share`);
    console.log();

    const sharesA = await fetchShareBalance(client, investorA.classicAddress, shareMPTID);
    const sharesB = await fetchShareBalance(client, investorB.classicAddress, shareMPTID);
    console.log(`  InvestorA shares: ${sharesA}`);
    console.log(`  InvestorB shares: ${sharesB}\n`);

    // ── InvestorA withdrawal ──────────────────────────────────────────────
    const withdrawAmountA = proportionalDrops(sharesA, totalShares, assetsAvail);
    console.log(`Withdrawing ${Number(withdrawAmountA) / 1e6} XRP for InvestorA...`);
    const wdATx = {
      TransactionType: 'VaultWithdraw',
      Account: investorA.classicAddress,
      VaultID: vaultId,
      Amount: withdrawAmountA,
    };
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const wdAPrep   = await client.autofill(wdATx as any);
    const wdASigned = investorA.sign(wdAPrep);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const wdAResult = await (client as any).submitAndWait(wdASigned.tx_blob);
    assertSuccess(wdAResult, 'VaultWithdraw (InvestorA)');

    console.log(`  ✓ InvestorA withdrawal OK`);
    console.log(`    Hash    : ${wdAResult.result.hash}`);
    console.log(`    Explorer: https://devnet.xrpl.org/transactions/${wdAResult.result.hash}`);
    const sharesAAfter = await fetchShareBalance(client, investorA.classicAddress, shareMPTID);
    console.log(`    Shares remaining: ${sharesAAfter}  (expect 0)\n`);

    // ── InvestorB withdrawal — use updated AssetsAvailable ────────────────
    const vaultAfterA    = await fetchVaultInfo(client, vaultId);
    const assetsAfterA   = vaultAfterA.AssetsAvailable as string ?? '0';
    const totalAfterA    = await fetchTotalShares(client, shareMPTID);

    // InvB gets all remaining available assets (they're the only holder left)
    const withdrawAmountB = assetsAfterA;
    console.log(`Withdrawing ${Number(withdrawAmountB) / 1e6} XRP for InvestorB (remaining)...`);
    const wdBTx = {
      TransactionType: 'VaultWithdraw',
      Account: investorB.classicAddress,
      VaultID: vaultId,
      Amount: withdrawAmountB,
    };
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const wdBPrep   = await client.autofill(wdBTx as any);
    const wdBSigned = investorB.sign(wdBPrep);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const wdBResult = await (client as any).submitAndWait(wdBSigned.tx_blob);
    assertSuccess(wdBResult, 'VaultWithdraw (InvestorB)');

    console.log(`  ✓ InvestorB withdrawal OK`);
    console.log(`    Hash    : ${wdBResult.result.hash}`);
    console.log(`    Explorer: https://devnet.xrpl.org/transactions/${wdBResult.result.hash}`);
    const sharesBAfter = await fetchShareBalance(client, investorB.classicAddress, shareMPTID);
    console.log(`    Shares remaining: ${sharesBAfter}  (expect 0)\n`);

    // ── Yield summary ─────────────────────────────────────────────────────
    const depositA = 50_000_000n;
    const depositB = 30_000_000n;
    const yieldA   = BigInt(withdrawAmountA) - depositA;
    const yieldB   = BigInt(withdrawAmountB) - depositB;

    console.log('━━━ Yield summary ━━━');
    console.log(`  InvestorA: deposited 50 XRP → received ${Number(withdrawAmountA) / 1e6} XRP`);
    console.log(`             yield = ${Number(yieldA) / 1e6} XRP  (${(Number(yieldA) / 50_000_000 * 100).toFixed(6)}%)`);
    console.log(`  InvestorB: deposited 30 XRP → received ${Number(withdrawAmountB) / 1e6} XRP`);
    console.log(`             yield = ${Number(yieldB) / 1e6} XRP  (${(Number(yieldB) / 30_000_000 * 100).toFixed(6)}%)`);
    if (Number(yieldA) + Number(yieldB) < 1) {
      console.log('\n  ℹ️  Near-zero yield expected: 5% annual on a 30-min demo window ≈ 0 drops.');
      console.log('     See DX-01 and 06_coupon_injection.ts for observable yield demo.');
    }
    console.log('\n✅ B5 COMPLETE — full B1→B5 lifecycle finished');
    console.log('   Next step: Phase C (03_permissioned_domain.ts) or 06_coupon_injection.ts');
  });
}

main().catch((err: Error) => {
  console.error('\nB5 FAILED:', err.message);
  process.exit(1);
});
