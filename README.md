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

How the KYC credential gate works (trust chain, dual-signature model, MPT auth): [`docs/CREDENTIAL_GATE.md`](docs/CREDENTIAL_GATE.md)

### Implementation status

**Done (Track 2 minimum bar — Phase B)**

- [x] Five Devnet roles funded (`npm run setup` / `b0`)
- [x] Closed-ended `VaultCreate` with `SubscriptionDate` / `RedemptionDate` (`b1`)
- [x] Investor A/B `VaultDeposit` → MPT shares minted (`b2`)
- [x] `LoanBrokerSet` + multi-party `LoanSet` + drawdown (`b3`)
- [x] Borrower `LoanPay` with cash-basis PPS / `AssetsTotal` logging (`b4`)
- [x] Investor A/B `VaultWithdraw` / share burn (`b5`)
- [x] Phase A smoke path (`smoke:a2`–`a4`) and DevEx hook invite

**Done (Loaded — Phase C)**

- [x] Permissioned Domain created + KYC credentials issued/accepted for Investor A/B (`c1`)
- [x] Credential-gated `VaultCreate` (`DomainID` + `tfVaultPrivate`) — domain gate live (`b1`)
- [x] Uncredentialed `VaultDeposit` probe in b2 — `tecNO_AUTH` captured verbatim on-chain (`c3`)
- [x] Pre-maturity MPT share transfer A→B (`tesSUCCESS`); A→Uncredentialed (`tecNO_AUTH`) (`c4`)
- [x] MPT auth probe (`c2`) — surfaces `tecNO_PERMISSION` on vault-managed MPTs (DX-09 logged)
- [x] DevEx findings DX-07 through DX-12 logged in `docs/DEVEX_LOG.md` (12 total)
- [x] Full Phase C `c1 → b0 → b1 → b2 → b3 → b4 → c2 → c4 → b5` lifecycle verified on Devnet

**Done (Phase D)**

- [x] Coupon injection probe (`VaultDeposit` + `tfVaultDonation`) — PPS before/after, DX-13 probe (`d1`)
- [x] Phase-gate rejection demos — 3+ verbatim rejection codes captured (`d2`)
- [x] DevEx feedback report — submission copy at [`DEVEX_FEEDBACK.md`](DEVEX_FEEDBACK.md) (full draft [`docs/DEVEX_REPORT.md`](docs/DEVEX_REPORT.md); log [`docs/DEVEX_LOG.md`](docs/DEVEX_LOG.md))
- [x] On-chain transactions table filled with Devnet explorer links

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
| `VaultDeposit` — `tfVaultDonation` coupon | Investment | `scripts/06_coupon_injection.ts` | Done |
| Permissioned Domain / Credentials | Setup | `scripts/03_permissioned_domain.ts` | Done |
| MPT share transfer (+ rejection) | Investment | `scripts/07_mpt_transfer.ts` | Done |
| Phase-gate rejections | All phases | `scripts/10_rejection_demos.ts` | Done |

---

## On-chain transactions

> Links added as transactions confirm on Devnet during the sprint.

| Step | Transaction hash | Explorer |
|---|---|---|
| VaultCreate (gated, DomainID + tfVaultPrivate) | `1899CC04` | [explorer](https://devnet.xrpl.org/transactions/1899CC0430528EF94E0C745DDDB6C20E9A4EA91D5BD0B5FBB2466C946E8F7B87) |
| PermissionedDomainSet | `CE2BC853` (object) | [object](https://devnet.xrpl.org/objects/CE2BC85376404029F8857B51F8D9828F0C6FB15CD4676C5ED960E7AEAAAA9CEB) |
| Uncred VaultDeposit — rejected `tecNO_AUTH` (C3) | `DFDCCA5D` | [explorer](https://devnet.xrpl.org/transactions/DFDCCA5DD81A13449D60B9B23F94D512679A64A0BD35EBBB90F8DB82FE6CB6F2) |
| Subscription — Investor A | `B2AF328C` | [explorer](https://devnet.xrpl.org/transactions/B2AF328C5307EA99C222E63EA292899503713A770D64E28516E510C61E946794) |
| Subscription — Investor B | `D8E73B08` | [explorer](https://devnet.xrpl.org/transactions/D8E73B0884CCDAD0A5292CBDDAD5BB6DCE40138DEBAD9751B173CD1902AFC762) |
| LoanSet (dual-sign) + drawdown | `A7E879A0` | [explorer](https://devnet.xrpl.org/transactions/A7E879A04EE4450396320CEAEDB80A965190C3A69DA04CCCD138676D0066A39D) |
| LoanPay (repayment) | `04BFE0BB` | [explorer](https://devnet.xrpl.org/transactions/04BFE0BBA65B8F21A26CF4DAEC513007B63F6B37339BC5C2EEBC2790590DE618) |
| MPT transfer A → B (`tesSUCCESS`) | `69BEF2F8` | [explorer](https://devnet.xrpl.org/transactions/69BEF2F8BC61E738D228639AB11CC535C56D6F37E7A4D0CE6DCE6E7CCAC41C98) |
| MPT transfer A → Uncredentialed (`tecNO_AUTH`) | `B6C4442D` | [explorer](https://devnet.xrpl.org/transactions/B6C4442D8E19DE4D5919DF1C1C2620A340BB72154FA866DC08180A48E0ABE3CB) |
| Redemption — Investor A | `0122EDDE` | [explorer](https://devnet.xrpl.org/transactions/0122EDDE15ED00E5717128A80B50896B8B7F23413BA2E119827488DC5065F175) |
| Redemption — Investor B | `BA84662D` | [explorer](https://devnet.xrpl.org/transactions/BA84662D4B2C9ED8E9EB9688893547211308A86BABA807D4594FB868BA6CEB74) |
| Coupon injection (`tfVaultDonation` probe) | `temINVALID_FLAG` — flag absent from devnet 3.4.0-rc5 (rejected pre-ledger; see [DX-13](docs/DEVEX_LOG.md#dx-13--tfvaultdonation-flag-absent-from-xrpljs-sdk-ripple-binary-codec-and-published-docs)) | — |

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

The formal submission feedback report is at [`DEVEX_FEEDBACK.md`](DEVEX_FEEDBACK.md) (repo root) — narrative answers to the Track 2 DevEx prompts. Structured findings: [`docs/DEVEX_LOG.md`](docs/DEVEX_LOG.md).

---

## Pitch deck

HTML pitch (≤10 sections, keyboard ← →): open [`pitch.html`](pitch.html) in a browser.

**Speaker script & demo narration** (what to say, timing, explorer cues): [`docs/PITCH_SCRIPT.md`](docs/PITCH_SCRIPT.md).

---

## Team

DeVinci Blockchain · XRPL Lending Protocol Hackathon 2026
