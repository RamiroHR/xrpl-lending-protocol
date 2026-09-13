/**
 * C2 — MPT Authorization
 *
 * Sets lsfMPTRequireAuth on the vault's share MPT issuance so that only
 * explicitly authorized holders can receive share transfers.
 * Broker then authorizes InvestorA and InvestorB.
 * Uncredentialed account is deliberately left unauthorized.
 *
 * Reads VAULT_ID from .env (written by b1).
 * Must run AFTER b2 (shares already minted) and BEFORE c4 (transfer test).
 */
import * as dotenv from 'dotenv';
import { withClient } from '../config/client';
import { loadAccounts } from '../config/accounts';
import {
  assertSuccess,
  fetchVaultInfo,
  upsertEnvVar,
} from '../config/xrpl-utils';

dotenv.config();

function requireEnv(key: string): string {
  const v = process.env[key];
  if (!v) throw new Error(`Missing ${key} in .env — run b1 first`);
  return v;
}

async function main(): Promise<void> {
  console.log('=== C2: MPT Authorization (lsfMPTRequireAuth + authorize A/B) ===\n');

  const vaultId = requireEnv('VAULT_ID');
  const { broker, investorA, investorB, uncredentialed } = loadAccounts();

  console.log(`VaultID   : ${vaultId}`);
  console.log(`Broker    : ${broker.classicAddress}`);
  console.log(`InvestorA : ${investorA.classicAddress}`);
  console.log(`InvestorB : ${investorB.classicAddress}`);
  console.log(`Uncred    : ${uncredentialed.classicAddress}\n`);

  await withClient(async (client) => {
    // Fetch ShareMPTID from vault
    const vault = await fetchVaultInfo(client, vaultId);
    const shareMPTID = vault.ShareMPTID as string;
    console.log(`ShareMPTID: ${shareMPTID}\n`);

    // ── Step 1: Set lsfMPTRequireAuth on vault share MPT ───────────────────
    // NOTE: This is expected to fail with tecNO_PERMISSION on vault-managed MPTs.
    // The vault (not the broker) owns the share MPT issuance; MPTokenIssuanceSet
    // cannot modify it post-creation (DevEx finding DX-09).
    console.log('--- Step 1: MPTokenIssuanceSet (tfMPTSetRequireAuth) ---');
    console.log('  ℹ️  Known limitation (DX-09): vault-managed MPTs return tecNO_PERMISSION.');
    const setAuthTx = {
      TransactionType: 'MPTokenIssuanceSet',
      Account: broker.classicAddress,
      MPTokenIssuanceID: shareMPTID,
      Flags: 0x0008, // tfMPTSetRequireAuth = 8
    };
    let requireAuthSet = false;
    try {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const setAuthPrep   = await client.autofill(setAuthTx as any);
      const setAuthSigned = broker.sign(setAuthPrep);
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const setAuthResult = await (client as any).submitAndWait(setAuthSigned.tx_blob);
      const setAuthMeta   = setAuthResult.result.meta as Record<string, unknown> | undefined;
      const setAuthCode   = (setAuthMeta?.TransactionResult as string) ?? 'unknown';
      if (setAuthCode === 'tesSUCCESS') {
        requireAuthSet = true;
        console.log(`  ✓ lsfMPTRequireAuth set on vault shares`);
        console.log(`    Hash    : ${setAuthResult.result.hash}`);
        console.log(`    Explorer: https://devnet.xrpl.org/transactions/${setAuthResult.result.hash}\n`);
      } else {
        console.log(`  ⚠️  MPTokenIssuanceSet result: ${setAuthCode} (DX-09 confirmed)`);
        console.log(`     Hash    : ${setAuthResult.result.hash}`);
        console.log(`     Vault owns share MPT exclusively; broker cannot set RequireAuth post-creation.`);
        console.log(`     Transfers A→B/uncred will rely on MPToken entry presence (see DX-10).\n`);
      }
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      console.log(`  MPTokenIssuanceSet threw: ${msg}\n`);
    }

    if (requireAuthSet) {
      // ── Step 2: Authorize InvestorA ──────────────────────────────────────
      console.log('--- Step 2: MPTokenAuthorize → InvestorA ---');
      const authATx = {
        TransactionType: 'MPTokenAuthorize',
        Account: broker.classicAddress,
        MPTokenIssuanceID: shareMPTID,
        Holder: investorA.classicAddress,
      };
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const authAPrep   = await client.autofill(authATx as any);
      const authASigned = broker.sign(authAPrep);
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const authAResult = await (client as any).submitAndWait(authASigned.tx_blob);
      assertSuccess(authAResult, 'MPTokenAuthorize (InvestorA)');
      console.log(`  ✓ InvestorA authorized`);
      console.log(`    Hash    : ${authAResult.result.hash}`);
      console.log(`    Explorer: https://devnet.xrpl.org/transactions/${authAResult.result.hash}\n`);

      // ── Step 3: Authorize InvestorB ──────────────────────────────────────
      console.log('--- Step 3: MPTokenAuthorize → InvestorB ---');
      const authBTx = {
        TransactionType: 'MPTokenAuthorize',
        Account: broker.classicAddress,
        MPTokenIssuanceID: shareMPTID,
        Holder: investorB.classicAddress,
      };
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const authBPrep   = await client.autofill(authBTx as any);
      const authBSigned = broker.sign(authBPrep);
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const authBResult = await (client as any).submitAndWait(authBSigned.tx_blob);
      assertSuccess(authBResult, 'MPTokenAuthorize (InvestorB)');
      console.log(`  ✓ InvestorB authorized`);
      console.log(`    Hash    : ${authBResult.result.hash}`);
      console.log(`    Explorer: https://devnet.xrpl.org/transactions/${authBResult.result.hash}\n`);
    } else {
      console.log('--- Steps 2–3 skipped: lsfMPTRequireAuth not set (DX-09) ---');
      console.log('  Share transfers will be gated by MPToken entry presence instead (DX-10).\n');
    }

    // ── Step 4: Confirm uncredentialed status ─────────────────────────────
    console.log('--- Step 4: Uncredentialed account status ---');
    console.log(`  Uncredentialed (${uncredentialed.classicAddress}):`);
    if (requireAuthSet) {
      console.log(`  → NOT authorized (deliberately). Transfers to this address will fail.`);
    } else {
      console.log(`  → No MPToken entry (no VaultDeposit ever made). Transfers will fail with tecNO_AUTH (DX-10).`);
    }
    console.log();

    upsertEnvVar('SHARE_MPT_ID', shareMPTID);

    if (requireAuthSet) {
      console.log('✅ C2 COMPLETE — lsfMPTRequireAuth set; InvestorA and InvestorB authorized');
    } else {
      console.log('✅ C2 COMPLETE — lsfMPTRequireAuth blocked by DX-09; transfer barrier via MPToken entry (DX-10)');
    }
    console.log('   Next step: npm run c4  — MPT share transfer test');
  });
}

main().catch((err: Error) => {
  console.error('\nC2 FAILED:', err.message);
  process.exit(1);
});
