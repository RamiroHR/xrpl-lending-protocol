# Testing — verify the build on XRPL Devnet

How to confirm this repo’s scripts work on-chain **for the current product** (Track 2 Loaded: closed-ended vault + Permissioned Domains + MPT transfers + Phase D probes).

**Network:** public XRPL Devnet · Explorer: [devnet.xrpl.org](https://devnet.xrpl.org)  
**Library:** `xrpl.js@5.2.0-beta.1`  
**RPC:** `https://s.devnet.rippletest.net:51234/` · **WSS:** `wss://s.devnet.rippletest.net:51233/`

> Never commit `.env` or paste **seeds**. Addresses, vault/loan IDs, and tx hashes are fine to share.

For a visual walkthrough of the same steps (recorded console + “Inside this command” lists), open [`pitch.html`](pitch.html) (drag into a browser) and use the Demo slide.

---

## What this file is (vs sprint manuals)

| Doc | Role |
|---|---|
| **`TESTING.md` (this file)** | **Canonical playbook** — what to run, what each script does internally, and what to check. Linked from the README. |
| **`docs/sprints/*/manual_onchain_verification.md`** | **Local fill-in worksheets** from specific sprints (gitignored). Useful as run records / hash scrapbooks — **not** the source of truth for the final product. |

Sprint manuals were written while the product grew (A → B → C → D). Do **not** treat “only sprint 5” as the full test. Sprint 5 only added D1/D2. The final product still needs the Loaded lifecycle from Phase C (and the B scripts it wraps).

**Promotion rule:** keep durable commands + expects here; leave dated hashes / checkboxes in sprint folders (or copy winning hashes into the README on-chain table).

---

## Canonical verify path (recommended)

One path that proves the shipped demo. Assumes accounts already exist (`npm run setup` once). Details for each command are in §2 / §3 below.

```bash
# One-time per account set (skip if DOMAIN_ID already in .env)
npm run c1          # Permissioned Domain + KYC for Investor A/B

# Full Loaded lifecycle (~15–20 min wall clock)
npm run b0          # faucet top-up
npm run b1          # gated VaultCreate — clock starts
npm run b2          # deposits + uncred reject — within ~2 min of b1
npm run b3          # LoanBrokerSet + LoanSet + drawdown
npm run b4          # LoanPay — cash-basis / PPS log
npm run c2          # MPT auth probe (DX-09)
npm run c4          # MPT transfer A→B OK; A→uncred reject
npm run b5          # VaultWithdraw both investors

# Phase D probes (can run after / alongside; d2 is independent)
npm run d1          # tfVaultDonation probe (DX-13)
npm run d2          # phase-gate / guardrail rejection batch
```

Verified reference order from the Phase C Devnet run:  
`c1 → b0 → b1 → b2 → b3 → b4 → c2 → c4 → b5` (+ `d1` / `d2` from Phase D).

Hard constraint: **`b2` within ~2 minutes of `b1`**. Other scripts self-wait.

Timing constants (from scripts):

```
SUBSCRIPTION_SECONDS = 120
REDEMPTION_SECONDS   = 900
PAYMENT_INTERVAL     = 300
GRACE_PERIOD         = 300   # early window before NextPaymentDue (see DX-12)
```

---

## 0. Prerequisites

```bash
npm install
cp .env.example .env   # if needed
npm run setup          # five roles → *_SEED / *_ADDRESS
```

**Inside `setup`:** funds five Devnet wallets via the faucet (Investor A/B, Borrower, Broker, Uncredentialed) and writes seeds/addresses into `.env`.

```bash
node -e "require('dotenv').config();
['INVESTOR_A','INVESTOR_B','BORROWER','BROKER','UNCREDENTIALED'].forEach(r =>
  console.log(r, process.env[r+'_ADDRESS']));"
```

Explorer: each address balance > 0.

---

## 1. Optional — Phase A smoke

Quick confidence before a long timed run (not required if the Loaded path already works).

```bash
npm run smoke:a2   # open vault → SMOKE_VAULT_ID
npm run smoke:a3   # deposit / withdraw round-trip
npm run smoke:a4   # closed-ended + LoanSet (CPT counterparty workaround)
```

Check: smoke vault on explorer / `vault_info`; Broker history shows a `LoanSet` `tesSUCCESS`.

---

## 2. Loaded lifecycle — what each command does

Each subsection: purpose → internal steps (same idea as the Demo slide in `pitch.html`) → what to check.

### `npm run c1` — Permissioned Domain + KYC (once)

Sets up the on-chain compliance ring **before** any vault. Skip if `DOMAIN_ID` is already in `.env` and still live.

**Inside this command**

1. `PermissionedDomainSet` — Broker creates the KYC “club” rule (accepted credential type `KYC_VERIFIED`)
2. `CredentialCreate` — Broker issues credential to Investor A
3. `CredentialAccept` — Investor A signs to activate it
4. `CredentialCreate` — Broker issues credential to Investor B
5. `CredentialAccept` — Investor B activates; Uncredentialed is left with **no** credential on purpose

**Expect**

- Broker owns a `PermissionedDomain`
- Investor A/B hold accepted credentials; Uncredentialed has none
- `.env`: `DOMAIN_ID`, `CREDENTIAL_TYPE`, `CREDENTIAL_ISSUER`

---

### `npm run b0` — faucet top-up

Tops up the five roles so deposits and fees do not fail mid-run.

**Inside this command**

1. Print balances before
2. Request faucet funds for Investor A/B, Borrower, Broker
3. Print balances after

**Expect**

- Enough XRP for ~80 XRP of deposits plus fees

---

### `npm run b1` — create gated vault (starts the clock)

Broker opens the closed-ended campaign vault and wires it to the C1 domain.

**Inside this command**

1. `VaultCreate` — closed-ended (`VaultKind: 1`) with compressed `SubscriptionDate` / `RedemptionDate`
2. `DomainID` + `tfVaultPrivate` — only credentialed LPs may deposit
3. Write `.env` — `VAULT_ID` + phase timestamps

**Expect**

- `VaultKind: 1`; phase dates set; domain gate live
- **Run `b2` within ~2 minutes** (subscription window)

```bash
curl -s -X POST https://s.devnet.rippletest.net:51234/ \
  -H 'Content-Type: application/json' \
  -d '{"method":"vault_info","params":[{"vault_id":"'"$VAULT_ID"'","ledger_index":"validated"}]}'
```

---

### `npm run b2` — subscribe + reject uncredentialed

Capital in during Subscription; proves the domain gate.

**Inside this command**

1. `VaultDeposit` (Uncredentialed) — probe; expect `tecNO_AUTH`
2. `VaultDeposit` (Investor A) — e.g. 50 XRP → MPT shares minted
3. `VaultDeposit` (Investor B) — e.g. 30 XRP → `AssetsTotal` ≈ 80 XRP
4. Over-subscription probe — oversized deposit; any rejection code is valid data

**Expect**

- A/B deposits → `tesSUCCESS`; Uncredentialed → **`tecNO_AUTH`** (verbatim)
- `AssetsTotal` ≈ 80 XRP

---

### `npm run b3` — loan + drawdown

After Subscription ends, originate the loan and fund the borrower.

**Inside this command**

1. Wait — auto-waits until Investment opens
2. `LoanBrokerSet` — Broker registers a `LoanBroker` on the vault
3. `LoanSet` — Broker + borrower dual-sign (CPT counterparty path)
4. Drawdown — principal (e.g. 10 XRP) moves from vault pool to Borrower

**Expect**

- `LoanBrokerSet` + dual-sign `LoanSet` → `tesSUCCESS`
- Borrower XRP up ~principal; vault `AssetsAvailable` down
- `.env`: `LOAN_ID`, payment fields

---

### `npm run b4` — repay (cash-basis PPS)

Borrower pays into the vault; PPS may tick slightly.

**Inside this command**

1. Wait — payment window is `[Due − GracePeriod, Due)` (early window, not post-deadline; DX-12)
2. Snapshot — log `AssetsTotal` / shares / PPS before
3. `LoanPay` — Borrower repays into the **vault pool** (not the Broker wallet)
4. Snapshot — PPS after (near-zero on short vaults is expected; DX-01)

**Expect**

- `LoanPay` → `tesSUCCESS`
- Borrower balance down; vault pool up
- `AssetsTotal` / PPS may rise slightly (cash-basis)

---

### `npm run c2` — MPT auth probe (DX-09)

Discovers whether the broker can set `lsfMPTRequireAuth` on the vault’s share MPT.

**Inside this command**

1. Read vault `ShareMPTID`
2. `MPTokenIssuanceSet` (`tfMPTSetRequireAuth`) as Broker
3. Log result (often `tecNO_PERMISSION` on vault-managed MPTs)

**Expect**

- **`tecNO_PERMISSION`** is a useful captured result (DX-09), not a script failure

---

### `npm run c4` — MPT share transfers

Proves the compliance perimeter on secondary transfers during Investment.

**Inside this command**

1. `Payment` (MPT) — Investor A → B (half of A’s shares); expect `tesSUCCESS`
2. `Payment` (MPT) — Investor A → Uncredentialed; expect `tecNO_AUTH`
3. Print final share balances

**Expect**

- A→B → `tesSUCCESS`; A→Uncredentialed → **`tecNO_AUTH`**
- Uncredentialed share balance stays 0

---

### `npm run b5` — redemption

After `RedemptionDate`, investors exit; shares burn.

**Inside this command**

1. Wait — auto-waits until Redemption opens
2. `VaultWithdraw` (Investor A) — redeem remaining shares → XRP out
3. `VaultWithdraw` (Investor B) — includes shares received from A in `c4`
4. Yield summary — deposit vs received (A/B split reflects the MPT transfer)

**Expect**

- Both withdrawals → `tesSUCCESS`; share balances → ~0
- Vault assets ≈ 0

---

## 3. Phase D probes

### `npm run d1` — coupon / `tfVaultDonation`

Needs a vault still useful mid-Investment (`VAULT_ID` in `.env`).

**Inside this command**

1. Snapshot — PPS / `AssetsTotal` before
2. `VaultDeposit` with `Flags: 0x00010000` (`tfVaultDonation` probe)
3. Result — success (PPS up, no new shares) **or** documented failure (e.g. `temINVALID_FLAG` · DX-13)

**Expect**

- Exit 0 either way; capture the code for DevEx

---

### `npm run d2` — rejection demos

Independent of the main vault lifecycle. Creates a fresh open-ended vault and probes wrong-context txs.

**Inside this command**

1. `VaultCreate` — open-ended demo vault
2. `LoanBrokerSet` on open vault — expect `tecNO_PERMISSION`
3. Tiny `VaultDeposit` (1 drop) — may succeed (DX-14: no protocol minimum)
4. `VaultWithdraw` with no shares — expect `tecINSUFFICIENT_FUNDS` (or similar)
5. `LoanPay` with fake `LoanID` — expect `tecNO_ENTRY`
6. Print summary table of expected vs got

**Expect**

- Several verbatim codes captured; unexpected codes are valid DevEx data
- Script exits 0

---

## 4. README on-chain table

After a good run, paste explorer links into [`README.md`](README.md) § On-chain transactions (and optionally keep a filled sprint worksheet locally).

Role addresses for reading explorer metadata: see [`pitch.html`](pitch.html) On-chain slide (Broker / investors / Borrower / Uncredentialed / vault pool).

---

## Related docs

- [`README.md`](README.md) — product + setup + verified tx links  
- [`pitch.html`](pitch.html) — presentation / recorded Demo slide (same lifecycle steps)  
- [`DEVEX_FEEDBACK.md`](DEVEX_FEEDBACK.md) — manual DevEx narrative (repo root)  
- [`docs/DEVEX_LOG.md`](docs/DEVEX_LOG.md) — structured findings DX-01…  
- [`docs/CREDENTIAL_GATE.md`](docs/CREDENTIAL_GATE.md) — how the KYC gate works  
- [`docs/PRODUCT_OVERVIEW.md`](docs/PRODUCT_OVERVIEW.md) — product story  
- [`docs/PLANNING.md`](docs/PLANNING.md) — phased backlog (historical sprint planning)  
