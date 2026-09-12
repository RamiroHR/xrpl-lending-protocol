# XRPL Permissioned Private Credit Fund

> A closed-ended institutional credit fund on XRPL — KYC-gated subscriptions, MPT fund shares, and a full XLS-65/66 lending lifecycle on the public Devnet.

Built for the **XRPL Lending Protocol Hackathon · September 12–13, 2026**
Hosted by DeVinci Blockchain and Ripple · IIM Paris–La Défense

Target product story: [`docs/PRODUCT_OVERVIEW.md`](docs/PRODUCT_OVERVIEW.md). What is runnable today vs still planned is in **Implementation status** below.

---

## Overview

This project implements a permissioned, closed-ended private credit fund on the XRPL Lending Protocol V1.1. The Track 2 **minimum bar** is live on Devnet (create vault → subscribe → lend → repay → redeem). The **Loaded** flavour (Permissioned Domains, credential gates, MPT transfer perimeter, coupon injection) is the intended end state — see the checklist.

The fund lifecycle maps onto the three phases of a closed-ended vault:

| Phase | What happens |
|---|---|
| **Subscription** | Investors deposit XRP; MPT fund shares are minted. *(Loaded: only credentialed depositors; uncredentialed rejected.)* |
| **Investment** | Deposits and withdrawals are blocked. The broker originates a loan and the borrower draws down. *(Loaded: mid-term coupon via `tfVaultDonation`; share transfers within the KYC ring.)* |
| **Redemption** | Borrower repays; investors withdraw principal (plus yield when coupons / interest are demonstrated); MPT shares are burned. |

### Implementation status

**Done (Track 2 minimum bar — Phase B)**

- [x] Five Devnet roles funded (`npm run setup` / `b0`)
- [x] Closed-ended `VaultCreate` with `SubscriptionDate` / `RedemptionDate` (`b1`)
- [x] Investor A/B `VaultDeposit` → MPT shares minted (`b2`)
- [x] `LoanBrokerSet` + multi-party `LoanSet` + drawdown (`b3`)
- [x] Borrower `LoanPay` with cash-basis PPS / `AssetsTotal` logging (`b4`)
- [x] Investor A/B `VaultWithdraw` / share burn (`b5`)
- [x] Phase A smoke path (`smoke:a2`–`a4`) and DevEx hook invite

**Not yet (Loaded + polish — Phase C/D)**

- [ ] Permissioned Domain + KYC Credentials issued to investors
- [ ] Credential-gated deposits (uncredentialed `VaultDeposit` rejected)
- [ ] MPT `lsfMPTRequireAuth` authorization ring
- [ ] Pre-maturity MPT share transfer A→B; transfer to uncredentialed rejected
- [ ] Coupon injection (`VaultDeposit` + `tfVaultDonation`) with before/after PPS
- [ ] Wrong-phase rejection demos (`10_rejection_demos.ts`)
- [ ] README on-chain tx table filled with explorer links

Run and verify the done path: [`TESTING.md`](TESTING.md).

---

## Track and environment

| Field | Value |
|---|---|
| Track | **Track 2** — closed-ended vault |
| Protocol | Lending Protocol **V1.1** |
| Flavour | **Loaded** target — Permissioned Domains & Credentials + MPTs *(minimum bar scripts ship first; Loaded scripts TBD)* |
| Network | Public XRPL Devnet |
| RPC | `https://s.devnet.rippletest.net:51234/` |
| WSS | `wss://s.devnet.rippletest.net:51233/` |
| Explorer | [devnet.xrpl.org](https://devnet.xrpl.org) |
| Library | `xrpl.js@5.2.0-beta.1` |
| Language | TypeScript / Node.js |

---

## XLS-65 / XLS-66 transactions

| Transaction | Phase | Script | Status |
|---|---|---|---|
| `VaultCreate` | Setup | `scripts/02_create_vault.ts` | Done |
| `VaultDeposit` — investor | Subscription | `scripts/04_subscription.ts` | Done |
| `LoanSet` — multi-party | Investment | `scripts/05_investment.ts` | Done |
| Loan drawdown | Investment | `scripts/05_investment.ts` | Done |
| Loan repayment | Investment | `scripts/08_repayment.ts` | Done |
| `VaultWithdraw` | Redemption | `scripts/09_redemption.ts` | Done |
| `VaultDeposit` — `tfVaultDonation` coupon | Investment | `scripts/06_coupon_injection.ts` | Not yet |
| Permissioned Domain / Credentials | Setup | `scripts/03_permissioned_domain.ts` | Not yet |
| MPT share transfer (+ rejection) | Investment | `scripts/07_mpt_transfer.ts` | Not yet |
| Phase-gate rejections | All phases | `scripts/10_rejection_demos.ts` | Not yet |

---

## On-chain transactions

> Links added as transactions confirm on Devnet during the sprint.

| Step | Transaction hash | Explorer |
|---|---|---|
| VaultCreate | — | — |
| Subscription — Investor A | — | — |
| Subscription — Investor B | — | — |
| LoanSet | — | — |
| Drawdown | — | — |
| Coupon injection | — | — |
| MPT transfer A → B | — | — |
| Repayment | — | — |
| Redemption — Investor A | — | — |
| Redemption — Investor B | — | — |

---

## Setup

**Prerequisites**
- Node.js ≥ 20
- XRPL DevEx hook installed — invite code `BFT-PARIS-26`

**Install dependencies**

```bash
npm install
```

**Create accounts (first time)**

```bash
cp .env.example .env
npm run setup
```

`npm run setup` runs `scripts/01_setup_accounts.ts`: it funds five Devnet wallets via the faucet (`fundWallet`), then writes `*_SEED` and `*_ADDRESS` into `.env` (Investor A/B, Borrower, Broker, Uncredentialed). Never commit `.env`.

Optional manual alternative: fund wallets at https://faucet.devnet.rippletest.net/accounts and paste seeds into `.env` yourself — addresses can be left blank; scripts derive them from seeds at runtime (or re-run setup to refresh both).

**Run and verify on Devnet:** see [`TESTING.md`](TESTING.md) for the Phase A smoke and Phase B `b1`–`b5` lifecycle playbook (commands, timing, explorer/RPC checks).

---

## Verify on Devnet

After setup (and after each lifecycle run), confirm results on [devnet.xrpl.org](https://devnet.xrpl.org) using addresses / `VAULT_ID` / tx hashes from `.env` and script stdout.

**Playbook:** [`TESTING.md`](TESTING.md)

---

## Project structure

```
root/
├── docs/           — strategy, product definition, DevEx log, sprint notes
├── scripts/        — TypeScript flow scripts (one per lifecycle step)
├── TESTING.md      — how to verify the build on Devnet
├── .env.example    — account seed/address template (copy to .env — never commit .env)
└── README.md
```

---

## Developer feedback

Friction points are logged continuously in [`docs/DEVEX_LOG.md`](docs/DEVEX_LOG.md) throughout the sprint.

The formal submission feedback report will be at `DEVEX_FEEDBACK.md` (repo root) at submission time.

---

## Team

DeVinci Blockchain · XRPL Lending Protocol Hackathon 2026
