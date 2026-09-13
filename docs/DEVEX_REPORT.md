# XRPL Lending Protocol — Developer Experience Feedback Report

## Submission metadata

- **Track:** Track 2 — Closed-ended Vault
- **Flavour:** Loaded (Permissioned Domains + MPT shares)
- **Network:** XRPL public Devnet (rippled v3.4.0-rc5)
- **Library:** `xrpl.js@5.2.0-beta.1`
- **Protocol:** XLS-65 V1.1 (vault) + XLS-66 V1.1 (lending) + XLS-80 (Permissioned Domains) + XLS-33 (MPTs)
- **Date:** 2026-09-13
- **Team:** DeVinci Blockchain — XRPL Lending Protocol Hackathon 2026

---

## Summary

This report documents developer experience friction observed while building a closed-ended, permissioned lending vault on XRPL using the XLS-65/66 V1.1 specification stack. The integration effort revealed a consistent pattern across the protocol surface: the implementation is substantially ahead of published documentation, SDK helpers lag behind amendment-driven protocol changes, and error messages rarely surface enough context to diagnose failures without reading source code or binary codec definitions. The single highest-priority improvement is updating `signLoanSetByCounterparty` in xrpl.js to use `encodeForSigningCounterparty` — this one-line SDK fix would unblock all two-party loan flows on any rippled node running `fixCleanup3_4_0` or later.

---

## Findings

### DX-06 — `signLoanSetByCounterparty` uses wrong signing prefix after `fixCleanup3_4_0` amendment

**Category:** SDK Bug
**Severity:** High
**Library/Protocol:** `xrpl.js@5.2.0-beta.0` / `beta.1` · rippled v3.4.0-rc5 with `fixCleanup3_4_0` active

**Description:**
`xrpl.signLoanSetByCounterparty` signs the borrower's `CounterpartySignature` field using `encodeForSigning`, which applies the standard transaction signing prefix `0x53545800` (`STX\0`). The `fixCleanup3_4_0` amendment, active on Devnet with rippled v3.4.0-rc5, changed the expected signing context for counterparty signatures to a distinct hash prefix `0x43505400` (`CPT\0`) to prevent counterparty signatures from being replayed as first-party signatures. The correct function — `encodeForSigningCounterparty` — is already exported from `ripple-binary-codec`, but `signLoanSetByCounterparty` does not call it. The result is a structurally valid serialized transaction with a cryptographically invalid signature, and rippled returns an error that gives no indication of the underlying prefix mismatch.

**Reproduction:**

```
1. Build a valid LoanSet tx; broker signs with wallet.sign().
2. Call xrpl.signLoanSetByCounterparty(borrowerWallet, brokerSigned.tx_blob).
3. Submit fullySignedBlob to a node running rippled >= 3.4.0 with fixCleanup3_4_0 active.
4. Observe: "fails local checks: Counterparty: Invalid signature"
```

**Impact:**
This bug blocks every two-party loan flow on Devnet without exception. Diagnosing it required reading `ripple-binary-codec` internals and the C++ rippled source to identify the prefix mismatch; every developer on the lending track faces the same dead-end. The manual workaround — decoding the signed blob, re-signing with `encodeForSigningCounterparty`, and re-encoding — must be applied to every `LoanSet` transaction in the prototype.

**Proposed fix:**
1. In `Wallet/counterpartySigner.js`, replace `encodeForSigning(tx)` with `encodeForSigningCounterparty(tx)` on the single-sign path and `encodeForMultisigningCounterparty` on the multisign path. Both are already exported from `ripple-binary-codec`; the fix is two one-line substitutions.
2. Add a note to the XLS-66 tutorial stating that `signLoanSetByCounterparty` requires rippled `< 3.4.0` or a patched SDK build until this fix ships, so developers on Devnet know to use the manual `encodeForSigningCounterparty` path.
3. Improve the `"Counterparty: Invalid signature"` error message to indicate a signing-prefix mismatch, directing developers to verify which `encodeFor*` variant was used rather than assuming key or format errors.

---

### DX-12 — `GracePeriod` opens the payment window BEFORE `NextPaymentDue`, not after

**Category:** API Confusion
**Severity:** High
**Library/Protocol:** `xrpl.js@5.2.0-beta.1` · XLS-66 V1.1

**Description:**
`NextPaymentDue` in the `Loan` ledger object is the hard deadline — a payment must be validated in a ledger whose `close_time` is less than or equal to `NextPaymentDue`. `GracePeriod` does not extend the window past the deadline; it defines how early the window opens. The effective payment window is `[NextPaymentDue - GracePeriod, NextPaymentDue)`. With `GracePeriod = PaymentInterval = 300s`, the payment window opens at loan creation and closes exactly 300 seconds later. The term "GracePeriod" universally implies a post-deadline extension in financial and software contexts; the XLS-66 semantic is the exact opposite, and the field name alone will consistently mislead developers.

**Reproduction:**

```typescript
// LoanSet with GracePeriod = 300, PaymentInterval = 300
// NextPaymentDue = StartDate + 300

// Submit LoanPay 3 seconds after NextPaymentDue
// → tecEXPIRED
// tx hash: CB58FE571CBAC0D552CD12DEA9B29F78ADFD9A4489ECD8E5423F7183780F2E36
```

**Impact:**
The first `LoanPay` attempt in this prototype failed with `tecEXPIRED` despite being submitted only 3 seconds past `NextPaymentDue`. Resolving the failure required computing XRPL epoch offsets by hand to confirm the submission was actually late, then auditing the spec to understand why a "grace period" produced a narrower — not wider — window. The workaround requires targeting `NextPaymentDue - 30s` as the submission point and adding an upfront abort guard for `xrplTimeNow() >= NextPaymentDue`.

**Proposed fix:**
1. In the XLS-66 spec and `LoanSet` documentation, rename the field to `EarlyPaymentWindow` (or equivalent) to accurately describe its semantic, or add a prominent callout with a diagram showing the window as `[NextPaymentDue - GracePeriod, NextPaymentDue)`.
2. Improve the `tecEXPIRED` error response for `LoanPay` to include the payment deadline and the submission close time in the error metadata, so developers can immediately see the epoch delta rather than computing it manually.

---

### DX-05 — `VaultKind`, `SubscriptionDate`, `RedemptionDate` are XLS-65 V1.1 fields completely absent from published VaultCreate docs

**Category:** DOC GAP
**Severity:** High
**Library/Protocol:** XLS-65 V1.1 · XRPL Devnet (rippled v3.4.0-rc5)

**Description:**
Submitting `LoanBrokerSet` against a vault created without `VaultKind: 1` returns `tecNO_PERMISSION` with the message "account doesn't own vault" — factually incorrect when the submitting account is the vault owner. The actual requirement — that `LoanBrokerSet` only works on closed-ended vaults — appears nowhere in the VaultCreate docs, the LoanBrokerSet docs, or any XLS-66 tutorial. Adding `VaultKind: 1` then exposes a second undocumented requirement: closed-ended vaults require `SubscriptionDate` and `RedemptionDate` in the `VaultCreate` transaction. None of these three fields appear on the published VaultCreate reference page; they are XLS-65 V1.1 extension fields that were discovered only by reading binary codec field definitions.

**Reproduction:**

```
1. VaultCreate with no VaultKind → LoanBrokerSet → tecNO_PERMISSION
   ("account doesn't own vault" — misleading; caller is the vault owner)
2. VaultCreate with VaultKind: 1, no dates → ledger error:
   "A close-ended vault requires both SubscriptionDate and RedemptionDate"
3. Add SubscriptionDate and RedemptionDate as XRPL epoch integers
   → VaultCreate succeeds; LoanBrokerSet succeeds.
```

**Impact:**
Without documentation of these fields, building a closed-ended vault requires iterative discovery through error messages and source code inspection. Each failed `VaultCreate` attempt consumes an on-chain fee and, in a live timed protocol, wastes a subscription window while the developer iterates.

**Proposed fix:**
1. Add `VaultKind` (UInt8, 0 = open, 1 = closed), `SubscriptionDate` (XRPL epoch, required for closed), and `RedemptionDate` (XRPL epoch, required for closed) to the VaultCreate doc page. Include the ripple-epoch conversion formula: `const xrplTime = Math.floor(Date.now() / 1000) - 946684800`.
2. Add a note to the LoanBrokerSet doc page: "The referenced vault must be closed-ended (`VaultKind: 1`). Submitting against an open-ended vault returns `tecNO_PERMISSION`."
3. Fix the `tecNO_PERMISSION` error text from "account doesn't own vault" to a message that identifies the actual constraint (vault type mismatch), reducing the false-path debugging time.

---

### DX-08 — `VaultCreate` requires `tfVaultPrivate` flag when `DomainID` is set — undocumented coupling

**Category:** DOC GAP
**Severity:** High
**Library/Protocol:** `xrpl.js@5.2.0-beta.1` · rippled Devnet (XLS-65 V1.1 + XLS-80)

**Description:**
Setting `DomainID` on a `VaultCreate` transaction without also setting the `tfVaultPrivate` flag (`0x10000`) causes the ledger to reject with: `"Cannot set DomainID unless tfVaultPrivate flag is set."` The coupling between the domain field and the private flag is not documented in the XLS-65 V1.1 spec, the VaultCreate reference page, or any XLS-80 integration guide. A developer who correctly identifies `DomainID` as the field name (itself non-obvious — see DX-07) will encounter this second error with no breadcrumb to the flag requirement. The flag `tfVaultPrivate` is further undiscoverable through normal means: the VaultCreate docs do not list available flags, and `xrpl.js` exports no TypeScript constant for it.

**Reproduction:**

```typescript
// Step 1 — fails: wrong field name (DX-07)
{ TransactionType: 'VaultCreate', ..., PermissionedDomainID: domainId }

// Step 2 — fails: missing flag (DX-08)
{ TransactionType: 'VaultCreate', ..., Flags: 0, DomainID: domainId }
// → "Cannot set DomainID unless tfVaultPrivate flag is set."

// Step 3 — succeeds
{ TransactionType: 'VaultCreate', ..., Flags: 0x10000, DomainID: domainId }
```

**Impact:**
This is a two-step documentation gap that costs two full development cycles to resolve, with each failed VaultCreate attempt consuming an on-chain subscription window in a live timed protocol. The flags table for VaultCreate is entirely absent from the published documentation, meaning any developer using flags must discover them through binary codec inspection.

**Proposed fix:**
1. Add a `Flags` table to the VaultCreate doc page listing `tfVaultPrivate` (`0x10000`) with description: "Required when `DomainID` is set. Marks the vault as private; only depositors whose credentials satisfy the domain's `AcceptedCredentials` list may call `VaultDeposit`."
2. Export a `VaultCreateFlags` enum from `xrpl.js` (matching existing `PaymentFlags`, `OfferCreateFlags`) containing at minimum `tfVaultPrivate` and `tfVaultShareNonTransferable`.
3. Add an end-to-end XLS-80 integration example showing the full sequence: `PermissionedDomainSet` → `VaultCreate` with `DomainID + tfVaultPrivate` → credentialed `VaultDeposit` → uncredentialed rejection.

---

### DX-09 — `MPTokenIssuanceSet` returns `tecNO_PERMISSION` on vault-managed share MPTs

**Category:** API Confusion
**Severity:** High
**Library/Protocol:** `xrpl.js@5.2.0-beta.1` · rippled Devnet (XLS-65 V1.1 + XLS-33)

**Description:**
When a closed-ended vault is created, XLS-65 V1.1 automatically creates an MPToken Issuance for the vault's share token. The vault owner (broker) would reasonably expect to configure this issuance — for example, setting `lsfMPTRequireAuth` via `MPTokenIssuanceSet` to control secondary share transfers. Submitting `MPTokenIssuanceSet` with `tfMPTSetRequireAuth` (`Flags: 0x0008`) from the broker account returns `tecNO_PERMISSION`. The vault ledger object, not the vault owner, controls the share MPT; brokers have no direct access to modify its flags. This is a compliance gap: a credential-gated vault (`DomainID` set) can restrict who initially mints shares, but once minted, those shares may be transferred to accounts that self-create an `MPToken` entry via `MPTokenAuthorize`, since `lsfMPTRequireAuth` is absent and cannot be set post-creation.

**Reproduction:**

```typescript
const setAuthTx = {
  TransactionType: 'MPTokenIssuanceSet',
  Account: broker.classicAddress,      // vault owner
  MPTokenIssuanceID: vault.ShareMPTID, // vault's auto-created share MPT
  Flags: 0x0008,                       // tfMPTSetRequireAuth
};
// Submit → tecNO_PERMISSION
```

**Impact:**
The compliance perimeter of a permissioned vault is materially weaker than a developer would infer from the XLS-80 + XLS-65 combination. Discovering this limitation required trial-and-error followed by reading the XLS-33 spec to understand that vault-managed issuances are outside broker control. The mismatch between the expected and actual authorization model could cause production deployments to inadvertently allow uncredentialed secondary share transfers.

**Proposed fix:**
1. Document on the XLS-65 VaultCreate page that the vault autonomously manages the share MPT issuance and that `MPTokenIssuanceSet` cannot be called on vault-managed MPTs by the vault owner. Note that `tfVaultShareNonTransferable` at VaultCreate time is the only mechanism to restrict all secondary transfers.
2. Expose a `VaultShareMPTConfig` parameter or equivalent in `VaultCreate` to allow brokers to specify MPT issuance flags (e.g., `RequireAuth`, transfer restrictions) at creation time.
3. Change the `tecNO_PERMISSION` error message when the caller is the vault owner to explicitly state: "Vault share MPT issuances are managed by the vault ledger object and cannot be modified via MPTokenIssuanceSet."

---

### DX-02 — Devnet WebSocket exposes only port 51233, blocked by corporate and ISP firewalls

**Category:** Infrastructure
**Severity:** High
**Library/Protocol:** `xrpl.js@5.2.0-beta.0` · XRPL public Devnet

**Description:**
The XRPL public Devnet WebSocket endpoint (`wss://s.devnet.rippletest.net:51233`) exposes only port 51233. This is a non-standard port that many corporate firewalls and some consumer ISPs block by default, and no fallback on port 443 exists for the public Devnet. When port 51233 is blocked, `xrpl.js` silently times out after 5 seconds with an error message that points to the server being blocked or inaccessible, but provides no guidance on which port to check, how to distinguish DNS from TCP-layer failures, or whether an alternative endpoint exists. DNS resolves correctly (4 IPs are returned) but TCP SYN on port 51233 never receives a response, making the failure appear identical to a Devnet outage.

**Reproduction:**

```
1. Install xrpl.js@5.2.0-beta.0.
2. Run: new Client('wss://s.devnet.rippletest.net:51233/'); await client.connect();
   — behind a network that blocks non-standard ports (corporate/event WiFi).
3. Observe: "connect() timed out after 5000 ms. If your internet connection is
   working, the rippled server may be blocked or inaccessible."
   — no port, no diagnostic command, no alternative endpoint suggested.
```

**Impact:**
Developers at venues with restrictive networks — exactly the setting of a hackathon — are silently blocked from connecting to Devnet. The Testnet already has a port-443 endpoint (`wss://s.altnet.rippletest.net:443`); the absence of an equivalent for Devnet is an asymmetry that disproportionately affects participants in controlled network environments.

**Proposed fix:**
1. Expose port 443 on the public Devnet (`wss://s.devnet.rippletest.net:443`). Virtually all networks permit outbound HTTPS. This single infrastructure change unblocks developers on restricted networks without any SDK or documentation changes.
2. Improve the `xrpl.js` timeout error message to include the hostname and port in use, plus a one-line diagnostic: `"connect() timed out on wss://s.devnet.rippletest.net:51233. Port 51233 may be blocked. Verify with: nc -zv s.devnet.rippletest.net 51233."` A specific diagnostic command eliminates the time spent distinguishing network vs. code vs. server failures.

---

### DX-10 — `VaultDeposit` domain gate creates implicit MPT transfer barrier via MPToken entry requirement

**Category:** DOC GAP
**Severity:** Medium
**Library/Protocol:** `xrpl.js@5.2.0-beta.1` · rippled Devnet (XLS-65 V1.1 + XLS-33 + XLS-80)

**Description:**
When a vault has `DomainID` set, uncredentialed accounts cannot call `VaultDeposit`. Because no `MPToken` ledger object is ever created for an account that never deposits, a subsequent attempt to transfer vault shares to that account via a `Payment` transaction fails with `tecNO_AUTH`. The failure is behaviorally correct — uncredentialed accounts should not hold shares — but the error code is misleading: `tecNO_AUTH` implies explicit MPT authorization was required and denied, whereas the actual cause is a missing `MPToken` entry object. A developer reading `tecNO_AUTH` will look for `lsfMPTRequireAuth` and not find it set, since vault-managed share MPTs do not have that flag and it cannot be applied post-creation (DX-09). Further, an uncredentialed account can self-create an `MPToken` entry via `MPTokenAuthorize` when `lsfMPTRequireAuth` is absent, meaning a subsequent `Payment` of shares to that account would succeed — the domain gate at deposit time does not close the secondary-transfer path.

**Reproduction:**

```typescript
// 1. Create vault with DomainID (credential gate)
// 2. InvestorA (credentialed) deposits → MPToken entry created for A
// 3. Uncredentialed tries VaultDeposit → rejected (domain gate)
//    → Uncredentialed has no MPToken entry
// 4. InvestorA transfers shares to Uncredentialed:
const payTx = {
  TransactionType: 'Payment',
  Account: investorA.classicAddress,
  Destination: uncredentialed.classicAddress,
  Amount: { mpt_issuance_id: vault.ShareMPTID, value: '1000000' },
};
// → tecNO_AUTH (no MPToken entry for destination)
// 5. Uncredentialed calls MPTokenAuthorize (allowed — lsfMPTRequireAuth not set)
//    → MPToken entry created; subsequent Payment succeeds
```

**Impact:**
The interaction between XLS-80 domain gating, XLS-65 share MPT management, and XLS-33 MPToken entry creation is undocumented across all three specifications. Developers building compliance-sensitive products may deploy vaults under the assumption that a `DomainID` gate provides end-to-end share transfer control, when in fact it applies only at the deposit stage.

**Proposed fix:**
1. Add a note to the XLS-65 VaultCreate documentation: vault-managed share MPTs do not have `lsfMPTRequireAuth` set; secondary transfers to accounts without an `MPToken` entry fail with `tecNO_AUTH`. Clarify that the domain gate applies only at `VaultDeposit` time, not to secondary transfers.
2. Add a security warning: credential-gated vaults with `DomainID` may still permit uncredentialed accounts to self-create `MPToken` entries and receive shares via secondary transfer. If strict shareholder whitelisting is required, use `tfVaultShareNonTransferable` at VaultCreate time.
3. Improve the XLS-33 `tecNO_AUTH` error to distinguish between rejection due to a missing authorization flag and rejection due to a missing `MPToken` entry object.

---

### DX-11 — `CredentialCreate` is not idempotent — re-running setup fails with `tecDUPLICATE`

**Category:** API Confusion
**Severity:** Medium
**Library/Protocol:** `xrpl.js@5.2.0-beta.1` · rippled Devnet (XLS-70)

**Description:**
`CredentialCreate` returns `tecDUPLICATE` if a credential with the same `(Issuer, Subject, CredentialType)` tuple already exists on-chain, with no indication that the credential already exists. Credentials persist indefinitely unless their `Expiration` lapses or they are explicitly deleted. A setup script that issues credentials without first checking for existing ones will succeed on first run and fail on every subsequent run — for example, after a vault lifecycle reset or when a new team member clones the repo and runs setup. The same non-idempotency applies to `CredentialAccept` (which fails silently if `lsfAccepted` is already set) and `PermissionedDomainSet` (which creates a second domain object instead of updating the existing one).

**Reproduction:**

```typescript
// Run once — succeeds
CredentialCreate { Issuer: broker, Subject: investorA, CredentialType: '4B59435F5645524946494544' }

// Re-run without checking → tecDUPLICATE
CredentialCreate { Issuer: broker, Subject: investorA, CredentialType: '4B59435F5645524946494544' }
```

**Impact:**
Non-idempotent setup operations are disproportionately disruptive in hackathon and CI/CD contexts, where scripts are frequently re-run. The required workaround — querying `account_objects { type: 'credential' }` before each `CredentialCreate` and checking `lsfAccepted` before each `CredentialAccept` — adds boilerplate to every setup script and is not documented anywhere near the `CredentialCreate` reference.

**Proposed fix:**
1. Add a note to the XLS-70 tutorial and the `CredentialCreate` documentation that the operation is not idempotent, and provide the idempotency check pattern: query `account_objects { type: 'credential' }` before submitting, filter on `(Issuer, Subject, CredentialType)`, and skip if a match is found.
2. Improve the `tecDUPLICATE` error message in the `CredentialCreate` context to read: "A credential with this (Issuer, Subject, CredentialType) already exists on-chain."
3. Add an `upsertCredential` helper to `xrpl.js` that handles the check-and-skip pattern automatically, analogous to how `autofill` handles fee and sequence number management.

---

## Overall recommendations

- **Close the specification-to-documentation lag.** Five of the eight findings in this report (DX-05, DX-08, DX-09, DX-10, DX-12) stem from a protocol implementation that is ahead of its published documentation. XLS-65 V1.1 fields (`VaultKind`, `SubscriptionDate`, `RedemptionDate`), flag requirements (`tfVaultPrivate`), ledger constraints (vault-managed MPT ownership), and semantics that deviate from naming conventions (`GracePeriod`) should all be in the reference docs before a spec version is declared available on Devnet. A documentation freeze matching the spec version would prevent developers from discovering implementation details through error messages and source code.

- **Update SDK helpers whenever an amendment changes protocol semantics.** DX-06 shows that `signLoanSetByCounterparty` continued shipping the pre-amendment signing path after `fixCleanup3_4_0` changed the required hash prefix on Devnet. SDK helpers that wrap protocol-specific signing, encoding, or serialization logic should be reviewed as part of every amendment activation, not as a follow-up. A CI test that submits a live `LoanSet` against a node with `fixCleanup3_4_0` active would have caught this regression immediately.

- **Add port 443 to the public Devnet and standardize connection diagnostics.** DX-02 and DX-03 together show that the Devnet connectivity stack is not hardened for developer environments. Exposing port 443 on the Devnet (already available on Testnet) and increasing the default `connectionTimeout` to 15–20 seconds would eliminate the highest-frequency onboarding failure mode. Pairing these with improved error messages that include the port number and a one-line diagnostic command would cut the time to root-cause network issues from tens of minutes to seconds.

- **Align error messages with the actual constraint, not the transactional one.** Four findings (DX-05, DX-06, DX-09, DX-11) involve error messages that are either silent (`tecNO_PERMISSION` with no context), misleading ("account doesn't own vault" when the caller is the owner, `tecNO_AUTH` when no authorization flag is set), or generic (`tecDUPLICATE` with no field context). Each of these caused multi-hour debugging sessions that a more specific error string would have resolved in minutes. An error taxonomy review across the new XLS-65/66/80 transactions — where existing `tec` codes are being reused in new contexts — would yield high-value improvements with minimal implementation cost.

- **Publish cross-spec interaction guides for protocol combinations.** Track 2 (Loaded) combines XLS-65 + XLS-66 + XLS-80 + XLS-33 in a single integration. The interactions between these specs — particularly how the XLS-80 domain gate at `VaultDeposit` interacts with XLS-33 `MPToken` entry creation and secondary transfer authorization (DX-10), and how XLS-65 vault ownership relates to XLS-33 MPT issuance control (DX-09) — are not covered in any single document. Each spec is written in isolation; a dedicated integration guide or a "combining protocols" section in the developer portal would significantly reduce the discovery cost for developers building on the full Loaded stack.
