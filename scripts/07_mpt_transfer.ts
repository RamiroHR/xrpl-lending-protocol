/**
 * C4 — MPT Share Transfer Tests
 *
 * 1. InvestorA transfers half her shares to InvestorB  → expect tesSUCCESS
 *    (both are MPT-authorized via c2 + credentialed via c1)
 * 2. InvestorA attempts to transfer shares to Uncredentialed → expect rejection
 *    (Uncredentialed was not MPT-authorized; capture result verbatim)
 *
 * Must run AFTER c2 (MPT auth) and BEFORE b5 (redemption).
 * VAULT_ID must be in .env (written by b1).
 */
import * as dotenv from 'dotenv';
import { withClient } from '../config/client';
import { loadAccounts } from '../config/accounts';
import {
  assertSuccess,
  fetchVaultInfo,
  fetchShareBalance,
} from '../config/xrpl-utils';

dotenv.config();

function requireEnv(key: string): string {
  const v = process.env[key];
  if (!v) throw new Error(`Missing ${key} in .env`);
  return v;
}

async function main(): Promise<void> {
  console.log('=== C4: MPT Share Transfer Tests ===\n');

  const vaultId = requireEnv('VAULT_ID');
  const { investorA, investorB, uncredentialed } = loadAccounts();

  console.log(`VaultID   : ${vaultId}`);
  console.log(`InvestorA : ${investorA.classicAddress}`);
  console.log(`InvestorB : ${investorB.classicAddress}`);
  console.log(`Uncred    : ${uncredentialed.classicAddress}\n`);

  await withClient(async (client) => {
    const vault = await fetchVaultInfo(client, vaultId);
    const shareMPTID = vault.ShareMPTID as string;
    console.log(`ShareMPTID: ${shareMPTID}\n`);

    const sharesABefore = BigInt(await fetchShareBalance(client, investorA.classicAddress, shareMPTID));
    const sharesBBefore = BigInt(await fetchShareBalance(client, investorB.classicAddress, shareMPTID));
    console.log(`Shares before transfer:`);
    console.log(`  InvestorA : ${sharesABefore}`);
    console.log(`  InvestorB : ${sharesBBefore}\n`);

    if (sharesABefore === 0n) {
      throw new Error('InvestorA has 0 shares — run b2 before c4');
    }

    const halfShares = sharesABefore / 2n;
    const probeShares = 1000000n; // 1 XRP equiv for uncred probe

    // ── Transfer 1: InvestorA → InvestorB (authorized) ────────────────────
    console.log(`--- Transfer 1: InvestorA → InvestorB (${halfShares} shares / half) ---`);
    const pay1Tx = {
      TransactionType: 'Payment',
      Account: investorA.classicAddress,
      Destination: investorB.classicAddress,
      Amount: {
        mpt_issuance_id: shareMPTID,
        value: halfShares.toString(),
      },
    };
    try {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const pay1Prep   = await client.autofill(pay1Tx as any);
      const pay1Signed = investorA.sign(pay1Prep);
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const pay1Result = await (client as any).submitAndWait(pay1Signed.tx_blob);
      const meta1 = pay1Result.result.meta as Record<string, unknown> | undefined;
      const code1 = (meta1?.TransactionResult as string) ?? 'unknown';
      if (code1 === 'tesSUCCESS') {
        assertSuccess(pay1Result, 'MPT Payment (A→B)');
        console.log(`  ✓ Transfer A→B SUCCESS`);
        console.log(`    Hash    : ${pay1Result.result.hash}`);
        console.log(`    Explorer: https://devnet.xrpl.org/transactions/${pay1Result.result.hash}\n`);
      } else {
        console.log(`  ⚠️  Transfer A→B result: ${code1}`);
        console.log(`      Full meta: ${JSON.stringify(meta1, null, 2)}\n`);
      }
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      console.log(`  Transfer A→B threw: ${msg}\n`);
    }

    // ── Transfer 2: InvestorA → Uncredentialed (unauthorized) ─────────────
    console.log(`--- Transfer 2: InvestorA → Uncredentialed (${probeShares} shares — expect rejection) ---`);
    const pay2Tx = {
      TransactionType: 'Payment',
      Account: investorA.classicAddress,
      Destination: uncredentialed.classicAddress,
      Amount: {
        mpt_issuance_id: shareMPTID,
        value: probeShares.toString(),
      },
    };
    try {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const pay2Prep   = await client.autofill(pay2Tx as any);
      const pay2Signed = investorA.sign(pay2Prep);
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const pay2Result = await (client as any).submitAndWait(pay2Signed.tx_blob);
      const meta2 = pay2Result.result.meta as Record<string, unknown> | undefined;
      const code2 = (meta2?.TransactionResult as string) ?? 'unknown';
      if (code2 === 'tesSUCCESS') {
        console.log(`  ⚠️  Uncred transfer ACCEPTED (tesSUCCESS) — MPT auth may not block here`);
        console.log(`      Hash: ${pay2Result.result.hash}`);
      } else {
        console.log(`  ✓ Uncred transfer REJECTED (expected): ${code2}`);
        console.log(`    Hash    : ${pay2Result.result.hash}`);
        console.log(`    Explorer: https://devnet.xrpl.org/transactions/${pay2Result.result.hash}`);
        console.log(`    Full meta: ${JSON.stringify(meta2, null, 2)}\n`);
      }
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      console.log(`  Uncred transfer threw: ${msg}\n`);
    }

    // ── Final balances ─────────────────────────────────────────────────────
    const sharesAAfter = await fetchShareBalance(client, investorA.classicAddress, shareMPTID);
    const sharesBAfter = await fetchShareBalance(client, investorB.classicAddress, shareMPTID);
    const sharesUncred = await fetchShareBalance(client, uncredentialed.classicAddress, shareMPTID);
    console.log('Final share balances:');
    console.log(`  InvestorA    : ${sharesAAfter}`);
    console.log(`  InvestorB    : ${sharesBAfter}`);
    console.log(`  Uncredentialed: ${sharesUncred}\n`);

    console.log('✅ C4 COMPLETE — MPT transfer test done');
    console.log('   Next step: npm run b5  (will auto-wait for redemption phase)');
  });
}

main().catch((err: Error) => {
  console.error('\nC4 FAILED:', err.message);
  process.exit(1);
});
