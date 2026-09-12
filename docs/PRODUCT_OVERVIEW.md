# XRPL Private Credit Fund — Product Overview

A permissioned, on-chain private credit fund built on the XRPL Lending Protocol. Each vault is one closed-ended funding campaign: institutional investors who pass on-chain KYC pool capital into that campaign’s vault, a broker originates a loan to a borrower under the campaign mandate, and yield flows back through share price appreciation — all settled on-chain with no intermediary custody.

---

## The problem

Private credit is one of the largest and fastest-growing asset classes globally, yet it remains structurally opaque and illiquid for most participants:

- **Access is gated by relationships, not by a portable rule.** Participation often depends on who you know and opaque manager discretion, not on a clear, auditable eligibility status that other participants can verify.
- **Positions are illiquid.** Once committed, investors are locked in until maturity with no secondary exit path.
- **Settlement is slow and manual.** Capital calls, interest payments, and repayments involve wire transfers, back-office reconciliation, and trust in counterparties.
- **Compliance is off-chain.** KYC/AML checks live in external systems that cannot be verified by other participants or enforced at the token level.

This product does **not** claim that private credit becomes open to everyone. Accreditation and KYC remain — often legally required. The problems above are about opacity, illiquidity, and manual settlement *inside* a permissioned market, not about deleting the perimeter.

---

## The solution

This protocol brings private credit on-chain using the XRP Ledger's native lending primitives. Each closed-ended vault is best read as **one funding campaign**: a single capital raise with a fixed calendar and a stated mandate (for example, “credit to quantum startups”). Investors who want that theme subscribe to **that** vault; a later campaign under a different mandate is a **new** vault with new dates. The thematic mandate is product narrative and broker underwriting — on-chain, the vault enforces phases and investor credentials, not the industry label of the borrower.

That vault manages the full fund lifecycle — from investor on-boarding and capital subscription through loan origination, coupon payments, repayment, and final redemption — with every state change recorded as an immutable ledger transaction.

Three properties distinguish this from a simple tokenised bond:

**1. Compliance enforced at the token level — without recreating relationship opacity.**
Investors must hold a KYC Credential issued by the fund manager's Permissioned Domain before they can deposit capital or receive vault shares. Accreditation still gates access; what changes is *how*. Eligibility becomes an on-chain, auditable credential rather than an off-chain relationship, and once issued it is enforced by the protocol itself — not a front-end gatekeeping layer. An uncredentialed address cannot deposit, full stop. The same perimeter then enables the liquidity and settlement improvements below, instead of deepening the “who you know” problem.

**2. Vault shares are tradeable, not locked.**
During the locked Investment phase (when deposits and withdrawals are both blocked), credentialed investors can transfer their vault shares to other credentialed investors. This gives participants a pre-maturity exit path without breaking the fund's lifecycle or the compliance perimeter. Share transfers are restricted to issuer-authorized holders, so the KYC ring is preserved end-to-end.

**3. Yield is transparent and verifiable.**
There is no off-chain yield calculation. Yield is delivered entirely through Price Per Share (PPS) appreciation. When the broker injects a coupon payment or the borrower repays principal plus interest, cash lands in the vault and PPS rises for all shareholders instantly. Every investor's yield can be independently verified from on-chain state — no trust required.

---

## How it works

The fund operates in three sequential phases, each enforced by the protocol. No transaction type is accepted outside its valid phase.

### Phase 1 — Subscription

The vault opens for capital raising. Credentialed investors call `VaultDeposit` and receive MPT (Multi-Purpose Token) shares proportional to their contribution. Shares are minted at the current Price Per Share (initially 1.0 XRP per share). The vault accumulates capital until the Subscription window closes.

During this phase:
- Only KYC-credentialed addresses can deposit.
- An uncredentialed deposit is rejected at the protocol level with an error identifying the missing credential.
- Share balances are visible on-ledger in real time.

### Phase 2 — Investment

Deposits and withdrawals are locked. The broker originates a loan by submitting a `LoanSet` transaction co-signed by the borrower, then executes the drawdown — transferring XRP from the vault to the borrower's account.

During this phase:
- The broker injects a coupon payment mid-term via `VaultDeposit` with the `tfVaultDonation` flag. This adds XRP to the vault without minting new shares, causing PPS to rise for all current holders.
- Credentialed investors can transfer their MPT shares to other credentialed investors, providing a secondary liquidity path within the compliance perimeter.
- Transfers to non-credentialed or non-authorized addresses are rejected at the token level.

### Phase 3 — Redemption

The borrower repays principal plus accrued interest. The repayment lands in the vault, causing a final PPS increase. The Redemption window then opens: investors call `VaultWithdraw`, their MPT shares are burned, and they receive XRP at the current (higher) PPS — recovering their original capital plus all accrued yield.

---

## Core features

### Permissioned access (Permissioned Domains & Credentials)

The fund manager creates a Permissioned Domain on-ledger and issues KYC Credentials to verified **investors** (borrower fitness for the campaign mandate — e.g. “is this a real quantum startup?” — remains off-chain underwriting before `LoanSet`). The vault is configured to require a valid credential for deposits. This creates an on-chain KYC ring that:

- Rejects uncredentialed deposits automatically, without any application-layer logic.
- Restricts MPT share transfers to issuer-authorized holders.
- Makes the compliance perimeter auditable by any third party reading the ledger.
- Keeps the market permissioned while removing relationship opacity: once credentialed, rights are protocol rules, not private manager discretion.

### Vault shares as transferable positions (MPTs)

Vault shares are issued as Multi-Purpose Tokens with `lsfMPTRequireAuth`. The fund manager must explicitly authorize each investor address to hold shares. This means:

- Share balances are ledger objects, not database records.
- Transfers are atomic and settled in seconds.
- The compliance ring travels with the token — the protocol will not route shares to an unauthorized address.

### Price Per Share as the yield mechanism

PPS is the single source of truth for investor yield. It rises when cash enters the vault without a corresponding share minting event:

| Event | PPS effect |
|---|---|
| Investor deposit | No change (shares minted proportionally) |
| Coupon injection (`tfVaultDonation`) | Rises — same cash, fewer outstanding shares |
| Borrower repayment | Rises — principal + interest received, no new shares |
| Investor withdrawal | No change (shares burned proportionally) |

This is XRPL Lending Protocol V1.1's cash-basis accounting model: yield is recognised when cash arrives, not when a loan is booked.

### Pre-maturity exit via share transfer

During the locked Investment phase, the only liquidity mechanism is peer-to-peer share transfer between credentialed investors. An investor who needs liquidity can transfer shares to another authorized investor at any agreed price. The protocol enforces that both parties must be credentialed and MPT-authorized — it does not enforce the price, which is negotiated off-chain.

This turns the lock-up period from a product limitation into a product feature: the fund can enforce a fixed Investment phase duration while still offering participants a structured exit path.

### Transparent loan mechanics

Every loan event is an on-chain transaction:

- **Origination:** `LoanSet` co-signed by broker and borrower — both parties' intent is recorded immutably.
- **Drawdown:** XRP leaves the vault and arrives in the borrower's account; the vault's `AssetsTotal` decreases.
- **Repayment:** XRP arrives in the vault; `AssetsTotal` and PPS increase immediately.

There is no oracle, no off-chain accounting system, and no trusted intermediary between origination and repayment.

---

## Participants

| Role | What they do |
|---|---|
| **Fund Manager / Broker** | Creates the vault and Permissioned Domain, issues KYC Credentials, originates the loan, injects coupon payments |
| **Investor A / Investor B** | KYC-credentialed depositors; receive MPT shares, earn yield via PPS appreciation, may transfer shares during Investment |
| **Borrower** | Draws down capital from the vault via `LoanSet`; repays principal + interest at maturity |
| **Uncredentialed account** | Demonstrates what happens when a non-KYC'd address attempts to deposit or receive shares — rejected at the protocol level |

---

## Architecture

All state lives on the XRP Ledger. There is no off-chain database, no custody layer, and no application server.

```
  ┌─────────────────────────────────────────────────────┐
  │           Script runner (TypeScript / Node.js)       │
  │   One script per lifecycle step, run sequentially    │
  └────────────────────────┬────────────────────────────┘
                           │  xrpl.js / WebSocket
                           ▼
  ┌─────────────────────────────────────────────────────┐
  │                  XRPL Ledger                         │
  │                                                      │
  │  Closed-ended Vault (XLS-65)                         │
  │    └── MPT vault shares (lsfMPTRequireAuth)          │
  │  Loan object (XLS-66)                                │
  │  Permissioned Domain + KYC Credentials               │
  │  Accounts: Fund Manager, Investor A, Investor B,     │
  │            Borrower, Uncredentialed                  │
  └─────────────────────────────────────────────────────┘
```

**Key design choices:**
- **No frontend required for the core protocol.** The protocol is entirely script-driven; a UI is additive.
- **No shared runtime state between scripts.** Each script reads what it needs from the ledger. Scripts are independently re-runnable.
- **Devnet for development.** Transactions are public and verifiable on the XRPL Devnet explorer (`devnet.xrpl.org`).

---

## Demo flow (the narrative arc)

A 4-minute walkthrough that shows the full private credit lifecycle on-chain:

1. **Setup** — Five accounts funded; Permissioned Domain created; KYC Credentials issued to Investor A and Investor B.
2. **Compliance gate** — An uncredentialed account attempts to deposit → rejected by the protocol. The KYC ring is live.
3. **Subscription** — Investor A and Investor B deposit XRP, receive MPT shares. PPS holds at 1.0.
4. **Loan origination** — Broker and Borrower co-sign a `LoanSet`. Capital flows from vault to borrower. Vault's `AssetsTotal` drops; PPS unchanged (cash-basis model at work).
5. **Coupon injection** — Broker injects interest via `tfVaultDonation`. PPS rises — verifiable on the ledger, no trust needed.
6. **Share transfer** — Investor A sells half their position to Investor B during the locked phase. Transfer to the uncredentialed account is rejected. The compliance perimeter holds at the token level.
7. **Repayment** — Borrower repays principal + interest. PPS rises again.
8. **Redemption** — Both investors withdraw at the final PPS, receiving more XRP than they deposited. Yield is the PPS delta times shares held. MPT shares burned.

---

## Tech stack

| Layer | Technology |
|---|---|
| Blockchain | XRP Ledger (public Devnet) |
| Lending protocol | XLS-66 Lending Protocol V1.1 |
| Vault standard | XLS-65 Single Asset Vault (closed-ended) |
| Compliance primitives | Permissioned Domains & Credentials, MPTs with `lsfMPTRequireAuth` |
| XRPL client | `xrpl.js` |
| Language | TypeScript / Node.js |
| Asset | XRP (native) |

---

## Related documents

- [`docs/PRODUCT_DEFINITION.md`](./PRODUCT_DEFINITION.md) — Full sprint reference: scope decisions, architecture rationale, risk register, and sprint roadmap.
- [`docs/PLANNING.md`](./PLANNING.md) — Sprint task breakdown and progress tracking.
