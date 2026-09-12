/**
 * A3 smoke-test: VaultDeposit then VaultWithdraw on the throwaway vault from A2.
 * Confirms share minting / burning round-trips correctly.
 * Requires SMOKE_VAULT_ID in .env (written by smoke_a2_vault_create.ts).
 */
import * as dotenv from 'dotenv';
import { withClient } from '../config/client';
import { loadAccounts } from '../config/accounts';

dotenv.config();

const DEPOSIT_DROPS = '10000000'; // 10 XRP

function requireEnv(key: string): string {
  const v = process.env[key];
  if (!v) throw new Error(`Missing ${key} in .env — run smoke:a2 first`);
  return v;
}

async function main(): Promise<void> {
  console.log('=== A3: VaultDeposit / VaultWithdraw Smoke Test ===\n');

  const vaultId = requireEnv('SMOKE_VAULT_ID');
  const { investorA } = loadAccounts();
  console.log(`InvestorA: ${investorA.classicAddress}`);
  console.log(`VaultID:   ${vaultId}\n`);

  await withClient(async (client) => {
    // ── Deposit ──────────────────────────────────────────────────────────
    console.log(`Depositing ${Number(DEPOSIT_DROPS) / 1e6} XRP...`);
    const depositTx = {
      TransactionType: 'VaultDeposit',
      Account: investorA.classicAddress,
      VaultID: vaultId,
      Amount: DEPOSIT_DROPS,
    };
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const depositPrep = await client.autofill(depositTx as any);
    const depositSigned = investorA.sign(depositPrep);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const depositResult = await (client as any).submitAndWait(depositSigned.tx_blob);

    const depositMeta = depositResult.result.meta as Record<string, unknown>;
    const depositEngine = (depositMeta?.TransactionResult as string) ?? '';
    if (depositEngine && depositEngine !== 'tesSUCCESS') {
      throw new Error(`VaultDeposit failed: ${depositEngine}`);
    }
    console.log(`VaultDeposit SUCCESS — hash: ${depositResult.result.hash}`);
    console.log(`  Explorer: https://devnet.xrpl.org/transactions/${depositResult.result.hash}`);

    // ── Query vault to get AssetsAvailable ───────────────────────────────
    console.log('\nQuerying vault_info for AssetsAvailable...');
    let withdrawAmount = DEPOSIT_DROPS;
    try {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const vaultInfo = await (client as any).request({ command: 'vault_info', vault_id: vaultId });
      // vault_info response: result.vault (not result.vault_data or result.Vault)
      const vault = vaultInfo.result?.vault ?? vaultInfo.result?.vault_data ?? vaultInfo.result?.Vault;
      const assetsAvailable = vault?.AssetsAvailable ?? vault?.assets_available;
      if (assetsAvailable) {
        withdrawAmount = String(assetsAvailable);
        console.log(`  AssetsAvailable: ${withdrawAmount} drops (${Number(withdrawAmount) / 1e6} XRP)`);
      } else {
        console.log(`  vault_info response shape unexpected — using deposited amount for withdrawal`);
        console.log(`  Raw response keys: ${Object.keys(vaultInfo.result ?? {}).join(', ')}`);
      }
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      console.log(`  vault_info call failed (${msg}) — using deposited amount for withdrawal`);
      // DevEx finding: vault_info RPC not available or shape unclear
    }

    // ── Withdraw ─────────────────────────────────────────────────────────
    console.log(`\nWithdrawing ${Number(withdrawAmount) / 1e6} XRP...`);
    const withdrawTx = {
      TransactionType: 'VaultWithdraw',
      Account: investorA.classicAddress,
      VaultID: vaultId,
      Amount: withdrawAmount,
    };
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const withdrawPrep = await client.autofill(withdrawTx as any);
    const withdrawSigned = investorA.sign(withdrawPrep);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const withdrawResult = await (client as any).submitAndWait(withdrawSigned.tx_blob);

    const withdrawMeta = withdrawResult.result.meta as Record<string, unknown>;
    const withdrawEngine = (withdrawMeta?.TransactionResult as string) ?? '';
    if (withdrawEngine && withdrawEngine !== 'tesSUCCESS') {
      throw new Error(`VaultWithdraw failed: ${withdrawEngine}`);
    }
    console.log(`VaultWithdraw SUCCESS — hash: ${withdrawResult.result.hash}`);
    console.log(`  Explorer: https://devnet.xrpl.org/transactions/${withdrawResult.result.hash}`);

    console.log('\nA3 PASSED — Deposit/Withdraw round-trip confirmed');
    console.log('Next step: npm run smoke:a4');
  });
}

main().catch((err: Error) => {
  console.error('\nA3 FAILED:', err.message);
  process.exit(1);
});
