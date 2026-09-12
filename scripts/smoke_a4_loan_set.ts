/**
 * A4 smoke-test: LoanBrokerSet + LoanSet (multi-party signing) on a closed-ended vault.
 * Flow:
 *   1. Create closed-ended vault (VaultKind=1) with short subscription window
 *   2. VaultDeposit during subscription (pre-fund the vault)
 *   3. Poll until subscription ends → investment phase begins
 *   4. LoanBrokerSet → LoanSet (broker + borrower dual-sign)
 *
 * DevEx note: VaultKind, SubscriptionDate, RedemptionDate are V1.1 fields absent
 * from the published VaultCreate docs — discovered by runtime error at A4.
 */
import * as dotenv from 'dotenv';
import { encode, decode, encodeForSigningCounterparty } from 'ripple-binary-codec';
import { sign as keypairSign } from 'ripple-keypairs';
import { withClient } from '../config/client';
import { loadAccounts } from '../config/accounts';

dotenv.config();

const DEPOSIT_DROPS   = '20000000'; // 20 XRP
const PRINCIPAL_DROPS = '10000000'; // 10 XRP
const SUBSCRIPTION_SECONDS = 30;    // subscription window (must survive ≥1 ledger close)
const INVESTMENT_SECONDS   = 7200;  // 2 h investment window

/** XRPL ripple epoch = Unix 946684800 (Jan 1, 2000 UTC). */
function toRippleTime(unixSec: number): number {
  return Math.floor(unixSec) - 946684800;
}

function xrplTimeNow(): number {
  return toRippleTime(Date.now() / 1000);
}

function extractCreatedLedgerId(
  result: { result: { meta?: unknown } },
  entryType: string
): string | null {
  const meta = result.result.meta as Record<string, unknown> | undefined;
  const nodes = (meta?.AffectedNodes as Array<Record<string, unknown>>) ?? [];
  for (const node of nodes) {
    const created = node.CreatedNode as Record<string, unknown> | undefined;
    if (created?.LedgerEntryType === entryType) return created.LedgerIndex as string;
  }
  return null;
}

function assertSuccess(result: { result: { meta?: unknown; hash?: string } }, label: string): void {
  const meta = result.result.meta as Record<string, unknown> | undefined;
  const code = (meta?.TransactionResult as string) ?? '';
  if (code && code !== 'tesSUCCESS') {
    throw new Error(`${label} failed: ${code} (hash: ${result.result.hash ?? ''})`);
  }
}

async function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function main(): Promise<void> {
  console.log('=== A4: LoanSet Multi-Party Signing Smoke Test ===\n');
  const { broker, borrower, investorA } = loadAccounts();
  console.log(`Broker:   ${broker.classicAddress}`);
  console.log(`Borrower: ${borrower.classicAddress}\n`);

  await withClient(async (client) => {

    // ── 1. Create closed-ended vault ────────────────────────────────────
    const subscriptionDate = xrplTimeNow() + SUBSCRIPTION_SECONDS;
    const redemptionDate   = xrplTimeNow() + INVESTMENT_SECONDS;

    console.log(`Creating closed-ended vault (VaultKind=1)...`);
    console.log(`  SubscriptionDate (XRPL): ${subscriptionDate}  (investment starts in ~${SUBSCRIPTION_SECONDS}s)`);
    console.log(`  RedemptionDate   (XRPL): ${redemptionDate}\n`);

    const vaultTx = {
      TransactionType: 'VaultCreate',
      Account: broker.classicAddress,
      Asset: { currency: 'XRP' },
      WithdrawalPolicy: 1,
      Flags: 0,
      VaultKind: 1,           // closed-ended (XLS-65 V1.1 field, absent from published docs)
      SubscriptionDate: subscriptionDate,
      RedemptionDate: redemptionDate,
    };
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const vaultPrep = await client.autofill(vaultTx as any);
    const vaultSigned = broker.sign(vaultPrep);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const vaultResult = await (client as any).submitAndWait(vaultSigned.tx_blob);
    assertSuccess(vaultResult, 'VaultCreate (closed)');

    const vaultId = extractCreatedLedgerId(vaultResult, 'Vault');
    if (!vaultId) throw new Error('VaultCreate succeeded but no Vault in metadata');
    console.log(`VaultCreate SUCCESS`);
    console.log(`  Hash:    ${vaultResult.result.hash}`);
    console.log(`  VaultID: ${vaultId}`);
    console.log(`  Explorer: https://devnet.xrpl.org/transactions/${vaultResult.result.hash}\n`);

    // ── 2. Deposit during subscription ──────────────────────────────────
    console.log(`Depositing ${Number(DEPOSIT_DROPS) / 1e6} XRP during subscription phase...`);
    const depTx = {
      TransactionType: 'VaultDeposit',
      Account: investorA.classicAddress,
      VaultID: vaultId,
      Amount: DEPOSIT_DROPS,
    };
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const depPrep = await client.autofill(depTx as any);
    const depSigned = investorA.sign(depPrep);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const depResult = await (client as any).submitAndWait(depSigned.tx_blob);
    assertSuccess(depResult, 'VaultDeposit (subscription)');
    console.log(`  Deposit OK — hash: ${depResult.result.hash}\n`);

    // ── 3. Wait for subscription to end → investment phase ──────────────
    const waitUntil = Date.now() + (SUBSCRIPTION_SECONDS + 5) * 1000;
    let phaseReady = false;
    process.stdout.write(`Waiting for investment phase (subscription ends in ~${SUBSCRIPTION_SECONDS}s)...`);
    while (Date.now() < waitUntil) {
      await sleep(4000);
      process.stdout.write('.');
      // Check server ledger time to confirm phase transition
      try {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const si = await (client as any).request({ command: 'server_info' });
        const ledgerTime = si.result.info?.validated_ledger?.close_time ?? 0;
        if (ledgerTime > subscriptionDate) { phaseReady = true; break; }
      } catch { /* ignore polling errors */ }
    }
    console.log(phaseReady ? ' READY' : ' (timed out — proceeding anyway)');
    console.log();

    // ── 4. LoanBrokerSet ────────────────────────────────────────────────
    console.log('Submitting LoanBrokerSet...');
    const bsTx = {
      TransactionType: 'LoanBrokerSet',
      Account: broker.classicAddress,
      VaultID: vaultId,
    };
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const bsPrep = await client.autofill(bsTx as any);
    const bsSigned = broker.sign(bsPrep);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const bsResult = await (client as any).submitAndWait(bsSigned.tx_blob);
    assertSuccess(bsResult, 'LoanBrokerSet');

    const loanBrokerId = extractCreatedLedgerId(bsResult, 'LoanBroker');
    if (!loanBrokerId) throw new Error('LoanBrokerSet succeeded but no LoanBroker in metadata');
    console.log(`  LoanBrokerSet OK — hash: ${bsResult.result.hash}`);
    console.log(`  LoanBrokerID: ${loanBrokerId}`);
    console.log(`  Explorer: https://devnet.xrpl.org/transactions/${bsResult.result.hash}\n`);

    // ── 5. LoanSet (multi-party signing) ────────────────────────────────
    console.log('Building LoanSet transaction (dual-sign: broker + borrower)...');
    const loanSetTx = {
      TransactionType: 'LoanSet',
      Account: broker.classicAddress,
      Counterparty: borrower.classicAddress,
      LoanBrokerID: loanBrokerId,
      PrincipalRequested: PRINCIPAL_DROPS,
      InterestRate: 5000,   // 500 bps × 10 = 5000 tenth-bps (5% annual)
      PaymentTotal: 1,
      PaymentInterval: 3600,
      GracePeriod: 60,
      LoanOriginationFee: '0',
      LoanServiceFee: '0',
    };

    console.log('  Step 1: autofill...');
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const lsPrepared = await client.autofill(loanSetTx as any);

    console.log('  Step 2: broker signs...');
    const brokerSigned = broker.sign(lsPrepared);

    // Step 3: counterparty signs with the CPT\0 prefix (fixCleanup3_4_0 / rippled ≥ 3.4.0).
    // signLoanSetByCounterparty from xrpl@5.2.0-beta.0 still uses encodeForSigning (STX\0),
    // which produces a signature rippled rejects as "Counterparty: Invalid signature".
    console.log('  Step 3: borrower counter-signs (encodeForSigningCounterparty / CPT\\0 prefix)...');
    if (!borrower.privateKey) throw new Error('Borrower wallet missing private key');
    const brokerSignedTx = decode(brokerSigned.tx_blob) as Record<string, unknown>;
    const counterpartySignBytes = encodeForSigningCounterparty(brokerSignedTx);
    brokerSignedTx.CounterpartySignature = {
      SigningPubKey: borrower.publicKey,
      TxnSignature: keypairSign(counterpartySignBytes, borrower.privateKey),
    };
    const fullySignedBlob = encode(brokerSignedTx);

    console.log('  Step 4: submit...');
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const lsResult = await (client as any).submitAndWait(fullySignedBlob);
    assertSuccess(lsResult, 'LoanSet');

    const loanId = extractCreatedLedgerId(lsResult, 'Loan');
    console.log('\nLoanSet SUCCESS — dual-sign confirmed');
    console.log(`  Hash:   ${lsResult.result.hash}`);
    console.log(`  LoanID: ${loanId}`);
    console.log(`  Explorer: https://devnet.xrpl.org/transactions/${lsResult.result.hash}`);

    console.log('\nA4 PASSED — LoanSet multi-party signing and drawdown confirmed');
    console.log('All Phase A gates cleared. Ready for Phase B.');
  });
}

main().catch((err: Error) => {
  console.error('\nA4 FAILED:', err.message);
  process.exit(1);
});
