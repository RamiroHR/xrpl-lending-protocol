# Testing — verify the build on XRPL Devnet

How collaborators and readers confirm that this repo’s scripts actually work on-chain.

**Network:** public XRPL Devnet (not Testnet) · Explorer: [devnet.xrpl.org](https://devnet.xrpl.org)  
**Library:** `xrpl.js@5.2.0-beta.1`  
**RPC:** `https://s.devnet.rippletest.net:51234/` · **WSS:** `wss://s.devnet.rippletest.net:51233/`

> Never commit `.env` or paste **seeds** into docs/PRs. Addresses, vault IDs, loan IDs, and tx hashes are fine to share.

Use values from your local `.env` and script stdout after each run.

---

## 0. Prerequisites

```bash
npm install
cp .env.example .env   # if you do not already have .env
npm run setup          # funds 5 accounts; writes *_SEED and *_ADDRESS into .env
```

Confirm addresses are present:

```bash
node -e "require('dotenv').config();
['INVESTOR_A','INVESTOR_B','BORROWER','BROKER','UNCREDENTIALED'].forEach(r =>
  console.log(r, process.env[r+'_ADDRESS']));"
```

Open each `*_ADDRESS` on [devnet.xrpl.org](https://devnet.xrpl.org) → balance > 0.

---

## 1. Phase A — critical-path smoke (optional but recommended)

Proves faucet + vault + LoanSet work **before** the timed product lifecycle.

```bash
npm run smoke:a2   # throwaway open vault → writes SMOKE_VAULT_ID
npm run smoke:a3   # deposit / withdraw round-trip
npm run smoke:a4   # closed-ended vault + LoanSet (uses CPT counterparty signing workaround)
```

### What to check

- **Accounts live** — explorer → each `*_ADDRESS` from `.env`
- **Smoke vault exists** — `SMOKE_VAULT_ID` in `.env` → explorer search and/or RPC below
- **Vault owner** — Broker address; asset = XRP
- **Basic tx + explorer link** — after A4, open Broker account history → find a `LoanSet` with `tesSUCCESS`

```bash
# Replace SMOKE_VAULT_ID with the value from .env
curl -s -X POST https://s.devnet.rippletest.net:51234/ \
  -H 'Content-Type: application/json' \
  -d '{"method":"vault_info","params":[{"vault_id":"'"$SMOKE_VAULT_ID"'","ledger_index":"validated"}]}'
```

Expect `status: success` and `result.vault`.

This satisfies the brief item: *Confirm a basic transaction and explorer link before building the complete flow.*

---

## 2. Phase B — full closed-ended lifecycle (Track 2 minimum bar)

A closed-ended vault has three ledger phases. The `b0`–`b5` scripts walk that lifecycle on Devnet. **Run them in order from the repo root**, preferably in one terminal session.

`b2` must finish while Subscription is still open (~2 minutes after `b1`). Later scripts self-wait for phase / payment boundaries.

### Timing constants (from scripts)

```
SUBSCRIPTION_SECONDS = 120   (2 min — window to run b2 after b1)         [02_create_vault.ts]
REDEMPTION_SECONDS   = 900   (15 min total investment window)             [02_create_vault.ts]
PAYMENT_INTERVAL     = 300   (5 min — b4 waits this long after b3)        [05_investment.ts]
GRACE_PERIOD         = 300   (5 min grace — must not exceed PaymentInterval) [05_investment.ts]
```

**Total wall-clock time:** ~15 minutes from `npm run b1` to done.  
`b2` is the only step with a hard deadline; all other scripts self-gate — run them and wait.

### Commands

```bash
npm run b0    # top up all accounts (recommended before each full run)
npm run b1    # create closed-ended vault — clock starts
npm run b2    # subscribe (within ~2 min of b1)
npm run b3    # originate + fund loan (waits for Investment)
npm run b4    # repay (waits for payment due)
npm run b5    # redeem (waits for Redemption)
```

Or chained (still respect the b2 window after b1 starts):

```bash
npm run b0 && npm run b1 && npm run b2 && npm run b3 && npm run b4 && npm run b5
```

### What each step does / expects

**`npm run b0`** — `01` top-up helper  
Faucet top-up for all five roles; prints balances before/after. Use when prior smoke runs drained Investor A (or any role).

**`npm run b1`** — `02_create_vault.ts` · *Create → Subscription opens*  
Broker submits `VaultCreate` (closed-ended, XRP) with compressed `SubscriptionDate` / `RedemptionDate`. Writes `VAULT_ID`, `VAULT_SUB_DATE`, `VAULT_REDEMPTION_DATE` to `.env`. **Starts the wall-clock timer.**

Verify after b1:
- `vault_info` → `VaultKind: 1`, Owner = Broker, asset = XRP
- `SubscriptionDate` and `RedemptionDate` present (V1.1 fields)
- VaultCreate tx `tesSUCCESS` on explorer

**`npm run b2`** — `04_subscription.ts` · *Subscription*  
Investor A deposits 50 XRP and Investor B 30 XRP (`VaultDeposit` → MPT shares minted). Optional over-subscription probe. Must run **before** Subscription ends.

Verify after b2:
- Two `VaultDeposit` txs `tesSUCCESS`
- `AssetsTotal` ≈ 80 XRP; share balances sum to 80,000,000
- Over-sub probe result logged (any outcome is valid — capture verbatim)

**`npm run b3`** — `05_investment.ts` · *Investment* (after `SubscriptionDate`)  
Script self-waits for Investment (~2 min after vault create). Broker `LoanBrokerSet`, then multi-party `LoanSet` (broker + borrower). Principal (~10 XRP) is drawn to the borrower. Writes `LOAN_ID` and payment schedule fields to `.env`. Deposits/withdrawals are blocked in this phase.

Verify after b3:
- LoanBrokerSet + LoanSet `tesSUCCESS`; Loan object visible
- Borrower balance up ~10 XRP; vault `AssetsAvailable` down ~10 XRP
- `.env` has `LOAN_ID`, `LOAN_NEXT_PAYMENT_DUE`, `LOAN_PERIODIC_PAYMENT`

**`npm run b4`** — `08_repayment.ts` · *Investment* (loan servicing)  
Script self-waits until payment is due (~5 min), then borrower `LoanPay`. Logs `AssetsTotal` / PPS before and after.

Verify after b4:
- LoanPay `tesSUCCESS`
- `AssetsTotal` moves on repayment (not at origination) — V1.1 **cash-basis**
- PPS delta near-zero is **expected** for a short demo loan at 5% annual (see `docs/DEVEX_LOG.md` DX-01)

**`npm run b5`** — `09_redemption.ts` · *Redemption* (after `RedemptionDate`)  
Script self-waits for Redemption, then Investor A and B `VaultWithdraw` (shares burned → XRP returned).

Verify after b5:
- Two `VaultWithdraw` txs `tesSUCCESS`
- Share balances → 0; XRP returned ≈ deposits (yield ≈ 0 — expected, DX-01)
- `vault_info` → `AssetsTotal` / `AssetsAvailable` ≈ 0

### RPC quick check (production vault)

```bash
# VAULT_ID from .env after b1
curl -s -X POST https://s.devnet.rippletest.net:51234/ \
  -H 'Content-Type: application/json' \
  -d '{"method":"vault_info","params":[{"vault_id":"'"$VAULT_ID"'","ledger_index":"validated"}]}'
```

After each step, paste tx hashes from stdout into the explorer.

### Re-run

Each B1→B5 run creates a **new vault** with a new `VAULT_ID`. Re-runs are independent:

1. `npm run b0` — top up accounts  
2. `npm run b1` — new vault; `.env` updated  
3. `npm run b2` within 2 minutes of b1  
4. `npm run b3`, `b4`, `b5` in sequence (each self-waits)  
5. Optionally record IDs/hashes in the README on-chain table

### What Phase B does **not** prove yet

Leave for Phase C/D (Loaded + polish):

- Credential-gated deposit rejection (uncredentialed → `VaultDeposit` fails)
- Permissioned Domain + MPT authorization
- MPT share transfer A→B (success) and A→uncredentialed (rejection)
- Coupon injection via `tfVaultDonation` + observable PPS rise
- Wrong-phase rejection demos (`10_rejection_demos.ts`)

---

## 3. Phase C — Loaded primitives (credential gate + MPT compliance ring)

Phase C adds the KYC layer that differentiates this from vanilla Track 2.  
**Branch:** `phase-c-loaded` · **Prerequisite:** Phase B working end-to-end.

### What Phase C proves

| Proof | How |
|---|---|
| Only credentialed investors can deposit | Uncredentialed `VaultDeposit` → rejected verbatim |
| MPT shares can only move within the KYC ring | A→uncredentialed transfer → rejected verbatim |
| Pre-maturity exit works between credentialed investors | A→B transfer → succeeds |

### One-time setup vs per-run

`c1` creates on-chain objects that **persist** — credentials don't expire for a year, the domain doesn't change. Run it once per set of accounts. The `b0`–`b5` lifecycle can be re-run as many times as needed against the same domain and credentials.

### Run order

```bash
# ── One-time setup (run once per account set) ──────────────────────────────
npm run c1       # create PermissionedDomain + issue KYC_VERIFIED credentials
                 # writes DOMAIN_ID / CREDENTIAL_TYPE / CREDENTIAL_ISSUER to .env

# ── Credential-gated lifecycle (repeat for each test run) ──────────────────
npm run b0       # top up all accounts
npm run b1       # new vault — this time WITH PermissionedDomainID from .env
npm run b2       # subscription: credentialed deposits + uncred rejection probe (C3)
npm run c2       # MPT authorization: lsfMPTRequireAuth + authorize InvestorA/B
npm run b3       # loan origination + drawdown (Investment phase)
npm run b4       # loan repayment (cash-basis PPS proof)
npm run c4       # MPT share transfer A→B (success) + A→uncredentialed (reject)
npm run b5       # redemption: withdraw + burn shares
```

> **Important:** `b2` must still run within ~2 minutes of `b1`. All other scripts self-gate.

### What `npm run c1` does

1. **Creates a Permissioned Domain** (Broker is owner)  
   A `PermissionedDomain` ledger object that declares: *any depositor must hold a `KYC_VERIFIED` credential issued by the Broker.*  
   The domain has no effect until a vault references it via `PermissionedDomainID`.

2. **Issues `KYC_VERIFIED` credential to InvestorA** (`CredentialCreate`)  
   Broker is the credential issuer; InvestorA is the subject.

3. **Issues `KYC_VERIFIED` credential to InvestorB** (`CredentialCreate`)  
   Same for InvestorB.

4. **Both investors accept their credentials** (`CredentialAccept`)  
   A credential is only active once the subject accepts it. Pending credentials are ignored by the protocol.

5. **Uncredentialed account receives nothing** — no credential at all.

6. **Writes to `.env`:**  
   `DOMAIN_ID`, `CREDENTIAL_TYPE` (hex), `CREDENTIAL_ISSUER` (Broker address)

After `c1`, `b1` reads `DOMAIN_ID` from `.env` and includes it in `VaultCreate` as `PermissionedDomainID`. That one field is what activates the credential gate on `VaultDeposit`.

### What to verify after each Phase C step

**After `c1`:**
- Broker account on explorer → shows `PermissionedDomain` object
- InvestorA/B accounts → show accepted `KYC_VERIFIED` credential
- Uncredentialed account → no credential
- `.env` has `DOMAIN_ID` (64-char hex), `CREDENTIAL_TYPE`, `CREDENTIAL_ISSUER`

**After `b1` (credential-gated vault):**
- `vault_info` → `PermissionedDomainID` field present
- Domain ID matches `DOMAIN_ID` in `.env`

**After `b2` (subscription + C3 rejection probe):**
- InvestorA/B `VaultDeposit` → `tesSUCCESS`
- Uncredentialed `VaultDeposit` → rejected; capture error code verbatim

**After `c2` (MPT auth):**
- Vault `ShareMPTID` issuance → `lsfMPTRequireAuth` flag set
- InvestorA/B MPTokens → marked as authorized
- Uncredentialed → no authorization

**After `c4` (MPT transfer):**
- A→B transfer of half InvestorA's shares → `tesSUCCESS`
- A→uncredentialed transfer → rejected; capture error code verbatim
- InvestorB share balance increased; InvestorA decreased

### Re-running Phase C

If accounts are re-created (new seeds), run `c1` again to re-issue credentials. Otherwise skip `c1` and go straight to `b0 → b1 → b2 → c2 → b3 → b4 → c4 → b5`.

### RPC: check credential on-chain

```bash
# Replace INVESTOR_A_ADDRESS with the value from .env
curl -s -X POST https://s.devnet.rippletest.net:51234/ \
  -H 'Content-Type: application/json' \
  -d '{"method":"account_objects","params":[{"account":"INVESTOR_A_ADDRESS","type":"credential","ledger_index":"validated"}]}'
```

Expect one object with `CredentialType` matching `CREDENTIAL_TYPE` from `.env` and `Flags` with the accepted bit set (`0x00010000`).

---

## 4. Filling the README “On-chain transactions” table

After a successful B1→B5 (and later C/D) run, copy explorer links into [`README.md`](README.md) § On-chain transactions so judges see verified Devnet evidence.

---

## 5. Phase D — coupon injection and rejection demos

These scripts run against an existing vault. A completed B or C lifecycle run with a valid `VAULT_ID` in `.env` is required for `d1`. `d2` creates its own fresh vault.

```bash
npm run d1   # coupon injection probe — VaultDeposit with candidate tfVaultDonation flag; logs PPS before/after
npm run d2   # phase-gate rejection demos — creates fresh open-ended vault; captures 3+ verbatim rejection codes
```

### What to verify

**After `npm run d1`:**
- Script exits 0 regardless of outcome (it is a probe)
- If `tesSUCCESS`: PPS after > PPS before; AssetsTotal increased by 1,000,000 drops
- If error: rejection code logged verbatim (see [DX-13] note in script output)
- Explorer link in stdout

**After `npm run d2`:**
- Script exits 0 (non-fatal — all rejections are captured as data)
- At least 3 rejection codes logged verbatim (e.g. `tecNO_PERMISSION`, `tecINSUFFICIENT_FUNDS`, `tecNO_ENTRY`)
- Summary table printed at end
- Explorer links in stdout for each probe tx

---

## Related docs

- [`README.md`](README.md) — product overview + setup  
- [`docs/PLANNING.md`](docs/PLANNING.md) — phased backlog  
- [`docs/DEVEX_LOG.md`](docs/DEVEX_LOG.md) — friction log (40% judging weight)  

