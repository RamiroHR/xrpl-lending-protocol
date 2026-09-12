/**
 * B4 — Borrower repayment.
 *
 * Reads LOAN_ID, LOAN_NEXT_PAYMENT_DUE, LOAN_PERIODIC_PAYMENT from .env
 * (written by 05_investment.ts) and polls until the payment is due before
 * submitting. Logs vault AssetsTotal and PPS before/after as cash-basis proof.
 *
 * Cash-basis note (XLS-66 V1.1): PPS does NOT change when the loan is
 * originated — only when the repayment cash arrives. This is by design but
 * counterintuitive for developers expecting full-accrual accounting.
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
  computePPS,
} from '../config/xrpl-utils';

dotenv.config();

function requireEnv(key: string): string {
  const v = process.env[key];
  if (!v) throw new Error(`Missing ${key} in .env — run 05_investment.ts first`);
  return v;
}

async function main(): Promise<void> {
  console.log('=== B4: Borrower Repayment ===\n');

  const vaultId       = requireEnv('VAULT_ID');
  const loanId        = requireEnv('LOAN_ID');
  const nextDue       = Number(requireEnv('LOAN_NEXT_PAYMENT_DUE'));
  const periodicPayment = requireEnv('LOAN_PERIODIC_PAYMENT');
  const { borrower }  = loadAccounts();

  console.log(`VaultID         : ${vaultId}`);
  console.log(`LoanID          : ${loanId}`);
  console.log(`Borrower        : ${borrower.classicAddress}`);
  console.log(`NextPaymentDue  : ${rippleTimeToISO(nextDue)}`);
  console.log(`PeriodicPayment : ${periodicPayment} drops (${Number(periodicPayment) / 1e6} XRP)\n`);

  await withClient(async (client) => {

    // ── Wait for payment due ──────────────────────────────────────────────
    await waitForPhase(client, nextDue, 'payment due date');

    // ── PPS snapshot BEFORE repayment ─────────────────────────────────────
    const vaultBefore = await fetchVaultInfo(client, vaultId);
    const sharesBefore = await fetchTotalShares(client, vaultBefore.ShareMPTID as string);
    const ppsBefore = computePPS(
      vaultBefore.AssetsTotal as string ?? '0',
      sharesBefore
    );
    console.log('Vault state BEFORE repayment:');
    console.log(`  AssetsTotal : ${Number(vaultBefore.AssetsTotal ?? '0') / 1e6} XRP`);
    console.log(`  TotalShares : ${sharesBefore}`);
    console.log(`  PPS         : ${ppsBefore.toFixed(9)} XRP/share\n`);

    // ── Submit LoanPay ─────────────────────────────────────────────────────
    // PeriodicPayment from the Loan entry may be a decimal (sub-drop fraction);
    // XRPL Amount must be an integer number of drops — ceil to ensure full payment.
    const paymentDrops = String(Math.ceil(Number(periodicPayment)));
    console.log(`Submitting LoanPay (${Number(paymentDrops) / 1e6} XRP = ${paymentDrops} drops)...`);
    const loanPayTx = {
      TransactionType: 'LoanPay',
      Account: borrower.classicAddress,
      LoanID: loanId,
      Amount: paymentDrops,
    };
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const prep   = await client.autofill(loanPayTx as any);
    const signed = borrower.sign(prep);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const result = await (client as any).submitAndWait(signed.tx_blob);
    assertSuccess(result, 'LoanPay');

    console.log(`  ✓ LoanPay SUCCESS`);
    console.log(`    Hash    : ${result.result.hash}`);
    console.log(`    Explorer: https://devnet.xrpl.org/transactions/${result.result.hash}\n`);

    // ── PPS snapshot AFTER repayment ──────────────────────────────────────
    const vaultAfter = await fetchVaultInfo(client, vaultId);
    const sharesAfter = await fetchTotalShares(client, vaultAfter.ShareMPTID as string);
    const ppsAfter = computePPS(
      vaultAfter.AssetsTotal as string ?? '0',
      sharesAfter
    );
    console.log('Vault state AFTER repayment:');
    console.log(`  AssetsTotal : ${Number(vaultAfter.AssetsTotal ?? '0') / 1e6} XRP`);
    console.log(`  TotalShares : ${sharesAfter}`);
    console.log(`  PPS         : ${ppsAfter.toFixed(9)} XRP/share`);

    const ppsDelta = ppsAfter - ppsBefore;
    console.log(`\n  PPS Δ = ${ppsDelta.toFixed(9)} XRP/share`);
    if (Math.abs(ppsDelta) < 1e-6) {
      console.log('  ℹ️  PPS delta is near-zero — expected for a 2-minute loan at 5% annual (DX-01).');
      console.log('     Interest accrued ≈ 10 XRP × 0.005 × 120s/31536000s ≈ 0 drops.');
      console.log('     Use tfVaultDonation (06_coupon_injection.ts) to simulate observable yield.');
    }
    console.log();

    console.log('✅ B4 COMPLETE — loan repaid, cash-basis PPS captured');
    console.log('   Next step: npx tsx scripts/09_redemption.ts  (will auto-wait for redemption phase)');
  });
}

main().catch((err: Error) => {
  console.error('\nB4 FAILED:', err.message);
  process.exit(1);
});
