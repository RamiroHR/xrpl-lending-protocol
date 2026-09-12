/**
 * B1 — Create the production closed-ended vault.
 *
 * Writes VAULT_ID, VAULT_SUB_DATE, VAULT_REDEMPTION_DATE to .env so that
 * subsequent scripts (04, 05, 09) self-gate on ledger time without manual alarms.
 *
 * WARNING: Run this only when you are ready to immediately follow with
 *          04_subscription.ts (subscription window = 120 s).
 */
import * as dotenv from 'dotenv';
import { withClient } from '../config/client';
import { loadAccounts } from '../config/accounts';
import {
  xrplTimeNow,
  rippleTimeToISO,
  extractCreatedLedgerId,
  assertSuccess,
  upsertEnvVar,
} from '../config/xrpl-utils';

dotenv.config();

const SUBSCRIPTION_SECONDS = 120;  // 2-min subscription window
const REDEMPTION_SECONDS   = 900;  // 15-min investment window (sub=120 + interval=300 + grace=300 + ~180 buffer)

// C1: if DOMAIN_ID is present in .env, the vault is credential-gated (VaultDeposit
// requires the depositor to hold a credential from the domain's AcceptedCredentials).
const DOMAIN_ID = process.env.DOMAIN_ID ?? null;

async function main(): Promise<void> {
  console.log('=== B1: Create Production Vault ===\n');

  const { broker } = loadAccounts();
  console.log(`Broker: ${broker.classicAddress}\n`);

  await withClient(async (client) => {
    const now           = xrplTimeNow();
    const subDate       = now + SUBSCRIPTION_SECONDS;
    const redemptionDate = now + REDEMPTION_SECONDS;

    console.log('Phase boundaries (wall-clock):');
    console.log(`  Subscription ends  : ${rippleTimeToISO(subDate)}  (in ${SUBSCRIPTION_SECONDS}s)`);
    console.log(`  Redemption opens   : ${rippleTimeToISO(redemptionDate)}  (in ${REDEMPTION_SECONDS}s)`);
    if (DOMAIN_ID) {
      console.log(`  PermissionedDomain : ${DOMAIN_ID}  (credential-gated deposits)`);
    } else {
      console.log(`  PermissionedDomain : none  (run c1 first to enable credential gate)`);
    }
    console.log();
    console.log('⚠️  Run 04_subscription.ts NOW — subscription window closes in 2 minutes.');
    console.log('⚠️  Run 05_investment.ts within 30 minutes (before redemption opens).\n');

    const vaultTx = {
      TransactionType: 'VaultCreate',
      Account: broker.classicAddress,
      Asset: { currency: 'XRP' },
      WithdrawalPolicy: 1,
      Flags: 0,
      VaultKind: 1,
      SubscriptionDate: subDate,
      RedemptionDate: redemptionDate,
      // C1: attach Permissioned Domain if set; gates VaultDeposit to credentialed accounts
      ...(DOMAIN_ID ? { PermissionedDomainID: DOMAIN_ID } : {}),
    };

    console.log('Submitting VaultCreate...');
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const prep   = await client.autofill(vaultTx as any);
    const signed = broker.sign(prep);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const result = await (client as any).submitAndWait(signed.tx_blob);
    assertSuccess(result, 'VaultCreate');

    const vaultId = extractCreatedLedgerId(result, 'Vault');
    if (!vaultId) throw new Error('VaultCreate succeeded but Vault not found in metadata');

    console.log(`\nVaultCreate SUCCESS`);
    console.log(`  VaultID : ${vaultId}`);
    console.log(`  Hash    : ${result.result.hash}`);
    console.log(`  Explorer: https://devnet.xrpl.org/transactions/${result.result.hash}\n`);

    console.log('Writing to .env...');
    upsertEnvVar('VAULT_ID', vaultId);
    upsertEnvVar('VAULT_SUB_DATE', String(subDate));
    upsertEnvVar('VAULT_REDEMPTION_DATE', String(redemptionDate));

    console.log('\n✅ B1 COMPLETE — vault created, .env updated');
    console.log('   Next step: npx tsx scripts/04_subscription.ts  (run within 2 minutes)');
  });
}

main().catch((err: Error) => {
  console.error('\nB1 FAILED:', err.message);
  process.exit(1);
});
