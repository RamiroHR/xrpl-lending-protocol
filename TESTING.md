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

## 3. Later phases (Loaded + polish)

Not required to prove the Track 2 minimum bar; check when scripts exist:

- **`npx tsx scripts/03_permissioned_domain.ts`** — KYC: Permissioned Domain + Credentials (+ MPT auth) before gated deposits
- **`npx tsx scripts/06_coupon_injection.ts`** — Mid-Investment coupon via `VaultDeposit` + `tfVaultDonation` (observable PPS rise)
- **`npx tsx scripts/07_mpt_transfer.ts`** — Pre-maturity exit: share transfer A→B; reject transfer to uncredentialed
- **`npx tsx scripts/10_rejection_demos.ts`** — Wrong-phase txs rejected (deposit/withdraw/loan at illegal times)

Verify: uncredentialed deposit rejected; MPT transfer A→B OK / A→uncredentialed rejected; PPS rises on donation; wrong-phase txs fail with captured errors.

---

## 4. Filling the README “On-chain transactions” table

After a successful B1→B5 (and later C/D) run, copy explorer links into [`README.md`](README.md) § On-chain transactions so judges see verified Devnet evidence.

---

## Related docs

- [`README.md`](README.md) — product overview + setup  
- [`docs/PLANNING.md`](docs/PLANNING.md) — phased backlog  
- [`docs/DEVEX_LOG.md`](docs/DEVEX_LOG.md) — friction log (40% judging weight)  

