# Testing — verify the build on XRPL Devnet

How to confirm this repo’s scripts work on-chain **for the current product** (Track 2 Loaded: closed-ended vault + Permissioned Domains + MPT transfers + Phase D probes).

**Network:** public XRPL Devnet · Explorer: [devnet.xrpl.org](https://devnet.xrpl.org)  
**Library:** `xrpl.js@5.2.0-beta.1`  
**RPC:** `https://s.devnet.rippletest.net:51234/` · **WSS:** `wss://s.devnet.rippletest.net:51233/`

> Never commit `.env` or paste **seeds**. Addresses, vault/loan IDs, and tx hashes are fine to share.

---

## What this file is (vs sprint manuals)

| Doc | Role |
|---|---|
| **`TESTING.md` (this file)** | **Canonical playbook** — what to run and what to check for today’s code. Linked from the README. |
| **`docs/sprints/*/manual_onchain_verification.md`** | **Local fill-in worksheets** from specific sprints (gitignored). Useful as run records / hash scrapbooks — **not** the source of truth for the final product. |

Sprint manuals were written while the product grew (A → B → C → D). Do **not** treat “only sprint 5” as the full test. Sprint 5 only added D1/D2. The final product still needs the Loaded lifecycle from Phase C (and the B scripts it wraps).

**Promotion rule:** keep durable commands + expects here; leave dated hashes / checkboxes in sprint folders (or copy winning hashes into the README on-chain table).

---

## Canonical verify path (recommended)

One path that proves the shipped demo. Assumes accounts already exist (`npm run setup` once).

```bash
# One-time per account set (skip if DOMAIN_ID already in .env)
npm run c1          # Permissioned Domain + KYC credentials for Investor A/B

# Full Loaded lifecycle (~15–20 min wall clock)
npm run b0          # faucet top-up
npm run b1          # gated VaultCreate (DomainID + tfVaultPrivate) — clock starts
npm run b2          # credentialed deposits + uncred reject (tecNO_AUTH) — within ~2 min of b1
npm run b3          # LoanBrokerSet + LoanSet + drawdown (waits for Investment)
npm run b4          # LoanPay (waits for payment window) — cash-basis / PPS log
npm run c2          # MPT auth probe (expect tecNO_PERMISSION on vault-managed MPT — DX-09)
npm run c4          # MPT transfer A→B OK; A→uncredentialed tecNO_AUTH
npm run b5          # VaultWithdraw both investors (waits for Redemption)

# Phase D probes (can run after / alongside; d2 is independent)
npm run d1          # tfVaultDonation probe (may temINVALID_FLAG — DX-13)
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
GRACE_PERIOD         = 300   # early window before NextPaymentDue — see DX-12
```

---

## 0. Prerequisites

```bash
npm install
cp .env.example .env   # if needed
npm run setup          # five roles → *_SEED / *_ADDRESS
```

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

## 2. Loaded lifecycle — what to check per step

### `c1` — domain + credentials (once)

- Broker owns a `PermissionedDomain`
- Investor A/B hold accepted `KYC_VERIFIED` credentials; Uncredentialed has none
- `.env`: `DOMAIN_ID`, `CREDENTIAL_TYPE`, `CREDENTIAL_ISSUER`

### `b0` — top-up

- Balances print before/after; enough XRP for deposits + fees

### `b1` — gated vault create

- `VaultKind: 1`; `SubscriptionDate` / `RedemptionDate` set
- `DomainID` / private flag path live (gated create)
- Writes `VAULT_ID` (+ phase dates) to `.env`

```bash
curl -s -X POST https://s.devnet.rippletest.net:51234/ \
  -H 'Content-Type: application/json' \
  -d '{"method":"vault_info","params":[{"vault_id":"'"$VAULT_ID"'","ledger_index":"validated"}]}'
```

### `b2` — subscribe + uncred reject

- Investor A/B `VaultDeposit` → `tesSUCCESS`; `AssetsTotal` ≈ 80 XRP
- Uncredentialed deposit → **`tecNO_AUTH`** (verbatim)
- Over-sub probe logged (any outcome is valid data)

### `b3` — loan + drawdown

- `LoanBrokerSet` + dual-sign `LoanSet` → `tesSUCCESS`
- Borrower XRP up ~principal; vault `AssetsAvailable` down
- `.env`: `LOAN_ID`, payment fields

### `b4` — repay

- `LoanPay` → `tesSUCCESS`
- Borrower balance **down**; **vault pool** (pseudo-account) **up** — not the Broker wallet
- `AssetsTotal` / PPS may tick slightly (cash-basis); near-zero interest on short vaults is expected (DX-01)

### `c2` — MPT auth probe

- Expect **`tecNO_PERMISSION`** setting `lsfMPTRequireAuth` on vault share MPT (DX-09) — still a useful captured result

### `c4` — MPT transfers

- A→B half shares → `tesSUCCESS`
- A→Uncredentialed → **`tecNO_AUTH`**

### `b5` — redeem

- Both `VaultWithdraw` → `tesSUCCESS`; shares → 0
- Vault assets ≈ 0

---

## 3. Phase D probes

### `d1` — coupon / `tfVaultDonation`

Needs a vault still useful mid-Investment (`VAULT_ID` in `.env`).  
Script is a **probe**: success (PPS up, no new shares) **or** documented failure (e.g. `temINVALID_FLAG` — DX-13) both count.

### `d2` — rejection demos

Creates its own open-ended vault; captures several codes verbatim (`tecNO_PERMISSION`, `tecINSUFFICIENT_FUNDS`, `tecNO_ENTRY`, …). Unexpected codes (e.g. 1-drop deposit succeeding — DX-14) are valid DevEx data. Script exits 0.

---

## 4. README on-chain table

After a good run, paste explorer links into [`README.md`](README.md) § On-chain transactions (and optionally keep a filled sprint worksheet locally).

Role addresses for reading explorer metadata: see [`pitch.html`](pitch.html) On-chain slide (Broker / investors / Borrower / Uncredentialed / vault pool).

---

## Related docs

- [`README.md`](README.md) — product + setup + verified tx links  
- [`DEVEX_FEEDBACK.md`](DEVEX_FEEDBACK.md) — manual DevEx narrative (repo root)  
- [`docs/DEVEX_LOG.md`](docs/DEVEX_LOG.md) — structured findings DX-01…  
- [`docs/CREDENTIAL_GATE.md`](docs/CREDENTIAL_GATE.md) — how the KYC gate works  
- [`docs/PLANNING.md`](docs/PLANNING.md) — phased backlog (historical sprint planning)  
