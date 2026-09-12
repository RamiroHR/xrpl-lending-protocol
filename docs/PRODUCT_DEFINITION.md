# Product Definition — XRPL Permissioned Private Credit Fund

Reference document for the hackathon team. Builds on [`docs/BRAINSTORM.md`](./BRAINSTORM.md) (frozen strategy and track decision), [`docs/initial-thin-idea.md`](./initial-thin-idea.md) (original seed), and [`../arxiv/hackthon-docs/notion-hackathon-brief.md`](../arxiv/hackthon-docs/notion-hackathon-brief.md) (authoritative rules and judging rubric). Consolidates all settled decisions on track, use case, scope, architecture, and demo flow into a single reference for the sprint. Not intended as a commercial product spec — the submission is a working prototype plus a developer-feedback report.

---

## 1. Executive summary

This project is a permissioned, closed-ended private credit fund built on the XRPL Lending Protocol V1.1. Investors hold KYC credentials issued by a Permissioned Domain; only credentialed addresses can deposit into the vault during the Subscription window or hold fund shares. The broker originates a loan during the Investment period, injects a coupon payment mid-term, and the borrower repays before Redemption opens. Vault shares are MPTs — they can transfer between credentialed investors during the locked Investment phase, giving participants a pre-maturity exit path within the compliance perimeter.

The submission targets **Track 2** (closed-ended vault, Lending Protocol V1.1, public XRPL Devnet, `xrpl.js@5.2.0-beta.0`) with a **Loaded** flavour: Permissioned Domains & Credentials plus MPTs. The chosen framing — institutional private credit fund rather than "tokenized bond" — differentiates from the use case the opening speakers named as their example, which most teams will replicate.

There is no commercial dimension. The product is a hackathon submission competing under a 40/30/20/10 judging rubric (developer feedback quality, technical execution, creativity, presentation). Every scope decision is optimised against that rubric, not against a real-world go-to-market plan.

The MVP consists of ten TypeScript scripts, each covering one step of the on-chain lifecycle, run against the public XRPL Devnet. No frontend is required; the demo uses a terminal printout of confirmed transaction hashes and XRPL Devnet explorer links. A three-page manual DevEx feedback report with precise proposed fixes is a first-class deliverable alongside the code.

---

## 2. Context and value proposition

**Context.** The XRPL Lending Protocol Hackathon runs September 12–13, 2026 at IIM Paris–La Défense, hosted by DeVinci Blockchain and Ripple. Teams of 2–4 have roughly 25 hours of hacking time, a Sunday 13:00 code freeze, and a 4-minute live demo. The judging rubric weights developer feedback quality at 40%, technical execution at 30%, creativity at 20%, and presentation at 10%. The primary deliverable is not a finished product — it is a credible lending flow plus specific, reproducible developer feedback on the protocol and SDK.

**Target audience.** The primary audience is the jury (Ripple engineers Maxime and Shota), who evaluate whether the team exercised XLS-65/66 in a non-trivial way and produced precise, actionable DevEx feedback. The secondary audience is the hackathon team itself: this document is the sprint north star. There is no end-user audience in the traditional sense; the on-chain participants (investors, broker, borrower) are test accounts operated by the team.

**Problem.** Most Track 2 teams will implement the "tokenized bond" example the opening speakers used, producing submissions that are technically similar and narratively identical. Meanwhile, the 40% DevEx criterion rewards teams that go deeper into under-documented territory — the beta SDK (`xrpl.js@5.2.0-beta.0`), V1.1's cash-basis accounting, phase-gate error message quality, and the interaction between MPTs and Permissioned Domains. Vanilla submissions that stay on the happy path generate thin feedback. Teams on Track 1 with the stable library face less novel friction. The gap to exploit is in Track 2's newer, less-documented feature surface.

**Solution.** The permissioned private credit fund framing uses the same V1.1 closed-ended vault mechanics as a tokenized bond but wraps them in an institutional compliance story that judges haven't seen before. Three explicit differentiators, each tied to a concrete demo moment:

1. **Permissioned Domains as the KYC gate** — a live rejection of an uncredentialed `VaultDeposit` is more compelling than a described restriction, and the integration's rough edges are a direct DevEx feedback surface (see §5.2).
2. **MPT shares with `lsfMPTRequireAuth`** — vault shares are MPTs whose transfer is restricted to issuer-authorized (i.e., credentialed) addresses, making the compliance perimeter on-chain rather than off-chain policy (see §5.3).
3. **Pre-maturity exit via share transfer** — during the Investment phase (deposits and withdrawals both blocked), credentialed investors can trade positions by transferring MPT shares, turning the lock-up from a product limitation into a product feature (see §5.3.d).

Two additional mechanics deepen the demo without requiring new primitives: coupon injection via `VaultDeposit` with `tfVaultDonation` (mid-Investment PPS rise, see §5.4.a) and a cash-basis accounting proof point on repayment (see §5.4.b).

---

## 3. Main user flow (MVP)

The demo lifecycle maps directly onto the three-phase closed-ended vault structure: Subscription, Investment, and Redemption. Phase dates are compressed to fit within the event timeline — roughly 30 minutes for Subscription, 4 hours for Investment, and 30 minutes for Redemption.

Before the vault opens, the team runs `scripts/01_setup_accounts.ts` to fund five accounts from the public Devnet faucet: Investor A, Investor B, Borrower, Broker, and one uncredentialed account used only for rejection demos. `scripts/02_create_vault.ts` creates the closed-ended vault with compressed `SubscriptionDate` and `RedemptionDate` values. `scripts/03_permissioned_domain.ts` creates the Permissioned Domain and issues Credentials to Investor A and Investor B, and configures the vault's MPT with `lsfMPTRequireAuth` so the fund manager must authorize each holder before they can receive shares.

During Subscription, `scripts/04_subscription.ts` runs two deposits: Investor A and Investor B each call `VaultDeposit`, receive MPT shares proportional to their contribution, and the script logs the share balances. The same script attempts a `VaultDeposit` from the uncredentialed account — this is rejected with a protocol error, which is captured verbatim for the DevEx report. The script also probes the over-subscription cap (depositing above any maximum) and records the protocol's response. See §5.2.a–c.

Once the Investment phase opens, deposits and withdrawals are blocked. `scripts/05_investment.ts` submits the `LoanSet` transaction requiring both the broker's and borrower's signatures, then executes the drawdown. The multi-party signing flow is a deliberate DevEx probe — was the coordination pattern clear from the SDK? See §5.4.c. Mid-Investment, `scripts/06_coupon_injection.ts` has the broker call `VaultDeposit` with the `tfVaultDonation` flag, injecting interest and causing PPS to rise; the script logs PPS before and after and checks whether the delta matches the expected math (§5.4.a).

Also during Investment, `scripts/07_mpt_transfer.ts` transfers half of Investor A's shares to Investor B — both are credentialed, so this succeeds. The same script then attempts to transfer shares to the uncredentialed account, which is rejected. This scene (§5.3.d) is the demo's most distinctive moment: it shows that the compliance perimeter is enforced at the token level, not just at the vault gate.

`scripts/08_repayment.ts` submits the borrower's single repayment. The script captures `AssetsTotal` and PPS before and after, demonstrating V1.1's cash-basis accounting: interest is recognised at payment time, not at loan origination (§5.4.b). Once Redemption opens, `scripts/09_redemption.ts` calls `VaultWithdraw` from both Investor A (whose share balance is lower after the transfer) and Investor B (whose balance is higher). Both receive XRP plus accrued yield proportional to their final share counts. MPT shares are burned.

`scripts/10_rejection_demos.ts` runs a batch of rejection scenarios — `LoanSet` during wrong phase, `VaultWithdraw` during Investment — and logs every error message verbatim for the DevEx report. The DevEx feedback report (see §5.5) is written continuously during the sprint by one designated team member and finalized on Sunday morning, before the code freeze.

---

## 4. Architecture

**On-chain layer (XRPL public Devnet).** All state lives on the ledger. The on-chain layer owns: the closed-ended Single Asset Vault object (XLS-65), the loan object (XLS-66), the Permissioned Domain and Credential objects, MPT issuance and authorization, and the five funded accounts. No off-chain database exists; the ledger is the only persistence layer. This layer is not "owned" by a person — it is the XRPL public Devnet, operated by Ripple.

**Off-chain script runner (TypeScript / Node.js — owned by the team).** Ten TypeScript scripts, one per flow step, each connecting to the public Devnet via `xrpl.js@5.2.0-beta.0` over WebSocket (`wss://s.devnet.rippletest.net:51233`). Each script is self-contained: it reads account seeds from a local config file, submits one or more transactions, logs transaction hashes and key state values (PPS, share balances, error codes) to stdout, and exits. Scripts do not share runtime state — they are run sequentially by hand during the sprint and during demo setup. There is no API, no server process, and no database.

**Communication.** Scripts connect directly to the XRPL Devnet WebSocket endpoint. Authentication between scripts and the ledger is via account secret keys held in a local `.env` file (not committed). No cross-service calls exist; there is only one service.

```
  ┌─────────────────────────────────────────────────────┐
  │           Off-chain script runner                   │
  │  scripts/01 → 02 → 03 → 04 → ... → 10  (Node.js)   │
  └────────────────────┬────────────────────────────────┘
                       │  xrpl.js@5.2.0-beta.0 / WSS
                       ▼
  ┌─────────────────────────────────────────────────────┐
  │           XRPL public Devnet                        │
  │                                                     │
  │  Vault (XLS-65) ──── Loan (XLS-66)                  │
  │  Permissioned Domain + Credentials                  │
  │  MPT (vault shares, lsfMPTRequireAuth)              │
  │  Accounts: InvA, InvB, Borrower, Broker, Uncred     │
  └─────────────────────────────────────────────────────┘
                       │
                       ▼
  ┌─────────────────────────────────────────────────────┐
  │  XRPL Devnet Explorer  (devnet.xrpl.org)            │
  │  Read-only — used during demo for tx verification   │
  └─────────────────────────────────────────────────────┘
```

---

## 5. Features (MVP)

This section covers every feature in the functional MVP. Scripts from §4 are referenced by number. Anything not listed here is out of scope for this submission and belongs in §7.

### 5.1 — Account and environment setup

**a) Five-account funded environment**
Fund all participant accounts from the public Devnet faucet in a single setup script.

`scripts/01` hits the public Devnet faucet for five accounts: Investor A, Investor B, Borrower, Broker, and one uncredentialed account. Each account's seed is written to a local `.env` file for use by subsequent scripts. The faucet endpoint is `https://faucet.devnet.rippletest.net/accounts`. Funded balances must be high enough to cover XRP reserves for all objects the account will own (vault shares, credentials, etc.) plus the XRP amounts deposited or loaned.

**b) XRPL DevEx hook installation**
Install and verify the DevEx hook on every developer machine before writing a line of application code.

The DevEx hook (`github.com/RippleDevRel/xrpl-devex-hook`) is a mandatory deliverable per the brief. Install it using the provided invite code `BFT-PARIS-26`. Verify it is running on every machine in the team before the sprint begins. The hook captures automated DevEx telemetry that supplements the manual feedback report (see §5.5).

### 5.2 — Vault lifecycle and phase gates

**a) Closed-ended vault creation**
Create an XLS-65 Single Asset Vault with compressed phase dates, denominated in XRP, with MPT vault shares configured.

`scripts/02` submits a `VaultCreate` transaction with `VaultKind` set to closed-ended, `SubscriptionDate` and `RedemptionDate` compressed to fit within the event timeline (~30-minute Subscription, ~4-hour Investment, ~30-minute Redemption), and the vault asset set to XRP. The MPT issuance is configured at vault creation with `lsfMPTRequireAuth` so the fund manager (Broker account) must authorize each investor before they can hold shares. The script logs the vault's on-ledger object ID and the Devnet explorer link.

**b) Subscription deposits with phase gate**
Accept deposits from credentialed investors during Subscription; reject deposits from uncredentialed accounts and from any account after Subscription closes.

`scripts/04` calls `VaultDeposit` from Investor A and Investor B sequentially. For each, it logs the resulting MPT share balance and the vault's `AssetsTotal`. It then calls `VaultDeposit` from the uncredentialed account and captures the error code and error message verbatim — this is a primary DevEx feedback data point. The script also probes the over-subscription cap: it attempts a deposit larger than the vault's configured maximum (if any) and records whether the protocol rejects it, silently caps it, or has no such limit. All rejection errors are logged with the full transaction JSON for the feedback report.

**c) Phase-gate rejection demonstrations**
Demonstrate all three phase-gate rejections live: wrong-phase deposit, wrong-phase withdrawal, and wrong-phase loan operation.

`scripts/10` submits a batch of intentionally invalid transactions: `VaultDeposit` during Investment, `VaultWithdraw` during Investment, and `LoanSet` during Subscription. Every error response is captured verbatim — error code, error message, and any additional fields — and logged with the library version. The quality of these error messages is a direct DevEx feedback surface: are they actionable, or do they require cross-referencing ledger state to interpret?

**d) Redemption and share burn**
Allow both credentialed investors to withdraw principal plus accrued yield during Redemption; burn MPT shares on withdrawal.

`scripts/09` calls `VaultWithdraw` from Investor A and Investor B. Because Investor A transferred half their shares to Investor B during Investment (§5.3.d), their final balances differ: B withdraws more than they originally deposited, A withdraws less. The script verifies that MPT share balances reach zero after both withdrawals and that the total XRP returned matches the vault's `AssetsTotal` pre-redemption.

### 5.3 — Permissioned Domains and compliance gating

**a) Permissioned Domain creation and credential issuance**
Create a Permissioned Domain and issue KYC Credentials to the two investor accounts; configure the vault to require domain membership for deposits.

`scripts/03` creates a Permissioned Domain object owned by the Broker account. It then issues Credentials to Investor A and Investor B, authorizing them as KYC-verified participants. The fund manager (Broker) also calls the MPT's authorization endpoint to allow Investor A and Investor B to hold vault shares. The uncredentialed account receives no credential and no MPT authorization. The script logs the Domain object ID, both Credential object IDs, and their on-ledger links.

**b) Credential-gate rejection at VaultDeposit**
Reject a `VaultDeposit` from an account that holds no valid Credential.

Covered by `scripts/04` (§5.2.b). The uncredentialed account's rejected deposit is the live demo's opening moment — it establishes the compliance narrative immediately. The error message is the first DevEx probe: is the rejection reason clear (missing credential), or does the error only say "transaction failed"?

**c) MPT share transfer restricted to authorized holders**
Enforce that vault shares (MPTs) can only move between issuer-authorized addresses; reject transfers to non-authorized addresses.

`scripts/07` first transfers shares from Investor A to Investor B — both are MPT-authorized, so this succeeds. It then attempts the same transfer to the uncredentialed account. Because `lsfMPTRequireAuth` requires the issuer to have authorized the recipient, this is rejected. The error message is the second major DevEx probe: does the rejection explain that the recipient is not authorized, or is it opaque? The interaction between `lsfMPTRequireAuth` and Permissioned Domain Credentials is explicitly under-documented territory and a primary feedback contribution.

**d) Pre-maturity exit via MPT share transfer**
Allow credentialed investors to trade fund positions during the locked Investment phase by transferring MPT shares to other authorized investors.

Covered by `scripts/07` (§5.3.c above). The business narrative: because withdrawals are blocked during Investment, the share transfer mechanism provides the only liquidity path. Investor A can exit partially by selling shares to Investor B. Both accounts are credentialed and MPT-authorized, so the transfer proceeds. This is the demo's most distinctive moment and is unlikely to appear in other teams' submissions.

### 5.4 — Loan flow and accounting

**a) Coupon injection via `tfVaultDonation`**
Inject mid-Investment interest into the vault using `VaultDeposit` with the donation flag, causing PPS to rise for all shareholders.

`scripts/06` calls `VaultDeposit` from the Broker account with the `tfVaultDonation` flag set, injecting a fixed XRP amount as interest. The script logs PPS before and after the call and verifies that the delta matches the injected amount divided by total shares outstanding. This is the bond coupon equivalent: interest delivered proportionally to all shareholders on-chain. The DevEx probe: is `tfVaultDonation` clearly documented in the V1.1 spec? Does the PPS math match?

**b) Repayment and cash-basis accounting proof**
Show that interest is recognised when the repayment arrives, not at loan origination — demonstrating V1.1's cash-basis accounting model.

`scripts/08` submits the borrower's single repayment. Before and after, it logs `AssetsTotal`, PPS, and the broker's debt metrics. The key observation: `AssetsTotal` and PPS do not change at `LoanSet` origination — they change only when the repayment is received. This differs from a full-accrual model and is explicitly called out in the brief as a potential source of confusion. The DevEx note and proposed documentation fix for this behaviour are guaranteed feedback material.

**c) Multi-party `LoanSet` origination and drawdown**
Originate a loan requiring both broker and borrower signatures, then execute the drawdown.

`scripts/05` constructs a `LoanSet` transaction, has the broker sign it, passes it to the borrower for a second signature, and submits. It then submits the drawdown transaction. The multi-party signing coordination pattern is a direct DevEx probe: does `xrpl.js@5.2.0-beta.0` expose a clear helper for multi-signer flows, or must the team construct raw JSON and manually manage the `Signers` array? The answer goes in the feedback report regardless of which path works.

### 5.5 — DevEx capture and reporting

**a) Continuous friction logging during the sprint**
Assign one team member as friction logger; record every unexpected SDK behaviour, documentation gap, and error message quality issue as it happens.

One team member is designated friction logger for the full sprint. For every friction point, they record: category (client library / UX / missing primitive / documentation / other), title, description, repro steps or transaction link, severity, library version (`xrpl.js@5.2.0-beta.0`), and a one-sentence proposed fix. Logging happens in a running document updated continuously — not assembled at the end from memory. The DevEx hook provides automated coverage; the manual log covers judgment-based observations the hook cannot capture.

**b) Manual DevEx feedback report**
Produce a ≤3-page report covering 5+ precisely described issues with proposed fixes, submitted at the repository root.

The report states track (Track 2), flavour (Loaded), environment (public XRPL Devnet), and library version at the top. Each issue follows the format in the brief: category, title, description, repro/transaction link, severity, library+version, proposed fix. Proposed fixes score above pure flags on the 40% criterion. Known pre-identified friction surfaces: phase-gate error message legibility, cash-basis accounting documentation, `tfVaultDonation` flag documentation, `lsfMPTRequireAuth` + Permissioned Domains interaction, multi-party `LoanSet` coordination, and explorer vs. ledger documentation consistency.

**c) README and submission artefacts**
Publish a README covering the mandatory fields plus on-chain transaction links.

README must state: what the project does, setup instructions, chosen track (Track 2), environment (public XRPL Devnet), library version (`xrpl.js@5.2.0-beta.0`), and every XLS-65/66 transaction type used. Every significant transaction must include a verified XRPL Devnet explorer link. The slide deck (≤10 slides) covers use case, on-chain flow, and the three most important friction points with proposed improvements.

---

## 6. Tech stack

| Layer | Choice | Notes |
|---|---|---|
| Blockchain protocol | XRPL public Devnet | Mandatory for Track 2; wall-clock time, cannot fast-forward |
| Lending protocol | XLS-66 Lending Protocol V1.1 | Closed-ended vault; cash-basis accounting |
| Vault standard | XLS-65 Single Asset Vault | Closed-ended `VaultKind`; asset = XRP |
| XRPL client library | `xrpl.js@5.2.0-beta.0` | Mandatory for Track 2; beta status is a deliberate DevEx friction source |
| Language / runtime | TypeScript / Node.js | Team's primary language; matches the beta SDK's native type support |
| Script architecture | One `.ts` file per flow step | 10 scripts; no shared runtime state; each re-runnable independently |
| XRPL primitives (Loaded) | Permissioned Domains & Credentials + MPTs | Two primitives; TokenEscrow conditional (see §7.1.a) |
| Explorer / verification | devnet.xrpl.org | Public Devnet explorer for transaction confirmation links |
| DevEx tooling | XRPL DevEx hook (`BFT-PARIS-26`) | Mandatory; installed on every team machine before hacking begins |
| Frontend | None for MVP | React nice-to-have after all scripts confirmed; do not start before Sat 17:00 |
| Secrets management | Local `.env` file (not committed) | Account seeds only; no production secrets |
| Payments / commercial | Not applicable | Hackathon submission; no monetization |

---

## 7. Optional features (post-MVP)

Items intentionally cut to keep sprint scope tight. Exception: TokenEscrow (§7.1.a) is conditional on sprint progress, not purely post-event.

### 7.1 — Stretch goals (within this sprint, time-conditional)

**a) TokenEscrow as borrower collateral.** Borrower locks XRP in a `TokenEscrow` before drawdown; escrow is released on repayment or forfeited on default. Turns the loan from unsecured to secured, strengthens the institutional credit narrative, and opens a DevEx feedback surface on `TokenEscrow` + XLS-66 interaction. Add only if both MPTs and Permissioned Domains are fully working with at least 4 hours before code freeze.

**b) React frontend dashboard.** Minimal UI showing vault state (phase, PPS, share balances, loan status) updated on each confirmed transaction. Start only after all 10 scripts are confirmed and running correctly. A working terminal demo is strictly preferable to a broken UI.

### 7.2 — Post-submission product extensions

**a) Impairment and default path.** Mark a loan impaired, process default, show how losses affect vault shares and PPS. Not required by Track 2 minimum bar; adds scope risk.

**b) Multi-loan portfolio.** Originate multiple loans from one vault during the Investment phase, creating a diversified credit portfolio. One loan is sufficient to cover the technical execution criterion.

**c) Permissioned Domain revocation.** Revoke a Credential mid-lifecycle and show the resulting access restrictions. The subscription gate and transfer rejection already demonstrate the compliance primitive sufficiently.

**d) Secondary market for MPT shares.** A DEX or peer-to-peer listing mechanism allowing credentialed investors to trade shares at a market price rather than face value. The intra-vault transfer (§5.3.d) is the MVP version of this story.

**e) RLUSD denomination.** Replace XRP as the vault asset with RLUSD. Not possible on public Devnet (RLUSD faucet is Testnet-only per the brief). Revisit if RLUSD becomes available on Devnet.

**f) Variable loan interest rates.** Rate changes dynamically based on vault utilisation at origination time. Requires off-chain computation and a more complex `LoanSet` flow; not justified by a single-loan demo.

---

## 8. Roadmap (Sprint — Sep 12–13, 2026)

The sprint has a single gate: a working on-chain demo with a DevEx feedback report, submitted by Sunday 13:00. There is no Phase D monetization gate — this is a hackathon, not a commercial release. Phases A–D below are time blocks within the 25-hour sprint, not sequential milestones that must fully complete before the next begins.

Estimates are in hours, assuming a team of 2–4 with TypeScript experience and access to the V1.1 docs and reference lending app. No AI pair-programming time is budgeted separately — assume it is available throughout.

Difficulty key: `·` easy (familiar XRPL operations, documented in the brief) · `··` medium (multi-step or partially documented) · `···` hard (beta SDK, under-documented interaction, or timing-sensitive)

### Phase A — Critical path validation (Sat 11:30–13:00, ~1.5 h)

| # | Task | Owner | Est. (h) | Difficulty |
|---|---|---|---|---|
| A1 | Install DevEx hook on all machines; verify with a basic transaction | All | 0.5 | `·` |
| A2 | Fund all 5 accounts via Devnet faucet (`scripts/01`) | 1 person | 0.5 | `·` |
| A3 | Test `VaultCreate` in isolation — verify it lands on the explorer | 1 person | 0.5 | `··` |
| A4 | Test `VaultDeposit` and `VaultWithdraw` in isolation against a throwaway vault | 1 person | 0.5 | `··` |
| A5 | Test `LoanSet` (multi-party signing) in isolation | 1 person | 0.5 | `···` |

If A3–A5 surface a blocking SDK bug, fall back to raw JSON-RPC for that call and log the gap as a DevEx finding. Do not proceed to Phase B until the critical path is confirmed.

### Phase B — Core XLS-65/66 flow (Sat 13:00–17:00, ~4 h)

| # | Task | Owner | Est. (h) | Difficulty |
|---|---|---|---|---|
| B1 | `scripts/02`: VaultCreate with compressed dates | 1 person | 1 | `··` |
| B2 | `scripts/04`: Subscription deposits from A and B; log share balances | 1 person | 1 | `··` |
| B3 | `scripts/05`: LoanSet + drawdown; log explorer link | 1 person | 1 | `···` |
| B4 | `scripts/08`: Single repayment; log AssetsTotal + PPS delta | 1 person | 0.5 | `··` |
| B5 | `scripts/09`: Redemption withdrawals from A and B; verify yield split | 1 person | 0.5 | `··` |

Phase B delivers the Track 2 minimum bar. Run the full flow end-to-end at least once before proceeding to Phase C.

### Phase C — Loaded primitives (Sat 17:00–20:00, ~3 h)

| # | Task | Owner | Est. (h) | Difficulty |
|---|---|---|---|---|
| C1 | `scripts/03`: Permissioned Domain + Credential issuance to A and B | 1 person | 1.5 | `···` |
| C2 | Configure MPT `lsfMPTRequireAuth` on the vault | 1 person | 1 | `···` |
| C3 | `scripts/07`: MPT share transfer A→B (success) and A→uncredentialed (rejection) | 1 person | 0.5 | `··` |

Timebox C1 to Saturday 17:00–19:00. If Permissioned Domains are not working by 19:00, drop to MPT-only Loaded and document the setup friction as a DevEx finding.

### Phase D — Polish, rejections, and reporting (Sat 20:00 – Sun 12:30, ~8 h)

| # | Task | Owner | Est. (h) | Difficulty |
|---|---|---|---|---|
| D1 | `scripts/06`: Coupon injection via `tfVaultDonation`; verify PPS math | 1 person | 1 | `··` |
| D2 | `scripts/10`: Batch rejection demos; capture all error messages verbatim | 1 person | 1 | `·` |
| D3 | Probe over-subscription cap in `scripts/04`; record protocol response | 1 person | 0.5 | `·` |
| D4 | Write DevEx feedback report (≥5 issues, each with proposed fix) | 1 person | 2 | `··` |
| D5 | README with all mandatory fields + every on-chain tx link | 1 person | 1 | `·` |
| D6 | ≤10 slide deck (use case, on-chain flow, 3 friction points + fixes) | 1 person | 1.5 | `·` |
| D7 | TokenEscrow collateral (conditional — only if D1–D3 done by Sat 22:00) | 1 person | 2 | `···` |
| D8 | Rehearse the 4-minute demo arc; confirm all explorer links are live | All | 0.5 | `·` |

**Total sprint estimate:** ~18 hours of active work across 25 hours of calendar time. The gap is buffer for debugging, phase-transition waits, and the Sunday morning demo prep window.

---

## 9. Risks and mitigations

- **Beta SDK blocking bug.** `xrpl.js@5.2.0-beta.0` may have a bug on a required transaction type (VaultCreate, VaultDeposit, LoanSet, or VaultWithdraw). *Mitigations:* test all four transaction types in Phase A within the first 90 minutes; if one is broken, fall back to raw JSON-RPC for that call and document the SDK gap as a DevEx finding — the blocker becomes feedback material.

- **Wall-clock phase timing.** The vault's phase transitions happen in real time on the public Devnet. A transition occurring during a meal break or overnight creates a gap in the execution sequence. *Mitigations:* compress phases aggressively (Subscription ~30 min, Investment ~4 h, Redemption ~30 min starting before the Sunday morning demo window); set phone alarms for every phase boundary; assign one team member on standby at each transition.

- **Permissioned Domains setup overruns.** Setting up the Permissioned Domain and Credentials may take longer than estimated if the V1.1 docs are incomplete. *Mitigations:* timebox to Saturday 17:00–19:00; if not working by 19:00, drop to MPT-only Loaded and log the setup friction as a DevEx finding (R3 in BRAINSTORM).

- **MPT `lsfMPTRequireAuth` + Permissioned Domains undocumented interaction.** The KYC ring enforced at the token level may not work as expected, or the interaction between the two primitives may be entirely undocumented. *Mitigations:* test in Phase C immediately after credential issuance; if the KYC ring is not enforced at transfer time, drop Scene 4 from the demo and document the gap — this is a valuable feedback finding either way.

- **Crowded "tokenized bond" framing.** Many Track 2 teams will use the opening speakers' example verbatim. *Mitigations:* consistently name the submission "private credit fund / credit facility" in the README, slides, and oral presentation — never "tokenized bond."

- **Devnet latency spike at demo time.** A public Devnet congestion event could cause transactions to stall during the 4-minute live demo. *Mitigations:* pre-confirm all transactions by Saturday night; the Sunday demo shows confirmed explorer links and submits only one illustrative live transaction. Have backup screenshots ready.

- **DevEx report thin on proposed fixes.** Judges reward proposals, not flags. A report that only lists problems without fixes scores significantly lower on the 40% criterion. *Mitigations:* assign a dedicated friction logger from the sprint start; each logged issue must include a proposed fix before it is considered complete.

- **Multi-party LoanSet coordination unclear.** The broker + borrower multi-signature flow for `LoanSet` may require constructing raw JSON if the beta SDK does not expose a clean helper. *Mitigations:* read the V1.1 docs and reference lending app (`github.com/ripple/xrpl-reference-app-lending-sav`) before starting Phase B; treat any confusion as a DevEx issue with a proposed fix.

---

## 10. Open questions

**Beta SDK appetite.** Has anyone on the team been blocked for hours by a beta JavaScript dependency in a time-boxed build before? If yes, the 35% probability of R1 (blocking SDK bug) becomes a real concern. The alternative is Track 1 with stable `xrpl.js` and the T1-D dynamic rates dashboard (BRAINSTORM score 3.6), which gives up the 40% DevEx advantage but eliminates SDK risk entirely. *Recommendation:* stay on Track 2 unless the team has a specific recent bad experience with beta JS deps. The DevEx advantage is too large to abandon without a concrete reason. *Decision deadline:* before hacking begins Saturday 11:30.

**Permissioned Domains prior experience.** How many team members have implemented Permissioned Domains on XRPL before? If zero, the 3-hour timebox in Phase C (§8) may be too tight. *Recommendation:* read the Permissioned Domains documentation and the V1.1 reference app before the event; if nobody has prior experience, consider starting `scripts/03` during Saturday lunch rather than waiting for Phase C. *Decision deadline:* Saturday morning before hacking begins.

---

## 11. Related documents

- [`docs/BRAINSTORM.md`](./BRAINSTORM.md) — Frozen strategy document: Track 1 vs Track 2 scoring, full option ranking, demo flow, MVP scope, architecture sketch, and risk register. Primary source for this document.
- [`../arxiv/hackthon-docs/notion-hackathon-brief.md`](../arxiv/hackthon-docs/notion-hackathon-brief.md) — Authoritative hackathon brief: tracks, judging rubric, minimum bars, feedback format, submission requirements, and all resource links.
- [`docs/initial-thin-idea.md`](./initial-thin-idea.md) — Original seed: goal statement, judging rubric, environment constraints, and the brainstorm brief that initiated the strategy process.
