# XRPL Permissioned Private Credit Fund

> A closed-ended institutional credit fund on XRPL — KYC-gated subscriptions, MPT fund shares, and a full XLS-65/66 lending lifecycle on the public Devnet.

Built for the **XRPL Lending Protocol Hackathon · September 12–13, 2026**
Hosted by DeVinci Blockchain and Ripple · IIM Paris–La Défense

---

## Overview

This project implements a permissioned, closed-ended private credit fund on the XRPL Lending Protocol V1.1. Investors hold on-chain KYC credentials to subscribe; vault shares are MPTs transferable within the compliance ring; a broker deploys capital via a structured loan during the locked Investment phase.

The fund lifecycle maps onto the three phases of a closed-ended vault:

| Phase | What happens |
|---|---|
| **Subscription** | Credentialed investors deposit XRP; MPT fund shares are minted. Non-credentialed deposits are rejected at the protocol level. |
| **Investment** | Deposits and withdrawals are blocked. The broker originates a loan, the borrower draws down, and a mid-term coupon is injected via `VaultDeposit` with `tfVaultDonation`. Credentialed investors can transfer shares between each other (pre-maturity exit). |
| **Redemption** | Borrower repays; investors withdraw principal plus yield; MPT shares are burned. |

### Key differentiators

- **Permissioned Domains** gate who can deposit and hold shares — compliance enforced on-chain, not off-chain policy
- **MPT `lsfMPTRequireAuth`** enforces the KYC ring at the token transfer level
- **Pre-maturity exit** via MPT share transfer between credentialed investors during the locked Investment phase
- **Coupon injection** (`tfVaultDonation`) demonstrated explicitly with before/after PPS verification

---

## Track and environment

| Field | Value |
|---|---|
| Track | **Track 2** — closed-ended vault |
| Protocol | Lending Protocol **V1.1** |
| Flavour | **Loaded** — Permissioned Domains & Credentials + MPTs |
| Network | Public XRPL Devnet |
| RPC | `https://s.devnet.rippletest.net:51234/` |
| WSS | `wss://s.devnet.rippletest.net:51233/` |
| Explorer | [devnet.xrpl.org](https://devnet.xrpl.org) |
| Library | `xrpl.js@5.2.0-beta.1` |
| Language | TypeScript / Node.js |

---

## XLS-65 / XLS-66 transactions

| Transaction | Phase | Script |
|---|---|---|
| `VaultCreate` | Setup | `scripts/02_create_vault.ts` |
| `VaultDeposit` — investor | Subscription | `scripts/04_subscription.ts` |
| `VaultDeposit` — `tfVaultDonation` coupon | Investment | `scripts/06_coupon_injection.ts` |
| `LoanSet` — multi-party | Investment | `scripts/05_investment.ts` |
| Loan drawdown | Investment | `scripts/05_investment.ts` |
| Loan repayment | Investment | `scripts/08_repayment.ts` |
| `VaultWithdraw` | Redemption | `scripts/09_redemption.ts` |
| Phase-gate rejections | All phases | `scripts/10_rejection_demos.ts` |

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
