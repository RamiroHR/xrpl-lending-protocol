/**
 * B0 — Fund all Phase B accounts via the Devnet faucet.
 * Prints balances before and after. Safe to run multiple times.
 */
import * as https from 'https';
import * as dotenv from 'dotenv';
import { withClient } from '../config/client';
import { loadAccounts } from '../config/accounts';

dotenv.config();

function faucetFund(address: string): Promise<number> {
  return new Promise((resolve, reject) => {
    const body = JSON.stringify({ destination: address });
    const req = https.request(
      {
        hostname: 'faucet.devnet.rippletest.net',
        path: '/accounts',
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(body) },
      },
      (res) => {
        let data = '';
        res.on('data', (chunk) => (data += chunk));
        res.on('end', () => {
          try {
            const json = JSON.parse(data);
            resolve(json.amount ?? 0);
          } catch {
            reject(new Error(`Faucet parse error: ${data}`));
          }
        });
      },
    );
    req.on('error', reject);
    req.write(body);
    req.end();
  });
}

async function getBalance(client: InstanceType<typeof import('xrpl').Client>, address: string): Promise<number> {
  try {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const r = await (client as any).request({ command: 'account_info', account: address, ledger_index: 'validated' });
    return Number(r.result.account_data.Balance) / 1_000_000;
  } catch {
    return 0;
  }
}

async function main(): Promise<void> {
  console.log('=== B0: Fund All Accounts ===\n');

  const accounts = loadAccounts();
  const named = [
    { name: 'InvestorA', wallet: accounts.investorA },
    { name: 'InvestorB', wallet: accounts.investorB },
    { name: 'Borrower',  wallet: accounts.borrower },
    { name: 'Broker',    wallet: accounts.broker },
  ];

  await withClient(async (client) => {
    // ── Balances BEFORE ───────────────────────────────────────────────────
    console.log('Balances BEFORE:');
    for (const { name, wallet } of named) {
      const bal = await getBalance(client, wallet.classicAddress);
      console.log(`  ${name.padEnd(10)} ${wallet.classicAddress}  ${bal.toFixed(2)} XRP`);
    }
    console.log();

    // ── Faucet top-up (parallel) ──────────────────────────────────────────
    console.log('Requesting faucet funds...');
    const results = await Promise.allSettled(
      named.map(({ wallet }) => faucetFund(wallet.classicAddress)),
    );
    for (let i = 0; i < named.length; i++) {
      const r = results[i];
      if (r.status === 'fulfilled') {
        console.log(`  ✓ ${named[i].name.padEnd(10)} +${r.value} XRP`);
      } else {
        console.log(`  ✗ ${named[i].name.padEnd(10)} FAILED: ${r.reason}`);
      }
    }
    console.log();

    // ── Wait 2 ledger closes for balances to settle ───────────────────────
    await new Promise((r) => setTimeout(r, 8000));

    // ── Balances AFTER ────────────────────────────────────────────────────
    console.log('Balances AFTER:');
    for (const { name, wallet } of named) {
      const bal = await getBalance(client, wallet.classicAddress);
      console.log(`  ${name.padEnd(10)} ${wallet.classicAddress}  ${bal.toFixed(2)} XRP`);
    }
    console.log();
    console.log('✅ B0 COMPLETE — accounts funded, ready for B1→B5');
  });
}

main().catch((err: Error) => {
  console.error('\nB0 FAILED:', err.message);
  process.exit(1);
});
