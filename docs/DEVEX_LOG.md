# XRPL Developer Experience Log

Captured during hackathon development — Track 2 Loaded (Permissioned Domains + MPT shares).  
Environment: XRPL public Devnet · Library: `xrpl.js@5.2.0-beta.1` · Protocol: XLS-65/66 V1.1  
*(Findings DX-01 through DX-06 were observed on `xrpl.js@5.2.0-beta.0`; project upgraded to beta.1 per organizer update on 2026-09-13.)*

Severity scale: **Low** (minor inconvenience) · **Medium** (workaround required) · **High** (blocks progress or correctness)

---

## Index

| ID | Title | Category | Severity |
|---|---|---|---|
| [DX-01](#dx-01--interestrate-annualized-formula-produces-unobservable-yield-in-short-duration-vaults) | `InterestRate` annualized formula produces unobservable yield in short-duration vaults | Documentation / UX | Medium |
| [DX-02](#dx-02--devnet-websocket-exposes-only-port-51233-blocked-by-corporate-and-isp-firewalls) | Devnet WebSocket exposes only port 51233, blocked by corporate / ISP firewalls | Infrastructure / DevEx | High |
| [DX-03](#dx-03--xrpljs-default-5s-connectiontimeout-too-short-for-mobile--event-networks) | xrpl.js default 5s `connectionTimeout` too short for mobile / event networks | SDK / UX | Medium |
| [DX-04](#dx-04--vault_info-response-shape-undocumented-key-is-resultvault-not-resultvault_data) | `vault_info` response shape undocumented — key is `result.vault`, not `result.vault_data` | API Confusion | Low |
| [DX-05](#dx-05--vaultkind-subscriptiondate-redemptiondate-are-xls-65-v11-fields-completely-absent-from-published-vaultcreate-docs) | `VaultKind`, `SubscriptionDate`, `RedemptionDate` — XLS-65 V1.1 fields absent from VaultCreate docs | Documentation Gap | High |
| [DX-06](#dx-06--signloansetbycounterparty-uses-wrong-signing-prefix-after-fixcleanup3_4_0-amendment) | `signLoanSetByCounterparty` uses wrong signing prefix after `fixCleanup3_4_0` amendment | SDK Bug | High |
| [DX-07](#dx-07--vaultcreate-field-for-permissioned-domain-is-domainid-not-permissioneddomainid) | `VaultCreate` field for Permissioned Domain is `DomainID`, not `PermissionedDomainID` | DOC GAP | Medium |
| [DX-08](#dx-08--vaultcreate-requires-tfvaultprivate-flag-when-domainid-is-set-undocumented-coupling) | `VaultCreate` requires `tfVaultPrivate` flag when `DomainID` is set — undocumented coupling | DOC GAP | High |
| [DX-09](#dx-09--mptokenisuanceset-with-tfmptseterequireauth-returns-tecno_permission-on-vault-share-mpts) | `MPTokenIssuanceSet` with `tfMPTSetRequireAuth` returns `tecNO_PERMISSION` on vault share MPTs | API Confusion | High |
| [DX-10](#dx-10--vaultdeposit-domain-gate-creates-implicit-mpt-transfer-barrier-via-mptoken-entry-requirement) | `VaultDeposit` domain gate creates implicit MPT transfer barrier via MPToken entry requirement | DOC GAP | Medium |
| [DX-11](#dx-11--credentialcreate-is-not-idempotent-re-running-c1-setup-fails-with-tecduplicate) | `CredentialCreate` is not idempotent — re-running setup fails with `tecDUPLICATE` | API Confusion | Medium |
| [DX-12](#dx-12--graceperiod-in-loanset-opens-the-payment-window-before-nextpaymentdue-not-after) | `GracePeriod` in `LoanSet` opens payment window BEFORE `NextPaymentDue`, not after | API Confusion | High |

---

## DX-01 — `InterestRate` annualized formula produces unobservable yield in short-duration vaults

**Category:** Documentation / UX  
**Severity:** Medium  
**Library:** `xrpl.js@5.2.0-beta.0` · XLS-66 V1.1  

### Description

The `InterestRate` field in `LoanSet` is an annualized rate expressed in 1/10th basis points (max `100000` = 100% p.a.). For vaults with compressed Investment phases — as required for hackathon demos or integration tests — this formula produces negligible interest amounts regardless of the rate set.

At the maximum rate of `100000` (100% annualized), a 10-minute single-payment loan on 10,000 XRP yields:

```
interest = 10,000 × 1.0 × (600 / 31,536,000) ≈ 0.19 XRP
PPS delta ≈ 0.000019  (effectively invisible)
```

Even at 100% annualized, PPS does not move in any perceptible way over a sub-hour Investment window. The only practical workaround is to inject yield separately via `VaultDeposit` with `tfVaultDonation`, a mechanism designed for donations — not for simulating loan interest returns. This means the core yield mechanic of the protocol cannot be demonstrated end-to-end without an out-of-band injection step that is not documented as the expected pattern.

This also affects CI/CD pipelines and any integration test that tries to assert PPS growth after a repayment: tests will pass structurally but fail to validate the yield math in any meaningful way without unrealistically long `PaymentInterval` values.

### Reproduction

1. Create a closed-ended vault with Investment phase of 10 minutes.
2. Submit `LoanSet` with `InterestRate: 100000`, `PrincipalRequested: 10000`, `PaymentTotal: 1`, `PaymentInterval: 600`.
3. Submit repayment after drawdown.
4. Observe: PPS delta < 0.00002; `AssetsTotal` increase is sub-XRP.

### Proposed fix

Two complementary improvements:

1. **Add a `PaymentIntervalRate` field** (or equivalent) to `LoanSet` that expresses interest as a flat per-period rate rather than an annualized fraction. This would allow short-duration loans to produce observable yield without requiring astronomically unrealistic annualized rates.

2. **Document the `tfVaultDonation` pattern explicitly** as the recommended approach for test and demo environments. The current docs describe `tfVaultDonation` only as a donation mechanism. A dedicated section — "Simulating yield in short-duration vaults" — would prevent developers from discovering this workaround by accident and would clarify that `InterestRate`-computed interest is insufficient for sub-day vaults.

---

## DX-02 — Devnet WebSocket exposes only port 51233, blocked by corporate / ISP firewalls

**Category:** Infrastructure / DevEx  
**Severity:** High  
**Library:** `xrpl.js@5.2.0-beta.0` · XRPL public Devnet  

### Description

The XRPL public Devnet WebSocket endpoint (`wss://s.devnet.rippletest.net:51233`) exposes only port 51233 for WSS connections. Port 51233 is a non-standard port that many corporate firewalls and some consumer ISPs block by default. There is no fallback on port 443 (standard HTTPS/WSS) for the public Devnet.

When a developer installs `xrpl.js@5.2.0-beta.0` and runs a `server_info` smoke test from a network that blocks port 51233, the client silently times out after 5 seconds:

```
Smoke test FAILED: Error: connect() timed out after 5000 ms. If your internet
connection is working, the rippled server may be blocked or inaccessible.
You can also try setting the 'connectionTimeout' option in the Client constructor.
```

The error message points to the server being blocked but provides no guidance on:
- Which port to check
- How to verify DNS vs TCP-layer reachability independently
- Whether an alternative port or endpoint exists
- Whether the issue is the developer's network or a Devnet outage

DNS resolves correctly (4 IPs returned) but TCP SYN on port 51233 never receives a response. Developers at venues with restrictive networks (hackathons, office buildings, hotels) are silently dead in the water.

### Reproduction

1. Install `xrpl.js@5.2.0-beta.0`.
2. Create a minimal TypeScript file: `new Client('wss://s.devnet.rippletest.net:51233/'); await client.connect();`
3. Run behind a network that blocks non-standard ports (common in corporate/event WiFi).
4. Observe: `connect() timed out after 5000 ms` — no actionable diagnostic.

### Proposed fix

Two improvements:

1. **Expose port 443 on the public Devnet.** Virtually all networks permit outbound HTTPS (port 443). The Testnet already has `wss://s.altnet.rippletest.net:443` — the Devnet should have an equivalent. This single change unblocks developers on restricted networks without any SDK changes.

2. **Improve the timeout error message in xrpl.js.** Include the hostname and port in the error: *"connect() timed out on wss://s.devnet.rippletest.net:51233 after 5000 ms. Port 51233 may be blocked by your firewall. Verify with: `nc -zv s.devnet.rippletest.net 51233`."* A one-line diagnostic command dramatically reduces the time to root-cause network vs. code issues.

---

## DX-03 — xrpl.js default 5s `connectionTimeout` too short for mobile / event networks

**Category:** SDK / UX  
**Severity:** Medium  
**Library:** `xrpl.js@5.2.0-beta.0`

### Description

The `Client` constructor in xrpl.js defaults to `connectionTimeout: 5000` ms. On mobile hotspots and event venue networks (high latency, shared bandwidth), the initial TLS + WebSocket handshake to the Devnet reliably exceeds 5 seconds, causing `connect()` to throw:

```
connect() timed out after 5000 ms. If your internet connection is working,
the rippled server may be blocked or inaccessible.
```

TCP connectivity on port 51233 was confirmed working (`net.createConnection` succeeded), but xrpl.js rejected the connection before the handshake completed. The workaround — passing `{ connectionTimeout: 20000 }` to the `Client` constructor — is not mentioned in the getting-started docs or any quickstart example.

Because the error message says "the rippled server may be blocked or inaccessible," developers correctly diagnose this as a network/firewall issue (DX-02) and spend time on that path before discovering the real cause is a too-short client-side timeout.

### Reproduction

1. On a mobile hotspot or high-latency network, confirm TCP port 51233 is reachable (`net.createConnection` succeeds).
2. Run `new Client('wss://s.devnet.rippletest.net:51233/'); await client.connect();` with default options.
3. Observe: `connect() timed out after 5000 ms` despite TCP being open.
4. Pass `{ connectionTimeout: 20000 }` — connection succeeds.

### Proposed fix

Two improvements:

1. **Increase the default `connectionTimeout` to 15–20 seconds.** A 5s default is appropriate for production mainnet from a data-center; it is not appropriate for developer laptops on event or mobile networks. The cost of a longer default is negligible (scripts wait a bit longer on fast networks); the benefit is eliminating a common false-negative failure mode.

2. **Document `connectionTimeout` in the quickstart and getting-started examples.** A one-line note — *"On slow networks, pass `{ connectionTimeout: 15000 }` to the Client constructor"* — would prevent developers from misdiagnosing this as a firewall or server issue.

---

## DX-04 — `vault_info` response shape undocumented — key is `result.vault`, not `result.vault_data`

**Category:** API Confusion  
**Severity:** Low  
**Library:** `xrpl.js@5.2.0-beta.0` · XRPL Devnet (rippled v3.4.0-rc5)

### Description

Calling `vault_info` via `client.request({ command: 'vault_info', vault_id })` places the Vault ledger object at `result.vault`. The official rippled API reference does not document the response envelope for `vault_info`, so the correct key must be discovered by trial and error.

Natural guesses all return `undefined`:

```typescript
vaultInfo.result.vault_data  // undefined (snake_case)
vaultInfo.result.Vault       // undefined (PascalCase matching ledger type)
vaultInfo.result.vault       // ✓ correct
```

Sub-fields such as `AssetsAvailable`, `AssetsTotal`, and phase dates (`SubscriptionDate`, `RedemptionDate`) are similarly unspecified, requiring developers to log the full response object to discover available fields.

### Reproduction

1. Create a vault via `VaultCreate`.
2. Call `client.request({ command: 'vault_info', vault_id: '...' })`.
3. Inspect `result` — observe the key is `result.vault`, not `result.vault_data` or `result.Vault`.

### Proposed fix

Add a `vault_info` response schema to the rippled API reference alongside the request parameters. At minimum, document the top-level key (`result.vault`) and the most-used sub-fields: `Owner`, `VaultKind`, `AssetsAvailable`, `AssetsTotal`, `SubscriptionDate`, `RedemptionDate`.

---

## DX-05 — `VaultKind`, `SubscriptionDate`, `RedemptionDate` are XLS-65 V1.1 fields completely absent from published VaultCreate docs

**Category:** Documentation Gap  
**Severity:** High  
**Library:** XLS-65 V1.1 · XRPL Devnet (rippled v3.4.0-rc5)

### Description

Submitting `LoanBrokerSet` against an open-ended vault (`VaultKind` absent, defaults to 0) returns `tecNO_PERMISSION`. The error message reads *"account doesn't own vault"* — factually incorrect; the broker is the vault owner. The real requirement — that `LoanBrokerSet` only works on **closed-ended vaults** (`VaultKind: 1`) — appears nowhere in the VaultCreate docs, the LoanBrokerSet docs, or any XLS-66 tutorial.

Once `VaultKind: 1` was added, a second blocker appeared immediately: closed-ended vaults require both `SubscriptionDate` and `RedemptionDate` in the `VaultCreate` transaction. Omitting either returns a runtime error from the ledger:

```
A close-ended vault requires both SubscriptionDate and RedemptionDate
```

Neither `VaultKind`, `SubscriptionDate`, nor `RedemptionDate` appear on the published VaultCreate reference page; they are XLS-65 V1.1 extension fields. Discovering these fields and their semantics required reading binary codec field definitions and inspecting the reference application source code.

Additionally, the dates must be supplied as **XRPL ripple-epoch integers** (Unix timestamp − 946684800). This conversion is not documented near the field definitions.

### Reproduction

1. `VaultCreate` with no `VaultKind` → `LoanBrokerSet` → `tecNO_PERMISSION`.
2. `VaultCreate` with `VaultKind: 1`, no dates → ledger error: *"close-ended vault requires both SubscriptionDate and RedemptionDate"*.
3. Add `SubscriptionDate` and `RedemptionDate` as XRPL epoch integers → VaultCreate succeeds; LoanBrokerSet succeeds.

### Proposed fix

1. **VaultCreate doc page:** Add `VaultKind` (UInt8, 0 = open, 1 = closed), `SubscriptionDate` (XRPL epoch, required for closed), and `RedemptionDate` (XRPL epoch, required for closed). Include the ripple-epoch formula and a JavaScript snippet: `const xrplTime = Math.floor(Date.now() / 1000) - 946684800`.
2. **LoanBrokerSet doc page:** Add a note: *"The referenced vault must be closed-ended (`VaultKind: 1`). Submitting against an open-ended vault returns `tecNO_PERMISSION`."*
3. **Fix the error message:** `tecNO_PERMISSION` with text *"account doesn't own vault"* is misleading when the real cause is vault type. A more specific error code or message would save significant debugging time.

---

## DX-06 — `signLoanSetByCounterparty` uses wrong signing prefix after `fixCleanup3_4_0` amendment

**Category:** SDK Bug  
**Severity:** High  
**Library:** `xrpl.js@5.2.0-beta.0` · rippled v3.4.0-rc5 with `fixCleanup3_4_0` active

### Description

`xrpl.signLoanSetByCounterparty` signs the borrower's `CounterpartySignature` field using `encodeForSigning`, which applies the standard transaction signing prefix `0x53545800` (`STX\0`). The `fixCleanup3_4_0` amendment (active on Devnet with rippled v3.4.0-rc5) changed the expected signing context for counterparty signatures to a distinct hash prefix `0x43505400` (`CPT\0`), specifically to prevent counterparty signatures from being replayed as first-party signatures.

`ripple-binary-codec` already exports the correct function (`encodeForSigningCounterparty`) with the right prefix, but `signLoanSetByCounterparty` does not call it. The result is a structurally valid `CounterpartySignature` object in the serialized transaction binary, but with a cryptographically invalid signature. rippled returns:

```
fails local checks: Counterparty: Invalid signature
```

The error gives no indication of a prefix mismatch, making the root cause extremely difficult to identify without reading binary codec internals or the C++ rippled source.

### Workaround (applied in this prototype)

```typescript
import { encode, decode, encodeForSigningCounterparty } from 'ripple-binary-codec';
import { sign as keypairSign } from 'ripple-keypairs';

const brokerSignedTx = decode(brokerSigned.tx_blob) as Record<string, unknown>;
const counterpartySignBytes = encodeForSigningCounterparty(brokerSignedTx);
brokerSignedTx.CounterpartySignature = {
  SigningPubKey: borrower.publicKey,
  TxnSignature: keypairSign(counterpartySignBytes, borrower.privateKey),
};
const fullySignedBlob = encode(brokerSignedTx);
```

### Reproduction

1. Build a valid `LoanSet` tx; broker signs with `wallet.sign()`.
2. Call `xrpl.signLoanSetByCounterparty(borrowerWallet, brokerSigned.tx_blob)`.
3. Submit `fullySigned.tx_blob` to a node running rippled ≥ 3.4.0 with `fixCleanup3_4_0` active.
4. Observe: `fails local checks: Counterparty: Invalid signature`.

### Proposed fix

Update `signLoanSetByCounterparty` in xrpl.js to use `encodeForSigningCounterparty` (single-sign path) and `encodeForMultisigningCounterparty` (multisign path). Both are already exported from `ripple-binary-codec`. The fix is two one-line changes in `Wallet/counterpartySigner.js`:

```js
// Single-sign counterparty (replace encodeForSigning with encodeForSigningCounterparty)
TxnSignature: sign(encodeForSigningCounterparty(tx), wallet.privateKey),

// Multisign counterparty (replace encodeForMultisigning with encodeForMultisigningCounterparty)
TxnSignature: computeSignature(tx, wallet.privateKey, multisignAddress), // via encodeForMultisigningCounterparty
```

Also update the XLS-66 tutorial to note that `signLoanSetByCounterparty` requires rippled `< 3.4.0` or a patched SDK build until this fix ships.

**Note (2026-09-13):** Organizers updated the required library to `xrpl.js@5.2.0-beta.1`. This version may ship the `encodeForSigningCounterparty` fix — verify on first B1→B5 run. The manual CPT workaround in `scripts/05_investment.ts` is kept for safety until confirmed.

---

## DX-07 — `VaultCreate` field for Permissioned Domain is `DomainID`, not `PermissionedDomainID`

**Category:** DOC GAP  
**Severity:** Medium  
**Library:** `xrpl.js@5.2.0-beta.1` · rippled Devnet (XLS-65 V1.1 + XLS-80)  
**Date:** 2026-09-13

### Description

When linking a Permissioned Domain (XLS-80) to a vault at creation time, the field name that `VaultCreate` expects in the serialized transaction is `DomainID` — not `PermissionedDomainID`. Using `PermissionedDomainID` causes `ripple-binary-codec` to reject the transaction before it reaches the ledger:

```
Field PermissionedDomainID is not defined in the definitions
```

The name `PermissionedDomainID` is the natural, self-documenting choice a developer would infer from the object type (`PermissionedDomain`) and XRPL naming conventions (e.g. `VaultID`, `LoanID`). The actual codec field name `DomainID` is ambiguous — it shares a name with the unrelated `AccountRoot.Domain` (an account's web domain string) and gives no indication it refers to a Permissioned Domain specifically.

Discovery required grepping `ripple-binary-codec/dist/enums/definitions.json` directly for matching field names.

### Reproduction

```typescript
// Fails with "Field PermissionedDomainID is not defined in the definitions"
const vaultTx = {
  TransactionType: 'VaultCreate',
  ...
  PermissionedDomainID: domainId,  // ❌ wrong name
};

// Works
const vaultTx = {
  TransactionType: 'VaultCreate',
  ...
  DomainID: domainId,  // ✅ correct codec field name
};
```

### Proposed fix

1. **XLS-65 VaultCreate doc page:** Add a `DomainID` field entry (type: Hash256, optional) with description: *"Ledger index of a Permissioned Domain (XLS-80). When set, only depositors holding a credential accepted by this domain may call VaultDeposit."* Include a note explaining that the codec field name `DomainID` refers to an XLS-80 Permissioned Domain object, not the account `Domain` string field.
2. **ripple-binary-codec definitions:** Rename `DomainID` to `PermissionedDomainID` for clarity (or add an alias). The current name creates genuine ambiguity with `AccountRoot.Domain`.
3. **Error message improvement:** The codec error *"Field X is not defined in the definitions"* should suggest checking `ripple-binary-codec/dist/enums/definitions.json` or link to the codec field reference.

---

## DX-08 — `VaultCreate` requires `tfVaultPrivate` flag when `DomainID` is set — undocumented coupling

**Category:** DOC GAP  
**Severity:** High  
**Library:** `xrpl.js@5.2.0-beta.1` · rippled Devnet (XLS-65 V1.1 + XLS-80)  
**Date:** 2026-09-13

### Description

Setting `DomainID` on a `VaultCreate` transaction without also setting the `tfVaultPrivate` flag (`0x10000`) causes the ledger to reject the transaction:

```
Cannot set DomainID unless tfVaultPrivate flag is set.
```

The coupling between the domain field and the private flag is not documented in the XLS-65 V1.1 spec, the VaultCreate reference page, or any XLS-80 integration guide. A developer who correctly discovers `DomainID` (already non-obvious — see DX-07) will hit this second error with no breadcrumb to the flag requirement.

The flag name `tfVaultPrivate` is itself undiscoverable through normal means: the VaultCreate docs do not list available flags, and there is no TypeScript constant exported from `xrpl.js` for it. Discovery required grepping `ripple-binary-codec/dist/enums/definitions.json`.

This is a two-step documentation gap that costs two full development cycles (and two wasted vault subscription windows on a live timed network) to resolve.

### Reproduction

```typescript
// Step 1 — fails with DX-07 (wrong field name)
{ TransactionType: 'VaultCreate', ..., PermissionedDomainID: domainId }

// Step 2 — fails with DX-08 (missing flag)
{ TransactionType: 'VaultCreate', ..., Flags: 0, DomainID: domainId }
// → "Cannot set DomainID unless tfVaultPrivate flag is set."

// Step 3 — works
{ TransactionType: 'VaultCreate', ..., Flags: 0x10000, DomainID: domainId }
```

### Proposed fix

1. **VaultCreate doc page:** Add a `Flags` table listing `tfVaultPrivate` (`0x10000`) with description: *"Required when `DomainID` is set. Marks the vault as private; only depositors whose credentials satisfy the domain's `AcceptedCredentials` list may call `VaultDeposit`."*
2. **xrpl.js types:** Export a `VaultCreateFlags` enum (matching existing `PaymentFlags`, `OfferCreateFlags` etc.) containing at minimum `tfVaultPrivate` and `tfVaultShareNonTransferable`.
3. **XLS-80 integration guide:** Add an end-to-end code snippet showing `PermissionedDomainSet` → `VaultCreate` with `DomainID + tfVaultPrivate` → credentialed `VaultDeposit` → uncredentialed rejection, as a single discoverable example.

---

## DX-09 — `MPTokenIssuanceSet` with `tfMPTSetRequireAuth` returns `tecNO_PERMISSION` on vault share MPTs

**Category:** API Confusion  
**Severity:** High  
**Library:** `xrpl.js@5.2.0-beta.1` · rippled Devnet (XLS-65 V1.1 + XLS-33)  
**Date:** 2026-09-13

### Description

When a closed-ended vault is created, XLS-65 V1.1 automatically creates an MPToken Issuance for the vault's share token. The vault's `Owner` (broker) might reasonably expect to be able to configure this MPT issuance — for example, by setting `lsfMPTRequireAuth` via `MPTokenIssuanceSet` to control who can receive shares via secondary transfers.

Submitting `MPTokenIssuanceSet` with `tfMPTSetRequireAuth` (`Flags: 0x0008`) from the broker account (the same account that owns the vault) returns:

```
tecNO_PERMISSION
```

The vault ledger object, not the vault's owner, controls the share MPT issuance. Operators have no direct access to modify MPT flags on vault-managed issuances. The share MPT is effectively read-only from the broker's perspective: shares are minted/burned by the vault during `VaultDeposit`/`VaultWithdraw`, but the broker cannot add MPT-level authorization constraints post-creation.

This is a significant gap for compliance-sensitive use cases: a broker who wants to restrict secondary share transfers (e.g. to KYC-verified holders only) cannot apply `lsfMPTRequireAuth` to the vault's existing share MPT, regardless of being the vault owner. The `DomainID` gate on `VaultDeposit` controls who can mint shares initially, but once minted, shares can be transferred to any account that has a valid MPToken entry (unless the vault was created with `tfVaultShareNonTransferable`).

### Reproduction

```typescript
const setAuthTx = {
  TransactionType: 'MPTokenIssuanceSet',
  Account: broker.classicAddress,      // vault owner
  MPTokenIssuanceID: vault.ShareMPTID, // vault's auto-created share MPT
  Flags: 0x0008,                       // tfMPTSetRequireAuth
};
// Submit → tecNO_PERMISSION
```

### Proposed fix

1. **XLS-65 doc page — VaultCreate:** Document that the vault autonomously manages the share MPT issuance and that `MPTokenIssuanceSet` cannot be called on vault-managed MPTs by the vault owner. If share transfer restrictions are desired, set `tfVaultShareNonTransferable` at VaultCreate time.
2. **XLS-65 feature:** Consider exposing a `VaultShareMPTConfig` or equivalent mechanism in `VaultCreate` that allows the broker to specify MPT issuance flags (e.g. `RequireAuth`, `CanTransfer`) at vault creation time. This would allow credential-gated vaults to also restrict secondary share transfers.
3. **Error message improvement:** `tecNO_PERMISSION` with no context when the caller is the vault owner is confusing. A message such as *"Vault share MPT issuances are managed by the vault ledger object and cannot be modified via MPTokenIssuanceSet"* would surface the constraint immediately.

---

## DX-10 — `VaultDeposit` domain gate creates implicit MPT transfer barrier via MPToken entry requirement

**Category:** DOC GAP  
**Severity:** Medium  
**Library:** `xrpl.js@5.2.0-beta.1` · rippled Devnet (XLS-65 V1.1 + XLS-33 + XLS-80)  
**Date:** 2026-09-13

### Description

When a vault has `DomainID` set (XLS-80 credential gate), uncredentialed accounts cannot call `VaultDeposit`. A side effect of never depositing is that no `MPToken` ledger object is ever created for the uncredentialed account. Without an `MPToken` entry, attempting to transfer vault shares to that account via a `Payment` transaction fails with:

```
tecNO_AUTH
```

This failure is *behaviorally correct* — uncredentialed accounts cannot hold shares — but the mechanism is indirect and the error code is misleading. `tecNO_AUTH` implies that explicit MPT authorization was required and denied; the real reason is that no `MPToken` object exists for the destination. A developer reading `tecNO_AUTH` in isolation would look for `lsfMPTRequireAuth` and not find it set, creating confusion.

The implicit barrier also has a security gap: since `lsfMPTRequireAuth` is NOT set on the vault's share MPT (and cannot be set post-creation — see DX-09), an uncredentialed account *could* create their own `MPToken` entry by calling `MPTokenAuthorize` on their own behalf (this is permitted when `lsfMPTRequireAuth` is absent). If they did this, a subsequent `Payment` of shares would succeed — meaning the domain gate on deposits does not fully prevent uncredentialed accounts from holding shares via secondary transfer.

This interaction between XLS-80 domain gating, XLS-65 share MPT management, and XLS-33 MPToken entry creation is undocumented in any of the three spec documents.

### Reproduction

```typescript
// 1. Create vault with DomainID (credential gate)
// 2. InvestorA (credentialed) deposits — MPToken entry created for A
// 3. Uncredentialed tries VaultDeposit → rejected (expected, DX-08/domain gate)
//    → Uncredentialed has no MPToken entry
// 4. InvestorA tries to Payment-transfer shares to Uncredentialed:
const payTx = {
  TransactionType: 'Payment',
  Account: investorA.classicAddress,
  Destination: uncredentialed.classicAddress,
  Amount: { mpt_issuance_id: vault.ShareMPTID, value: '1000000' },
};
// → tecNO_AUTH (no MPToken entry for destination)
// 5. Uncredentialed calls MPTokenAuthorize on their own behalf
//    (possible because lsfMPTRequireAuth is NOT set — see DX-09)
// → MPToken entry created; subsequent Payment would succeed
```

### Proposed fix

1. **XLS-65 doc — VaultCreate:** Document that vault-managed share MPTs do not have `lsfMPTRequireAuth` set; secondary transfers to accounts without an `MPToken` entry fail with `tecNO_AUTH`. Explain that the domain gate applies only at deposit time.
2. **XLS-65 security guidance:** Add a warning that credential-gated vaults (`DomainID` set) may still permit uncredentialed accounts to self-create MPToken entries and receive shares via secondary transfer. If strict share-holder whitelisting is required, use `tfVaultShareNonTransferable` at VaultCreate time, then model transfer eligibility at the application layer.
3. **XLS-33 error message:** `tecNO_AUTH` when `lsfMPTRequireAuth` is not set should clarify whether the rejection was due to a missing authorization flag or a missing MPToken entry object.

---

## DX-11 — `CredentialCreate` is not idempotent — re-running setup fails with `tecDUPLICATE`

**Category:** API Confusion
**Severity:** Medium
**Library:** `xrpl.js@5.2.0-beta.1` · rippled Devnet (XLS-70)
**Date:** 2026-09-13

### Description

`CredentialCreate` returns `tecDUPLICATE` if a credential with the same `(Issuer, Subject, CredentialType)` tuple already exists on-chain. Credentials persist indefinitely (or until their `Expiration` lapses or they are explicitly deleted). This means a setup script that runs `CredentialCreate` without first checking for an existing credential will fail on every re-run after the first.

For a hackathon or test setup, this is easy to hit: the credential-issuance step succeeds on day one, then fails with `tecDUPLICATE` the next time the developer tries to re-run the setup from scratch (e.g. after a vault lifecycle reset or on a new machine). The error gives no indication that the credential already exists; it just says "duplicate."

The workaround is to query `account_objects { type: 'credential' }` before each `CredentialCreate` and skip the transaction if a matching credential is found. The same applies to `CredentialAccept` — check the `Flags` field for `lsfAccepted` (`0x00010000`) before re-submitting. The `PermissionedDomainSet` has a similar issue: re-running creates a second domain object on-chain; the workaround is to verify the existing `DOMAIN_ID` from `.env` is still live via `ledger_entry` before creating a new one.

### Reproduction

```typescript
// Run once — succeeds
CredentialCreate { Issuer: broker, Subject: investorA, CredentialType: '4B59435F5645524946494544' }

// Re-run without checking → tecDUPLICATE
CredentialCreate { Issuer: broker, Subject: investorA, CredentialType: '4B59435F5645524946494544' }
```

### Proposed fix

1. **XLS-70 tutorial / CredentialCreate docs:** Add a note that `CredentialCreate` is NOT idempotent; provide the idempotency check pattern (query `account_objects { type: 'credential' }` before submitting).
2. **Error message improvement:** `tecDUPLICATE` in the `CredentialCreate` context should say "A credential with this (Issuer, Subject, CredentialType) already exists" to make the cause immediately clear.
3. **SDK helper:** Consider an `upsertCredential` pattern in xrpl.js that handles the check-and-skip logic, similar to how `autofill` handles sequence numbers automatically.

---

## DX-12 — `GracePeriod` in `LoanSet` opens the payment window BEFORE `NextPaymentDue`, not after

**Category:** API Confusion
**Severity:** High
**Library:** `xrpl.js@5.2.0-beta.1` · rippled Devnet (XLS-66 V1.1)
**Date:** 2026-09-13

### Description

`NextPaymentDue` in the `Loan` ledger object is the **deadline** — the payment must be validated in a ledger whose `close_time ≤ NextPaymentDue`. `GracePeriod` does not extend the window past the deadline; it defines how early the payment can be made. The payment window is:

```
[NextPaymentDue - GracePeriod,  NextPaymentDue)
```

With `GracePeriod = PaymentInterval = 300s` (as in this prototype), this means the payment window opens immediately at loan creation (`StartDate`) and closes exactly 300 seconds later at `NextPaymentDue`. Submitting even 3 seconds after `NextPaymentDue` returns `tecEXPIRED`.

The counterintuitive part: "GracePeriod" conventionally means a post-deadline extension (e.g. a 30-day grace period on a monthly invoice). In XLS-66 it means the opposite — a pre-deadline window. A developer who reads the field name and assumes the payment can be made "up to GracePeriod seconds after the due date" will write a repayment script that always fails.

**Observed failure:** LoanPay validated at `NextPaymentDue + 3s` → `tecEXPIRED`. Grace period was 300s.

### Reproduction

```typescript
// LoanSet with GracePeriod = 300, PaymentInterval = 300
// NextPaymentDue = StartDate + 300

// Submit LoanPay 3 seconds after NextPaymentDue
// → tecEXPIRED (tx hash: CB58FE571CBAC0D552CD12DEA9B29F78ADFD9A4489ECD8E5423F7183780F2E36)
```

### Workaround (applied in this prototype)

In `08_repayment.ts`: target `NextPaymentDue - SUBMISSION_LEAD_TIME` (30s) instead of `NextPaymentDue`. Also add an upfront guard that aborts if `xrplTimeNow() >= NextPaymentDue`.

```typescript
const SUBMISSION_LEAD_TIME = 30; // submit 30s before deadline
// ...
await waitForPhase(client, nextDue - SUBMISSION_LEAD_TIME, 'payment submission window');
```

### Proposed fix

1. **XLS-66 spec / `LoanSet` docs:** Rename the field or add a prominent callout clarifying that `GracePeriod` defines the window opening time relative to `NextPaymentDue`, not an extension after it. A diagram showing `[NextPaymentDue - GracePeriod, NextPaymentDue)` would eliminate the confusion.
2. **Error improvement:** `tecEXPIRED` on `LoanPay` should include the payment deadline and submission time in the error metadata so developers can immediately see they were late rather than having to compute epoch offsets manually.

---
