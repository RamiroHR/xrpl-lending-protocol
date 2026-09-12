/**
 * B3 — Investment phase: LoanBrokerSet + LoanSet (dual-sign) + drawdown.
 *
 * Reads VAULT_ID + VAULT_SUB_DATE from .env and polls the ledger until the
 * subscription window closes before submitting. Writes LOAN_ID and
 * LOAN_NEXT_PAYMENT_DUE to .env for use by 08_repayment.ts.
 *
 * Counterparty signing uses encodeForSigningCounterparty (CPT\0 prefix) —
 * signLoanSetByCounterparty is broken on rippled ≥ 3.4.0 (DX-06).
 */
import * as dotenv from 'dotenv';
import { encode, decode, encodeForSigningCounterparty } from 'ripple-binary-codec';
import { sign as keypairSign } from 'ripple-keypairs';
import { withClient } from '../config/client';
import { loadAccounts } from '../config/accounts';
import {
  rippleTimeToISO,
  extractCreatedLedgerId,
  assertSuccess,
  waitForPhase,
  upsertEnvVar,
} from '../config/xrpl-utils';

dotenv.config();

function requireEnv(key: string): string {
  const v = process.env[key];
  if (!v) throw new Error(`Missing ${key} in .env — run 02_create_vault.ts first`);
  return v;
}

const PRINCIPAL_DROPS  = '10000000'; // 10 XRP
const INTEREST_RATE    = 5000;       // 5000 tenth-bps = 0.5% annual (50 bps)
const PAYMENT_TOTAL    = 1;
const PAYMENT_INTERVAL = 300;        // seconds — 5 min; GracePeriod cannot exceed this
const GRACE_PERIOD     = 300;        // seconds — equal to interval (max allowed); 10 min total window for B4

async function main(): Promise<void> {
  console.log('=== B3: Investment — LoanBrokerSet + LoanSet + Drawdown ===\n');

  const vaultId  = requireEnv('VAULT_ID');
  const subDate  = Number(requireEnv('VAULT_SUB_DATE'));
  const { broker, borrower } = loadAccounts();

  console.log(`VaultID : ${vaultId}`);
  console.log(`Broker  : ${broker.classicAddress}`);
  console.log(`Borrower: ${borrower.classicAddress}`);
  console.log(`Sub end : ${rippleTimeToISO(subDate)}\n`);

  await withClient(async (client) => {

    // ── Wait for investment phase ─────────────────────────────────────────
    await waitForPhase(client, subDate, 'investment phase (subscription closed)');

    // ── LoanBrokerSet ─────────────────────────────────────────────────────
    console.log('Submitting LoanBrokerSet...');
    const bsTx = {
      TransactionType: 'LoanBrokerSet',
      Account: broker.classicAddress,
      VaultID: vaultId,
    };
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const bsPrep   = await client.autofill(bsTx as any);
    const bsSigned = broker.sign(bsPrep);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const bsResult = await (client as any).submitAndWait(bsSigned.tx_blob);
    assertSuccess(bsResult, 'LoanBrokerSet');

    const loanBrokerId = extractCreatedLedgerId(bsResult, 'LoanBroker');
    if (!loanBrokerId) throw new Error('LoanBrokerSet succeeded but LoanBroker not in metadata');
    console.log(`  ✓ LoanBrokerSet OK — LoanBrokerID: ${loanBrokerId}`);
    console.log(`    Explorer: https://devnet.xrpl.org/transactions/${bsResult.result.hash}\n`);

    // ── LoanSet (dual-sign: broker + borrower) ────────────────────────────
    console.log('Building LoanSet (dual-sign: broker + borrower)...');
    const loanSetTx = {
      TransactionType: 'LoanSet',
      Account: broker.classicAddress,
      Counterparty: borrower.classicAddress,
      LoanBrokerID: loanBrokerId,
      PrincipalRequested: PRINCIPAL_DROPS,
      InterestRate: INTEREST_RATE,
      PaymentTotal: PAYMENT_TOTAL,
      PaymentInterval: PAYMENT_INTERVAL,
      GracePeriod: GRACE_PERIOD,
      LoanOriginationFee: '0',
      LoanServiceFee: '0',
    };

    console.log('  Step 1: autofill...');
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const lsPrepared = await client.autofill(loanSetTx as any);

    console.log('  Step 2: broker signs...');
    const brokerSigned = broker.sign(lsPrepared);

    // Step 3: borrower counter-signs with CPT\0 prefix (fixCleanup3_4_0 / rippled ≥ 3.4.0).
    // signLoanSetByCounterparty uses wrong STX\0 prefix — bypassed per DX-06.
    console.log('  Step 3: borrower counter-signs (CPT\\0 prefix)...');
    if (!borrower.privateKey) throw new Error('Borrower wallet missing private key');
    const brokerSignedTx = decode(brokerSigned.tx_blob) as Record<string, unknown>;
    const counterpartyBytes = encodeForSigningCounterparty(brokerSignedTx);
    brokerSignedTx.CounterpartySignature = {
      SigningPubKey: borrower.publicKey,
      TxnSignature: keypairSign(counterpartyBytes, borrower.privateKey),
    };
    const fullySignedBlob = encode(brokerSignedTx);

    console.log('  Step 4: submit...');
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const lsResult = await (client as any).submitAndWait(fullySignedBlob);
    assertSuccess(lsResult, 'LoanSet');

    const loanId = extractCreatedLedgerId(lsResult, 'Loan');
    if (!loanId) throw new Error('LoanSet succeeded but Loan not in metadata');
    console.log(`\n  ✓ LoanSet SUCCESS — dual-sign confirmed`);
    console.log(`    LoanID  : ${loanId}`);
    console.log(`    Hash    : ${lsResult.result.hash}`);
    console.log(`    Explorer: https://devnet.xrpl.org/transactions/${lsResult.result.hash}\n`);

    // Note: drawdown is automatic — the vault transferred PrincipalRequested
    // to the borrower when LoanSet was validated. No separate drawdown tx needed.
    console.log(`  ✓ Drawdown: ${Number(PRINCIPAL_DROPS) / 1e6} XRP automatically transferred to borrower`);

    // ── Fetch Loan entry for NextPaymentDueDate ───────────────────────────
    console.log('\nFetching Loan ledger entry...');
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const loanEntry = await (client as any).request({
      command: 'ledger_entry',
      index: loanId,
      ledger_index: 'validated',
    });
    const loan = loanEntry.result?.node as Record<string, unknown>;
    const nextDue   = loan?.NextPaymentDueDate as number;
    const periodic  = loan?.PeriodicPayment as string;
    const remaining = loan?.PaymentRemaining as number;

    console.log(`  NextPaymentDueDate : ${nextDue}  (${rippleTimeToISO(nextDue)})`);
    console.log(`  PeriodicPayment    : ${periodic} drops  (${Number(periodic) / 1e6} XRP)`);
    console.log(`  PaymentRemaining   : ${remaining}`);
    console.log();

    upsertEnvVar('LOAN_ID', loanId);
    upsertEnvVar('LOAN_NEXT_PAYMENT_DUE', String(nextDue));
    upsertEnvVar('LOAN_PERIODIC_PAYMENT', String(periodic));

    console.log('✅ B3 COMPLETE — loan originated and on-chain');
    console.log(`   Next step: npx tsx scripts/08_repayment.ts  (will auto-wait until ${rippleTimeToISO(nextDue)})`);
  });
}

main().catch((err: Error) => {
  console.error('\nB3 FAILED:', err.message);
  process.exit(1);
});
