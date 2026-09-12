# XRPL Developer Experience Log

Captured during hackathon development — Track 2 Loaded (Permissioned Domains + MPT shares).  
Environment: XRPL public Devnet · Library: `xrpl.js@5.2.0-beta.0` · Protocol: XLS-65/66 V1.1

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

---
