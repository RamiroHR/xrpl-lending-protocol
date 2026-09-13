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

/** Fetch a Credential and its acceptance state from subject's account_objects. */
async function fetchCredential(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  client: any,
  subjectAddress: string,
  issuerAddress: string,
  credentialTypeHex: string,
): Promise<{ id: string; accepted: boolean } | null> {
  const res = await client.request({
    command: 'account_objects',
    account: subjectAddress,
    type: 'credential',
    ledger_index: 'validated',
  });
  const cred = (res.result?.account_objects as Array<Record<string, unknown>>)?.find(
    (obj) => obj.Issuer === issuerAddress && obj.CredentialType === credentialTypeHex,
  );
  if (!cred) return null;
  // lsfAccepted = 0x00010000
  return { id: cred.index as string, accepted: ((cred.Flags as number) & 0x00010000) !== 0 };
}

/** Check whether a PermissionedDomain ledger object still exists on-chain. */
async function domainExists(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  client: any,
  domainId: string,
): Promise<boolean> {
  try {
    await client.request({ command: 'ledger_entry', index: domainId, ledger_index: 'validated' });
    return true;
  } catch {
    return false;
  }
}

async function main(): Promise<void> {
  console.log('=== C1: Permissioned Domain + Credential Issuance ===\n');

  const { broker, investorA, investorB } = loadAccounts();
  console.log(`Broker    : ${broker.classicAddress}`);
  console.log(`InvestorA : ${investorA.classicAddress}`);
  console.log(`InvestorB : ${investorB.classicAddress}`);
  console.log(`CredType  : ${CREDENTIAL_TYPE_TEXT}  (hex: ${CREDENTIAL_TYPE_HEX})\n`);

  await withClient(async (client) => {
    // ── Step 1: Create (or reuse) Permissioned Domain ───────────────────────
    console.log('--- Step 1: PermissionedDomainSet ---');
    let domainId: string | null = process.env.DOMAIN_ID ?? null;

    if (domainId && await domainExists(client, domainId)) {
      console.log(`  ℹ️  DOMAIN_ID already in .env and exists on-chain — reusing`);
      console.log(`    DOMAIN_ID : ${domainId}\n`);
    } else {
      if (domainId) console.log(`  ℹ️  Stale DOMAIN_ID in .env — creating fresh domain`);
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

      domainId = extractCreatedLedgerId(pdResult, 'PermissionedDomain');
      if (!domainId) {
        const txSeq = (pdResult.result as Record<string, unknown>).Sequence as number;
        console.log(`  AffectedNodes miss — querying account_objects (seq ${txSeq})...`);
        await sleep(4000);
        domainId = await fetchDomainId(client, broker.classicAddress, txSeq);
      }
      if (!domainId) throw new Error('PermissionedDomainSet succeeded but DOMAIN_ID not found');

      console.log(`  ✓ Domain created`);
      console.log(`    DOMAIN_ID : ${domainId}`);
      console.log(`    Hash      : ${pdResult.result.hash}`);
      console.log(`    Explorer  : https://devnet.xrpl.org/transactions/${pdResult.result.hash}\n`);
    }

    // ── Steps 2–5: Issue + accept credentials (idempotent) ──────────────────
    for (const { label, investor } of [
      { label: 'InvestorA', investor: investorA },
      { label: 'InvestorB', investor: investorB },
    ]) {
      const stepBase = label === 'InvestorA' ? 2 : 4;
      const existing = await fetchCredential(client, investor.classicAddress, broker.classicAddress, CREDENTIAL_TYPE_HEX);

      // CredentialCreate
      console.log(`--- Step ${stepBase}: CredentialCreate → ${label} ---`);
      if (existing) {
        console.log(`  ℹ️  Credential already exists (ID: ${existing.id}) — skipping create\n`);
      } else {
        const credTx = {
          TransactionType: 'CredentialCreate',
          Account: broker.classicAddress,
          Subject: investor.classicAddress,
          CredentialType: CREDENTIAL_TYPE_HEX,
          Expiration: xrplTimeNow() + ONE_YEAR_RIPPLE_SECS,
          URI: CREDENTIAL_URI_HEX,
        };
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const credPrep   = await client.autofill(credTx as any);
        const credSigned = broker.sign(credPrep);
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const credResult = await (client as any).submitAndWait(credSigned.tx_blob);
        assertSuccess(credResult, `CredentialCreate (${label})`);
        console.log(`  ✓ Credential issued to ${label}`);
        console.log(`    Hash    : ${credResult.result.hash}`);
        console.log(`    Explorer: https://devnet.xrpl.org/transactions/${credResult.result.hash}\n`);
      }

      // CredentialAccept
      console.log(`--- Step ${stepBase + 1}: CredentialAccept — ${label} ---`);
      const current = existing ?? await fetchCredential(client, investor.classicAddress, broker.classicAddress, CREDENTIAL_TYPE_HEX);
      if (current?.accepted) {
        console.log(`  ℹ️  Already accepted — skipping\n`);
      } else {
        const acceptTx = {
          TransactionType: 'CredentialAccept',
          Account: investor.classicAddress,
          Issuer: broker.classicAddress,
          CredentialType: CREDENTIAL_TYPE_HEX,
        };
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const acceptPrep   = await client.autofill(acceptTx as any);
        const acceptSigned = investor.sign(acceptPrep);
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const acceptResult = await (client as any).submitAndWait(acceptSigned.tx_blob);
        assertSuccess(acceptResult, `CredentialAccept (${label})`);
        console.log(`  ✓ ${label} accepted credential`);
        console.log(`    Hash    : ${acceptResult.result.hash}`);
        console.log(`    Explorer: https://devnet.xrpl.org/transactions/${acceptResult.result.hash}\n`);
      }
    }

    // ── Step 6: Verify on-chain and fetch credential IDs ────────────────────
    console.log('--- Step 6: On-chain verification ---');
    await sleep(2000); // one ledger settle

    const credA      = await fetchCredential(client, investorA.classicAddress, broker.classicAddress, CREDENTIAL_TYPE_HEX);
    const credB      = await fetchCredential(client, investorB.classicAddress, broker.classicAddress, CREDENTIAL_TYPE_HEX);
    const credIdA    = credA?.id ?? null;
    const credIdB    = credB?.id ?? null;
    const credIdUncred = (await fetchCredential(client, (loadAccounts()).uncredentialed.classicAddress, broker.classicAddress, CREDENTIAL_TYPE_HEX))?.id ?? null;

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
