/**
 * C1 — Permissioned Domain + Credential Issuance
 *
 * Broker creates a PermissionedDomain (XLS-80) with a KYC_VERIFIED credential
 * requirement, then issues XLS-70 Credentials to InvestorA and InvestorB.
 * Both investors accept their credentials.
 *
 * Writes to .env:
 *   DOMAIN_ID        — 64-char ledger index of the PermissionedDomain object
 *   CREDENTIAL_TYPE  — hex-encoded credential type (KYC_VERIFIED)
 *
 * After this runs, re-run `npm run b1` to create a new vault with
 * PermissionedDomainID attached, then run b2/c3 to test the credential gate.
 */
import * as dotenv from 'dotenv';
import { withClient } from '../config/client';
import { loadAccounts } from '../config/accounts';
import {
  extractCreatedLedgerId,
  assertSuccess,
  upsertEnvVar,
  xrplTimeNow,
  sleep,
} from '../config/xrpl-utils';

dotenv.config();

const CREDENTIAL_TYPE_TEXT = 'KYC_VERIFIED';
// CredentialType must be an even-length hex string (XLS-70 requirement)
const CREDENTIAL_TYPE_HEX  = Buffer.from(CREDENTIAL_TYPE_TEXT).toString('hex').toUpperCase();
const CREDENTIAL_URI_HEX   = Buffer.from('https://devinci-fund.example/kyc').toString('hex').toUpperCase();
const ONE_YEAR_RIPPLE_SECS = 365 * 24 * 3600;

/** Fetch PermissionedDomain ledger index from account_objects, matching by tx Sequence. */
async function fetchDomainId(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  client: any,
  ownerAddress: string,
  txSequence: number,
): Promise<string | null> {
  const res = await client.request({
    command: 'account_objects',
    account: ownerAddress,
    type: 'permissioned_domain',
    ledger_index: 'validated',
  });
  const domain = (res.result?.account_objects as Array<Record<string, unknown>>)?.find(
    (obj) => obj.Sequence === txSequence,
  );
  return (domain?.index as string) ?? null;
}

/** Fetch Credential ledger index from subject's account_objects. */
async function fetchCredentialId(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  client: any,
  subjectAddress: string,
  issuerAddress: string,
  credentialTypeHex: string,
): Promise<string | null> {
  const res = await client.request({
    command: 'account_objects',
    account: subjectAddress,
    type: 'credential',
    ledger_index: 'validated',
  });
  const cred = (res.result?.account_objects as Array<Record<string, unknown>>)?.find(
    (obj) => obj.Issuer === issuerAddress && obj.CredentialType === credentialTypeHex,
  );
  return (cred?.index as string) ?? null;
}

async function main(): Promise<void> {
  console.log('=== C1: Permissioned Domain + Credential Issuance ===\n');

  const { broker, investorA, investorB } = loadAccounts();
  console.log(`Broker    : ${broker.classicAddress}`);
  console.log(`InvestorA : ${investorA.classicAddress}`);
  console.log(`InvestorB : ${investorB.classicAddress}`);
  console.log(`CredType  : ${CREDENTIAL_TYPE_TEXT}  (hex: ${CREDENTIAL_TYPE_HEX})\n`);

  await withClient(async (client) => {
    // ── Step 1: Create Permissioned Domain ──────────────────────────────────
    console.log('--- Step 1: PermissionedDomainSet (create) ---');
    const pdTx = {
      TransactionType: 'PermissionedDomainSet',
      Account: broker.classicAddress,
      AcceptedCredentials: [
        {
          Credential: {
            Issuer: broker.classicAddress,
            CredentialType: CREDENTIAL_TYPE_HEX,
          },
        },
      ],
    };
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const pdPrep   = await client.autofill(pdTx as any);
    const pdSigned = broker.sign(pdPrep);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const pdResult = await (client as any).submitAndWait(pdSigned.tx_blob);
    assertSuccess(pdResult, 'PermissionedDomainSet');

    // Resolve domain ID: try AffectedNodes first (faster), fall back to account_objects
    let domainId = extractCreatedLedgerId(pdResult, 'PermissionedDomain');
    if (!domainId) {
      const txSeq = (pdResult.result as Record<string, unknown>).Sequence as number;
      console.log(`  AffectedNodes miss — querying account_objects (seq ${txSeq})...`);
      await sleep(4000); // wait one ledger cycle
      domainId = await fetchDomainId(client, broker.classicAddress, txSeq);
    }
    if (!domainId) throw new Error('PermissionedDomainSet succeeded but DOMAIN_ID not found in metadata or account_objects');

    console.log(`  ✓ Domain created`);
    console.log(`    DOMAIN_ID : ${domainId}`);
    console.log(`    Hash      : ${pdResult.result.hash}`);
    console.log(`    Explorer  : https://devnet.xrpl.org/transactions/${pdResult.result.hash}\n`);

    // ── Step 2: Issue credential to InvestorA ────────────────────────────────
    console.log('--- Step 2: CredentialCreate → InvestorA ---');
    const credATx = {
      TransactionType: 'CredentialCreate',
      Account: broker.classicAddress,
      Subject: investorA.classicAddress,
      CredentialType: CREDENTIAL_TYPE_HEX,
      Expiration: xrplTimeNow() + ONE_YEAR_RIPPLE_SECS,
      URI: CREDENTIAL_URI_HEX,
    };
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const credAPrep   = await client.autofill(credATx as any);
    const credASigned = broker.sign(credAPrep);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const credAResult = await (client as any).submitAndWait(credASigned.tx_blob);
    assertSuccess(credAResult, 'CredentialCreate (InvestorA)');
    console.log(`  ✓ Credential issued to InvestorA`);
    console.log(`    Hash    : ${credAResult.result.hash}`);
    console.log(`    Explorer: https://devnet.xrpl.org/transactions/${credAResult.result.hash}\n`);

    // ── Step 3: Issue credential to InvestorB ────────────────────────────────
    console.log('--- Step 3: CredentialCreate → InvestorB ---');
    const credBTx = {
      TransactionType: 'CredentialCreate',
      Account: broker.classicAddress,
      Subject: investorB.classicAddress,
      CredentialType: CREDENTIAL_TYPE_HEX,
      Expiration: xrplTimeNow() + ONE_YEAR_RIPPLE_SECS,
      URI: CREDENTIAL_URI_HEX,
    };
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const credBPrep   = await client.autofill(credBTx as any);
    const credBSigned = broker.sign(credBPrep);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const credBResult = await (client as any).submitAndWait(credBSigned.tx_blob);
    assertSuccess(credBResult, 'CredentialCreate (InvestorB)');
    console.log(`  ✓ Credential issued to InvestorB`);
    console.log(`    Hash    : ${credBResult.result.hash}`);
    console.log(`    Explorer: https://devnet.xrpl.org/transactions/${credBResult.result.hash}\n`);

    // ── Step 4: InvestorA accepts credential ─────────────────────────────────
    console.log('--- Step 4: CredentialAccept — InvestorA ---');
    const acceptATx = {
      TransactionType: 'CredentialAccept',
      Account: investorA.classicAddress,
      Issuer: broker.classicAddress,
      CredentialType: CREDENTIAL_TYPE_HEX,
    };
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const acceptAPrep   = await client.autofill(acceptATx as any);
    const acceptASigned = investorA.sign(acceptAPrep);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const acceptAResult = await (client as any).submitAndWait(acceptASigned.tx_blob);
    assertSuccess(acceptAResult, 'CredentialAccept (InvestorA)');
    console.log(`  ✓ InvestorA accepted credential`);
    console.log(`    Hash    : ${acceptAResult.result.hash}`);
    console.log(`    Explorer: https://devnet.xrpl.org/transactions/${acceptAResult.result.hash}\n`);

    // ── Step 5: InvestorB accepts credential ─────────────────────────────────
    console.log('--- Step 5: CredentialAccept — InvestorB ---');
    const acceptBTx = {
      TransactionType: 'CredentialAccept',
      Account: investorB.classicAddress,
      Issuer: broker.classicAddress,
      CredentialType: CREDENTIAL_TYPE_HEX,
    };
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const acceptBPrep   = await client.autofill(acceptBTx as any);
    const acceptBSigned = investorB.sign(acceptBPrep);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const acceptBResult = await (client as any).submitAndWait(acceptBSigned.tx_blob);
    assertSuccess(acceptBResult, 'CredentialAccept (InvestorB)');
    console.log(`  ✓ InvestorB accepted credential`);
    console.log(`    Hash    : ${acceptBResult.result.hash}`);
    console.log(`    Explorer: https://devnet.xrpl.org/transactions/${acceptBResult.result.hash}\n`);

    // ── Step 6: Verify on-chain and fetch credential IDs ────────────────────
    console.log('--- Step 6: On-chain verification ---');
    await sleep(2000); // one ledger settle

    const credIdA = await fetchCredentialId(client, investorA.classicAddress, broker.classicAddress, CREDENTIAL_TYPE_HEX);
    const credIdB = await fetchCredentialId(client, investorB.classicAddress, broker.classicAddress, CREDENTIAL_TYPE_HEX);
    const credIdUncred = await fetchCredentialId(client, (loadAccounts()).uncredentialed.classicAddress, broker.classicAddress, CREDENTIAL_TYPE_HEX);

    if (!credIdA) console.warn('  WARN: Credential ID not found for InvestorA — check acceptance tx');
    if (!credIdB) console.warn('  WARN: Credential ID not found for InvestorB — check acceptance tx');

    console.log(`  InvestorA credential ID : ${credIdA ?? '(not found)'}`);
    console.log(`  InvestorB credential ID : ${credIdB ?? '(not found)'}`);
    console.log(`  Uncredentialed cred     : ${credIdUncred ?? 'none (expected)'}\n`);

    console.log(`  Explorer — Broker     : https://devnet.xrpl.org/accounts/${broker.classicAddress}`);
    console.log(`  Explorer — InvestorA  : https://devnet.xrpl.org/accounts/${investorA.classicAddress}`);
    console.log(`  Explorer — InvestorB  : https://devnet.xrpl.org/accounts/${investorB.classicAddress}\n`);

    // ── Step 7: Write to .env ────────────────────────────────────────────────
    console.log('Writing to .env...');
    upsertEnvVar('DOMAIN_ID', domainId);
    upsertEnvVar('CREDENTIAL_TYPE', CREDENTIAL_TYPE_HEX);
    upsertEnvVar('CREDENTIAL_ISSUER', broker.classicAddress);

    console.log('\n✅ C1 COMPLETE — domain created, credentials issued and accepted');
    console.log('   DOMAIN_ID and CREDENTIAL_TYPE written to .env');
    console.log('   Uncredentialed account has NO credential (as expected)');
    console.log('\n   Next steps:');
    console.log('   1. npm run b0         — top up accounts');
    console.log('   2. npm run b1         — create new vault (with PermissionedDomainID)');
    console.log('   3. npm run b2         — subscription (credentialed deposits + uncred probe)');
    console.log('   4. npm run c2         — MPT authorization (lsfMPTRequireAuth + authorize A/B)');
  });
}

main().catch((err: Error) => {
  console.error('\nC1 FAILED:', err.message);
  process.exit(1);
});
