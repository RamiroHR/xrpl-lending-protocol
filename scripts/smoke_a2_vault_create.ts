/**
 * A2 smoke-test: submit a minimal VaultCreate (open-ended, XRP) to confirm
 * the beta SDK can originate a vault at all. Writes SMOKE_VAULT_ID to .env.
 */
import * as fs from 'fs';
import * as path from 'path';
import * as dotenv from 'dotenv';
import { withClient } from '../config/client';
import { loadAccounts } from '../config/accounts';

dotenv.config();

function upsertEnvVar(key: string, value: string): void {
  const envPath = path.resolve(__dirname, '../.env');
  let content = '';
  try { content = fs.readFileSync(envPath, 'utf-8'); } catch { /* ok */ }
  const re = new RegExp(`^${key}=.*$`, 'm');
  content = re.test(content) ? content.replace(re, `${key}=${value}`) : `${content.trimEnd()}\n${key}=${value}\n`;
  fs.writeFileSync(envPath, content);
}

async function main(): Promise<void> {
  console.log('=== A2: VaultCreate Smoke Test ===\n');

  const { broker } = loadAccounts();
  console.log(`Broker: ${broker.classicAddress}`);

  await withClient(async (client) => {
    const tx = {
      TransactionType: 'VaultCreate',
      Account: broker.classicAddress,
      Asset: { currency: 'XRP' },
      WithdrawalPolicy: 1, // vaultStrategyFirstComeFirstServe
      Flags: 0,
    };

    console.log('Autofilling & signing VaultCreate...');
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const prepared = await client.autofill(tx as any);
    const signed = broker.sign(prepared);

    console.log('Submitting...');
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const result = await (client as any).submitAndWait(signed.tx_blob);

    const meta = result.result.meta as Record<string, unknown>;
    const engineResult = (meta?.TransactionResult as string) ?? '';
    if (engineResult && engineResult !== 'tesSUCCESS') {
      throw new Error(`VaultCreate failed: ${engineResult} (hash: ${result.result.hash ?? ''})`);
    }

    const nodes = (meta?.AffectedNodes as Array<Record<string, unknown>>) ?? [];
    let vaultId: string | null = null;
    for (const node of nodes) {
      const created = node.CreatedNode as Record<string, unknown> | undefined;
      if (created?.LedgerEntryType === 'Vault') {
        vaultId = created.LedgerIndex as string;
        break;
      }
    }

    if (!vaultId) throw new Error('VaultCreate tx succeeded but no Vault ledger entry found in metadata');

    console.log('\nVaultCreate SUCCESS');
    console.log(`  Hash:     ${result.result.hash}`);
    console.log(`  VaultID:  ${vaultId}`);
    console.log(`  Explorer: https://devnet.xrpl.org/transactions/${result.result.hash}`);

    upsertEnvVar('SMOKE_VAULT_ID', vaultId);
    console.log('\nSMOKE_VAULT_ID saved to .env');
    console.log('Next step: npm run smoke:a3');
  });
}

main().catch((err: Error) => {
  console.error('\nA2 FAILED:', err.message);
  process.exit(1);
});
