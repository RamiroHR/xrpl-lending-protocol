/**
 * D2 — Phase-Gate Rejection Demos.
 *
 * Creates a fresh open-ended vault (VaultKind: 0, no SubscriptionDate/RedemptionDate)
 * and runs 4 rejection probes against it, capturing each error code verbatim.
 * Using a fresh open-ended vault guarantees deterministic rejections regardless
 * of what phase the main lifecycle vault is in.
 *
 * Script always exits 0 — unexpected codes are valid data, logged as UNEXPECTED.
 */
import * as dotenv from 'dotenv';
import { Wallet } from 'xrpl';
import { withClient } from '../config/client';
import { loadAccounts } from '../config/accounts';
import {
  assertSuccess,
  extractCreatedLedgerId,
} from '../config/xrpl-utils';

dotenv.config();

interface ProbeResult {
  label: string;
  txType: string;
  expected: string;
  got: string;
  hash: string;
  match: boolean;
}

async function main(): Promise<void> {
  console.log('=== D2: Phase-Gate Rejection Demos ===\n');

  await withClient(async (client) => {
    const { broker, borrower, investorA } = loadAccounts();

    // ── STEP 1: Create open-ended vault for deterministic rejections ──────
    console.log('── STEP 1: Create open-ended vault (for deterministic rejections) ──');
    const vaultCreateTx = {
      TransactionType: 'VaultCreate',
      Account: broker.classicAddress,
      Asset: { currency: 'XRP' },
      WithdrawalPolicy: 1,    // vaultStrategyFirstComeFirstServe (UInt8)
      Flags: 0,
    };

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const vcPrepared = await (client as any).autofill(vaultCreateTx);
    const vcSigned   = broker.sign(vcPrepared);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const vcResult   = await (client as any).submitAndWait(vcSigned.tx_blob);
    assertSuccess(vcResult, 'VaultCreate demo');

    const demoVaultId = extractCreatedLedgerId(vcResult, 'Vault');
    if (!demoVaultId) throw new Error('VaultCreate succeeded but Vault not found in metadata');
    console.log(`Demo vault created: ${demoVaultId}\n`);

    // ── Probe helper ──────────────────────────────────────────────────────
    let probeCount = 0;

    async function runProbe(
      label: string,
      txType: string,
      tx: Record<string, unknown>,
      expected: string,
      signer: Wallet,
    ): Promise<ProbeResult> {
      probeCount += 1;
      const n = probeCount;

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const prepared = await (client as any).autofill(tx);
      const signed   = signer.sign(prepared);

      let got  = 'UNKNOWN';
      let hash = '';

      try {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const result = await (client as any).submitAndWait(signed.tx_blob);
        const meta = result.result.meta as Record<string, unknown> | undefined;
        got  = (meta?.TransactionResult as string) ?? 'UNKNOWN';
        hash = result.result.hash ?? '';
      } catch (err: unknown) {
        // tem* errors are rejected pre-ledger — submitAndWait throws instead of returning
        const msg = err instanceof Error ? err.message : String(err);
        const codeMatch = msg.match(/\b(tem\w+|tec\w+|tef\w+|tel\w+|ter\w+)\b/);
        got  = codeMatch ? codeMatch[1] : `ERROR: ${msg.slice(0, 80)}`;
        hash = '';
      }

      const match      = got === expected;
      const matchLabel = match ? '✓' : '✗ UNEXPECTED';

      console.log(`[PROBE ${n}] ${label}`);
      console.log(`  Expected : ${expected}`);
      console.log(`  Got      : ${got} ${matchLabel}`);
      if (hash) {
        console.log(`  Hash     : ${hash}`);
        console.log(`  Explorer : https://devnet.xrpl.org/transactions/${hash}`);
      } else {
        console.log(`  Hash     : (rejected pre-ledger — no hash)`);
      }
      console.log();

      return { label, txType, expected, got, hash, match };
    }

    // ── PROBE 1: LoanBrokerSet on open-ended vault ────────────────────────
    const p1 = await runProbe(
      'LoanBrokerSet on open-ended vault',
      'LoanBrokerSet',
      {
        TransactionType: 'LoanBrokerSet',
        Account: broker.classicAddress,
        VaultID: demoVaultId,
      },
      'tecNO_PERMISSION',   // open-ended vault — LoanBrokerSet only works on closed-ended
      broker,
    );

    // ── PROBE 2: VaultDeposit with 1 drop (below reserve) ────────────────
    const p2 = await runProbe(
      'VaultDeposit with 1 drop (below reserve / min amount)',
      'VaultDeposit',
      {
        TransactionType: 'VaultDeposit',
        Account: investorA.classicAddress,
        VaultID: demoVaultId,
        Amount: '1',          // 1 drop — below any protocol minimum
      },
      'tecINSUFFICIENT_FUNDS',  // or temBAD_AMOUNT — capture whatever comes back
      investorA,
    );

    // ── PROBE 3: VaultWithdraw with no shares ─────────────────────────────
    const p3 = await runProbe(
      'VaultWithdraw with no shares (investorA holds none in demo vault)',
      'VaultWithdraw',
      {
        TransactionType: 'VaultWithdraw',
        Account: investorA.classicAddress,
        VaultID: demoVaultId,
        Amount: '1000000',    // 1 XRP in drops
      },
      'tecINSUFFICIENT_FUNDS',  // no shares minted → nothing to withdraw
      investorA,
    );

    // ── PROBE 4: LoanPay with non-existent Loan ID ────────────────────────
    const p4 = await runProbe(
      'LoanPay with non-existent Loan ID (fake zeros)',
      'LoanPay',
      {
        TransactionType: 'LoanPay',
        Account: borrower.classicAddress,
        LoanID: 'DEADBEEFDEADBEEFDEADBEEFDEADBEEFDEADBEEFDEADBEEFDEADBEEFDEADBEEF',
        Amount: '1000000',    // 1 XRP in drops
      },
      'tecNO_ENTRY',          // or similar — fake loan ID
      borrower,
    );

    // ── SUMMARY TABLE ─────────────────────────────────────────────────────
    const probes: ProbeResult[] = [p1, p2, p3, p4];

    console.log('=== Rejection Demos Summary ===');
    console.log('| Probe | TX Type | Expected | Got | Match |');
    console.log('|---|---|---|---|---|');
    probes.forEach((p, i) => {
      const matchCell = p.match ? '✓' : '✗';
      console.log(`| ${i + 1} | ${p.txType} | ${p.expected} | ${p.got} | ${matchCell} |`);
    });

    console.log('\n[DevEx] Phase-gate error messages:');
    console.log('  Do errors name the current phase or required phase? Observe above codes:');
    console.log('  tecNO_PERMISSION / tecINSUFFICIENT_FUNDS / tecNO_ENTRY — none include phase context.');
    console.log('  XLS-65/66 phase-gate errors do not state which phase is active or required.');

    console.log('\n=== D2 complete ===');
  });
}

main().catch((err: Error) => {
  console.error('\nFAILED:', err.message);
  process.exit(1);
});
