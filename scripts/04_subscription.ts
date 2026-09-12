/**
 * B2 — Subscription deposits: InvestorA (50 XRP) + InvestorB (30 XRP).
 *
 * Reads VAULT_ID + VAULT_SUB_DATE from .env (written by 02_create_vault.ts).
 * Warns if the subscription window has already closed.
 * Includes an over-subscription probe at the end to capture protocol behaviour.
 */
import * as dotenv from 'dotenv';
import { withClient } from '../config/client';
import { loadAccounts } from '../config/accounts';
import {
  xrplTimeNow,
  rippleTimeToISO,
  assertSuccess,
  fetchVaultInfo,
  fetchShareBalance,
} from '../config/xrpl-utils';

dotenv.config();

function requireEnv(key: string): string {
  const v = process.env[key];
  if (!v) throw new Error(`Missing ${key} in .env — run 02_create_vault.ts first`);
  return v;
}

const DEPOSIT_A_DROPS = '50000000'; // 50 XRP
const DEPOSIT_B_DROPS = '30000000'; // 30 XRP
const OVERSUB_DROPS   = '500000000'; // 500 XRP over-sub probe

async function main(): Promise<void> {
  console.log('=== B2: Subscription Deposits ===\n');

  const vaultId  = requireEnv('VAULT_ID');
  const subDate  = Number(requireEnv('VAULT_SUB_DATE'));
  const { investorA, investorB } = loadAccounts();

  console.log(`VaultID  : ${vaultId}`);
  console.log(`InvestorA: ${investorA.classicAddress}`);
  console.log(`InvestorB: ${investorB.classicAddress}`);
  console.log(`Sub ends : ${rippleTimeToISO(subDate)}\n`);

  // Warn if subscription window may have closed
  const now = xrplTimeNow();
  if (now > subDate) {
    console.warn('⚠️  WARNING: Subscription window appears closed on wall-clock. Submit anyway — the ledger is authoritative.');
  }

  await withClient(async (client) => {

    // ── InvestorA deposit ─────────────────────────────────────────────────
    console.log(`Depositing ${Number(DEPOSIT_A_DROPS) / 1e6} XRP from InvestorA...`);
    const depATx = {
      TransactionType: 'VaultDeposit',
      Account: investorA.classicAddress,
      VaultID: vaultId,
      Amount: DEPOSIT_A_DROPS,
    };
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const depAPrep   = await client.autofill(depATx as any);
    const depASigned = investorA.sign(depAPrep);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const depAResult = await (client as any).submitAndWait(depASigned.tx_blob);
    assertSuccess(depAResult, 'VaultDeposit (InvestorA)');

    console.log(`  ✓ InvestorA deposit OK — hash: ${depAResult.result.hash}`);
    console.log(`    Explorer: https://devnet.xrpl.org/transactions/${depAResult.result.hash}`);

    // Read vault + InvestorA shares after deposit
    const vaultAfterA = await fetchVaultInfo(client, vaultId);
    const sharesA = await fetchShareBalance(client, investorA.classicAddress, vaultAfterA.ShareMPTID as string);
    console.log(`  AssetsTotal after A  : ${Number(vaultAfterA.AssetsTotal ?? '0') / 1e6} XRP`);
    console.log(`  InvestorA shares     : ${sharesA} (${Number(sharesA) / 1e6} XRP equiv)\n`);

    // ── InvestorB deposit ─────────────────────────────────────────────────
    console.log(`Depositing ${Number(DEPOSIT_B_DROPS) / 1e6} XRP from InvestorB...`);
    const depBTx = {
      TransactionType: 'VaultDeposit',
      Account: investorB.classicAddress,
      VaultID: vaultId,
      Amount: DEPOSIT_B_DROPS,
    };
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const depBPrep   = await client.autofill(depBTx as any);
    const depBSigned = investorB.sign(depBPrep);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const depBResult = await (client as any).submitAndWait(depBSigned.tx_blob);
    assertSuccess(depBResult, 'VaultDeposit (InvestorB)');

    console.log(`  ✓ InvestorB deposit OK — hash: ${depBResult.result.hash}`);
    console.log(`    Explorer: https://devnet.xrpl.org/transactions/${depBResult.result.hash}`);

    const vaultAfterB = await fetchVaultInfo(client, vaultId);
    const sharesB = await fetchShareBalance(client, investorB.classicAddress, vaultAfterB.ShareMPTID as string);
    console.log(`  AssetsTotal after B  : ${Number(vaultAfterB.AssetsTotal ?? '0') / 1e6} XRP`);
    console.log(`  InvestorB shares     : ${sharesB} (${Number(sharesB) / 1e6} XRP equiv)\n`);

    // ── Over-subscription probe ───────────────────────────────────────────
    console.log(`Over-subscription probe: attempting ${Number(OVERSUB_DROPS) / 1e6} XRP deposit from InvestorA...`);
    const oversubTx = {
      TransactionType: 'VaultDeposit',
      Account: investorA.classicAddress,
      VaultID: vaultId,
      Amount: OVERSUB_DROPS,
    };
    try {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const oversubPrep   = await client.autofill(oversubTx as any);
      const oversubSigned = investorA.sign(oversubPrep);
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const oversubResult = await (client as any).submitAndWait(oversubSigned.tx_blob);
      const meta = oversubResult.result.meta as Record<string, unknown> | undefined;
      const code = (meta?.TransactionResult as string) ?? 'unknown';
      if (code === 'tesSUCCESS') {
        console.log(`  ⚠️  Over-sub ACCEPTED (tesSUCCESS) — vault has no cap`);
        console.log(`      Hash: ${oversubResult.result.hash}`);
        // DevEx: vault accepted deposit beyond any visible cap — log for DX report
      } else {
        console.log(`  Over-sub REJECTED: ${code} (full response below)`);
        console.log('  ', JSON.stringify(meta, null, 2));
      }
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      console.log(`  Over-sub threw: ${msg}`);
    }
    console.log();

    // ── Summary ───────────────────────────────────────────────────────────
    const vaultFinal = await fetchVaultInfo(client, vaultId);
    console.log('Final vault state:');
    console.log(`  AssetsTotal    : ${Number(vaultFinal.AssetsTotal ?? '0') / 1e6} XRP`);
    console.log(`  AssetsAvailable: ${Number(vaultFinal.AssetsAvailable ?? '0') / 1e6} XRP`);
    console.log(`  ShareMPTID     : ${vaultFinal.ShareMPTID}`);
    console.log();

    console.log('✅ B2 COMPLETE — subscriptions done');
    console.log('   Next step: npx tsx scripts/05_investment.ts  (will wait for investment phase automatically)');
  });
}

main().catch((err: Error) => {
  console.error('\nB2 FAILED:', err.message);
  process.exit(1);
});
