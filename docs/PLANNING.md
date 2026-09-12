# PLANNING — XRPL Permissioned Private Credit Fund

Phased sprint backlog for Track 2 Loaded (Permissioned Domains + MPT shares).  
Reference: [`docs/PRODUCT_DEFINITION.md`](./PRODUCT_DEFINITION.md) for scope, MVP boundaries, and architecture.  
Submission deadline: **Sunday 13 September 2026, 13:00** (code freeze).

Difficulty key: 🟢 easy · 🟡 medium · 🔴 hard / beta SDK / under-documented

---

## Core constraints

- **Track:** Track 2 — Closed-ended vault, XLS-65/66 V1.1
- **Flavour:** Loaded — Permissioned Domains + Credentials + MPTs
- **Network:** XRPL public Devnet (`wss://s.devnet.rippletest.net:51233`)
- **SDK:** `xrpl.js@5.2.0-beta.1` — mandatory; its beta status is a deliberate DevEx friction surface
- **Language:** TypeScript / Node.js
- **Deliverables:** 10 numbered `.ts` scripts + DevEx feedback report (≥5 issues with proposed fixes) + README + slide deck
- **No frontend before scripts:** Do not start a React dashboard before all 10 scripts are confirmed working. A terminal demo beats a broken UI.
- **No app code before hook:** The DevEx hook (`BFT-PARIS-26`) must be installed and verified on every machine before writing a single line of script code.
- **Phase timing is real-time:** Vault phase transitions are wall-clock on the public Devnet. Compress phases aggressively and set phone alarms for every boundary.
- **Inspiration only — never a runtime dependency:** Sibling clones below are for pattern stealing. This project always submits txs via `xrpl.js@5.2.0-beta.1` on **public Devnet**. Do not npm-link, import, or copy their network/SDK config into our scripts.

---

## Sibling inspiration repos (agent army — explore when stuck)

Workspace layout (siblings of **this** repo):

| Priority | Local path (from `xrpl-lending-protocol/`) | Upstream | Role |
|---|---|---|---|
| **1 — primary** | `../xrpl-reference-app-lending-sav/` | [ripple/xrpl-reference-app-lending-sav](https://github.com/ripple/xrpl-reference-app-lending-sav) | End-to-end SAV + lending patterns |
| **1 — primary** | `../xrpl-js-python-simple-scripts/` | [RippleDevRel/xrpl-js-python-simple-scripts](https://github.com/RippleDevRel/xrpl-js-python-simple-scripts) | Small script samples (MPT, Credentials, Permissioned Domains, …) |
| **2 — optional fallback only** | `../XRPL/` | Teammate learning sandbox ([RamiroHR/XRPL](https://github.com/RamiroHR/XRPL)) | Glance at simple patterns **only if** primary approaches fail |

**Source of truth:** All product code, Phase 0–E scripts, `.env` / `config/`, and the hackathon submission live in **`xrpl-lending-protocol` only**. Sibling repos are never runtime dependencies (no npm-link, no imports from `../`). Keep our Track 2 client (`config/client.ts`, `xrpl.js@5.2.0-beta.1`, public Devnet).

### Agent lookup order (do not skip ahead)

1. Implement from `docs/PRODUCT_DEFINITION.md` + this plan + V1.1 / XRPL docs.
2. If stuck on payload shape or signing: search **primary** siblings (tables below).
3. Open `../XRPL/` **only when** steps 1–2 still fail **and** the stuck area is one listed under “Teammate sandbox — when to glance”. Do **not** pull/merge from `../XRPL/` by default. Do **not** treat its `package.json` script names as a second backlog.

Log SDK/doc mismatches vs primary references into `docs/DEVEX_LOG.md`.

### High-value paths in the reference app (primary)

| Concern | Start here |
|---|---|
| Vault create / deposit / withdraw | `../xrpl-reference-app-lending-sav/src/lib/xrpl/vault.ts` |
| LoanSet / drawdown / repay | `../xrpl-reference-app-lending-sav/src/lib/xrpl/loan.ts` |
| MPT share metadata / issuance hints | `../xrpl-reference-app-lending-sav/src/lib/xrpl/mpt-metadata.ts` |
| Broker UI flow (vault) | `../xrpl-reference-app-lending-sav/src/app/dashboard/broker/create-vault.tsx` |
| Broker UI flow (loan) | `../xrpl-reference-app-lending-sav/src/app/dashboard/broker/issue-loan.tsx` |
| Loan math helpers | `../xrpl-reference-app-lending-sav/src/lib/loan-math.ts` |

### High-value paths in simple-scripts (primary)

| Concern | Start here |
|---|---|
| MPT create / authorize / transfer | `../xrpl-js-python-simple-scripts/js/mpt.js` |
| Permissioned Domains | `../xrpl-js-python-simple-scripts/devnet/permissionedDomains.js` |
| Credentials | `../xrpl-js-python-simple-scripts/devnet/credentials.js` |
| TokenEscrow (stretch D7) | `../xrpl-js-python-simple-scripts/devnet/tokenEscrow.js` |
| Account generate / faucet patterns | `../xrpl-js-python-simple-scripts/js/generate.js`, `../xrpl-js-python-simple-scripts/js/xrp_transaction.js` |
| DevNet README / which samples apply | `../xrpl-js-python-simple-scripts/devnet/README.md`, `../xrpl-js-python-simple-scripts/js/README.md` |

### Teammate sandbox `../XRPL/` — optional glance only

**What it is:** A beginner playground for the second teammate (simple XRPL experiments). **Not** a parallel implementation of this product. **Not** a merge source for agentic-army.

**What it currently illustrates** (re-check the tree after an optional pull; content changes often):

| Area | Status in sandbox | Files to glance at if needed |
|---|---|---|
| Connect to public Devnet WSS | Tested pattern | `../XRPL/createAccounts.js` (`xrpl.Client`, `connect` / `disconnect`) |
| Fund wallets via Devnet faucet (`client.fundWallet()`) | Tested pattern | `../XRPL/createAccounts.js` |
| Print address + seed for a few named roles | Tested (3 roles: broker / lender / borrower — **not** our five-role model) | `../XRPL/createAccounts.js`, notebook notes in `../XRPL/createAccounts.ipynb` |
| Same beta dependency pin (`xrpl@5.2.0-beta.0`) | Confirmed in sandbox `package.json` | Useful only as “beta package resolves” smoke — we already pin this here |
| Vault / LoanSet / Permissioned Domains / MPT product scripts | **Not present** as real sources | Ignore `package.json` npm script *names* that point at missing `scripts/*.ts` — those are aspirational labels, not code to port |

**When an agent may open `../XRPL/`:**

- Stuck on **Devnet connect** or **`fundWallet` / faucet** after primary simple-scripts patterns failed.
- Human explicitly asks to compare with the teammate’s tested snippet.

**When an agent must not use `../XRPL/`:**

- Starting any Phase A–E feature by default.
- Deciding account roles, vault/loan payloads, Credentials, MPTs, or submission structure.
- “Merging” or re-homing product scripts from the sandbox into this repo unless the human requests a one-off copy of a tiny pattern.
- Treating sandbox role names (`lender` only, 3 accounts) as replacing Investor A/B + Uncredentialed.

---

## Yield mechanics

Yield is delivered entirely through **Price Per Share (PPS)** appreciation — there is no separate interest disbursement or hardcoded rate.

Investors deposit XRP during Subscription and receive MPT shares minted at the current PPS (initially 1.0 XRP per share). Two events during the Investment phase raise PPS by adding XRP to `AssetsTotal` without minting new shares:

1. **Coupon injection** (`scripts/06`) — the broker calls `VaultDeposit` with `tfVaultDonation`, pushing XRP into the vault as interest. PPS = `AssetsTotal / TotalSharesMinted` rises immediately.
2. **Borrower repayment** (`scripts/08`) — the borrower repays principal plus interest in one transaction. The interest portion lands in `AssetsTotal` and raises PPS again. This is V1.1's cash-basis model: PPS does not move at loan origination, only when cash arrives.

At Redemption, investors burn their shares at the current (higher) PPS and receive back more XRP than they deposited. The difference — `(PPS at redemption − PPS at subscription) × shares held` — is their yield. If a share transfer occurred during Investment (`scripts/07`), each investor's final share count determines their slice of that yield.

The interest rate itself is set in the `LoanSet` transaction by the broker. Everything downstream — PPS changes, yield amounts, redemption payouts — follows automatically from what cash lands in the vault.

---

## Phase 0 — Pre-sprint setup
`Before Sat 11:30 · ~1.5 h · All hands`

Tasks that block everything else. Complete before the hacking session begins.

> **Gate:** Do not proceed to Phase A until item 0.2 (DevEx hook) is confirmed live on every machine.

#### 0.1 — Environment install
`All · 15 min · 🟢`

Install Node.js ≥ 20 and `xrpl.js@5.2.0-beta.1`. Confirm that `ts-node` or `tsx` can execute a minimal TypeScript file that connects to the Devnet WebSocket endpoint and reads the server info response.

#### 0.2 — DevEx hook installation
`All · 20 min · 🟢`

Install the DevEx hook using invite code `BFT-PARIS-26`. Fire a test transaction from each machine and verify the hook captures telemetry before any application scripts are written.

#### 0.3 — Pre-reading
`1 person · 30 min · 🟡`

Read the XLS-65 V1.1 / Permissioned Domains docs **and the local sibling clones** (see **Sibling inspiration repos** above) before writing any script. Focus on `VaultCreate` parameters, Credential issuance, and `LoanSet` multi-party signing.

**Agent army:** Open at least `../xrpl-reference-app-lending-sav/src/lib/xrpl/vault.ts`, `.../loan.ts`, and `../xrpl-js-python-simple-scripts/devnet/permissionedDomains.js` + `credentials.js`. Skim; do not port the Next.js app. If nobody on the team has prior Permissioned Domains experience, start this before Phase A.

#### 0.4 — Repo scaffold
`1 person · 20 min · 🟢`

Create the directory structure: `scripts/`, `config/`, `.env.example`, `tsconfig.json`, `package.json`. Add `.env` to `.gitignore` before the first commit.

#### 0.5 — Shared account config (`config/accounts.ts`)
`1 person · 20 min · 🟢`

Write a module that reads the five account seeds from `.env` and exports typed `Wallet` objects — Investor A, Investor B, Borrower, Broker, Uncredentialed. All scripts import from here; no script hard-codes a seed.

#### 0.6 — Shared client factory (`config/client.ts`)
`1 person · 10 min · 🟢`

Write a single WebSocket client factory that connects to the Devnet endpoint and exposes a `connect` / `disconnect` lifecycle. All scripts import and reuse this; no script manages its own connection.

---

## Phase A — Critical path validation
`Sat 11:30–13:00 · ~1.5 h · 1–2 people`

Verify that the beta SDK can execute every primitive the full flow needs before committing to Phase B. If any smoke-test surfaces a blocking SDK bug, fall back to raw JSON-RPC for that call and immediately log it as a DevEx finding — the blocker becomes feedback material.

> **Gate:** All three smoke-tests (A2–A4) must succeed before Phase B starts. Do not skip.

#### A1 — Account funding (`scripts/01_setup_accounts.ts`)
`1 person · 30 min · 🟢`

Hit the public Devnet faucet for all five accounts, write the resulting seeds to `.env`, and log each starting XRP balance to stdout. Funded balances must cover XRP reserves for every object each account will own, plus the amounts deposited or loaned, plus buffer for fees.

**Inspiration:** faucet / wallet patterns in `../xrpl-js-python-simple-scripts/js/generate.js` and `xrp_transaction.js` (adapt to our five roles + public Devnet). Optional last glance: `../XRPL/createAccounts.js` only if `fundWallet` still fails — remember it uses 3 roles (`broker`/`lender`/`borrower`), not our five.

#### A2 — VaultCreate smoke-test
`1 person · 30 min · 🟡`

Submit a `VaultCreate` against a throwaway vault with minimal parameters. Confirm the vault object appears on the Devnet explorer before proceeding. This isolates any SDK issue with vault creation from the compressed-date configuration in Phase B.

**Inspiration:** `../xrpl-reference-app-lending-sav/src/lib/xrpl/vault.ts` (+ `create-vault.tsx` for required fields). Compare beta SDK helpers vs reference; log gaps to `DEVEX_LOG`.

#### A3 — VaultDeposit / VaultWithdraw smoke-test
`1 person · 30 min · 🟡`

Call `VaultDeposit` from one account and `VaultWithdraw` from the same account against the throwaway vault. Confirm share minting and burning round-trip correctly. Log any SDK friction immediately to `docs/DEVEX_LOG.md`.

**Inspiration:** deposit/withdraw helpers in `../xrpl-reference-app-lending-sav/src/lib/xrpl/vault.ts`.

#### A4 — LoanSet multi-party signing smoke-test
`1 person · 30 min · 🔴`

Construct a `LoanSet` transaction, sign it with the broker, pass it to the borrower for a second signature, and submit. This is the highest-risk primitive: the beta SDK may or may not expose a clean helper for the `Signers` array. If it does not, construct raw JSON and document the gap as a DevEx finding. Confirm the drawdown succeeds before closing this item.

**Inspiration (mandatory before inventing Signers):** `../xrpl-reference-app-lending-sav/src/lib/xrpl/loan.ts` and `issue-loan.tsx`. If multi-sig is unclear, treat that as a DevEx finding with a proposed docs/SDK fix.

#### A5 — Friction capture
`All · ongoing · 🟡`

Log every unexpected SDK behaviour, unclear error, or missing helper surfaced in A2–A4 to `docs/DEVEX_LOG.md` using `/devex-log`. Each entry must include repro steps or a transaction link and a one-sentence proposed fix.

---

## Phase B — Core XLS-65/66 flow
`Sat 13:00–17:00 · ~4 h · 1–2 people`

Delivers the Track 2 minimum bar. Run the full B1→B5 sequence end-to-end at least once before starting Phase C.

> **Gate:** Complete end-to-end run (B1→B5) must succeed before Phase C begins.

#### B1 — Vault creation (`scripts/02_create_vault.ts`)
`1 person · 1 h · 🟡`

Submit `VaultCreate` with `VaultKind` set to closed-ended, the asset set to XRP, and phase dates compressed to fit the event timeline: Subscription ~30 minutes, Investment ~4 hours, Redemption ~30 minutes. The script logs the vault's on-ledger object ID and the Devnet explorer link. Set phone alarms for every phase boundary before this script is run for real.

**Inspiration:** closed-ended / date fields in `../xrpl-reference-app-lending-sav/src/lib/xrpl/vault.ts` and `create-vault.tsx`. Cross-check V1.1 docs for `SubscriptionDate` / `RedemptionDate`; do not assume the reference app’s network matches public Devnet.

#### B2 — Subscription deposits (`scripts/04_subscription.ts`)
`1 person · 1 h · 🟡`

Call `VaultDeposit` sequentially from Investor A and Investor B. Log each account's resulting MPT share balance and the vault's `AssetsTotal` after each deposit. Also probe the over-subscription cap: attempt a deposit larger than any configured maximum and record whether the protocol rejects it, silently caps it, or has no such limit.

**Inspiration:** deposit flow in reference `vault.ts`; MPT balance reads via patterns in `../xrpl-js-python-simple-scripts/js/mpt.js`.

#### B3 — Loan origination and drawdown (`scripts/05_investment.ts`)
`1 person · 1 h · 🔴`

Construct the `LoanSet` transaction with both broker and borrower signatures (multi-party signing pattern from A4) and submit. Then submit the drawdown transaction. Log the explorer link for both. The multi-party signing coordination is a direct DevEx probe — record whether the SDK made this straightforward or required manual `Signers` array construction.

**Inspiration (mandatory):** `../xrpl-reference-app-lending-sav/src/lib/xrpl/loan.ts`, `issue-loan.tsx`, and `loan-math.ts` for principal / interest / schedule fields. Reuse A4 signing pattern; do not invent a second multi-sig approach.

#### B4 — Repayment (`scripts/08_repayment.ts`)
`1 person · 30 min · 🟡`

Submit the borrower's single repayment transaction. Log `AssetsTotal` and PPS both before and after. The key observation: PPS does not change at loan origination, only when the repayment is received — this is V1.1's cash-basis accounting, a documented but counterintuitive behaviour that will appear in the DevEx report.

**Inspiration:** repay helpers in reference `loan.ts`; verify cash-basis behaviour against V1.1 docs, not against any V1 assumptions in older samples.

#### B5 — Redemption (`scripts/09_redemption.ts`)
`1 person · 30 min · 🟡`

Call `VaultWithdraw` from both Investor A and Investor B once the Redemption phase opens. Verify that the XRP returned to each investor is proportional to their final share balances (which will differ after the Phase C transfer). Confirm that MPT share balances reach zero for both accounts after withdrawal.

#### B6 — Friction capture
`All · ongoing · 🟡`

Log all friction from B1–B5 to `docs/DEVEX_LOG.md` continuously. Priority surfaces: phase-gate error message quality, cash-basis PPS behaviour at origination, explorer link consistency for V1.1 objects.

---

## Phase C — Loaded primitives
`Sat 17:00–20:00 · ~3 h · 1–2 people`

Adds the Permissioned Domains + MPT compliance layer that differentiates this submission from vanilla Track 2 entries.

> **Timebox:** C1 must complete by 19:00. If Permissioned Domains are not working by then, drop to MPT-only Loaded, log all setup friction as a primary DevEx finding, and proceed to Phase D.

> **Gate:** Both the credential-gated deposit rejection and the MPT transfer rejection must be captured verbatim before Phase D starts.

#### C1 — Permissioned Domain and Credential issuance (`scripts/03_permissioned_domain.ts`)
`1 person · 1.5 h · 🔴`

Create a Permissioned Domain object owned by the Broker account. Issue Credentials to Investor A and Investor B, making them KYC-verified participants. Log the Domain object ID and both Credential object IDs with their Devnet explorer links. The uncredentialed account receives nothing at this step.

**Inspiration (mandatory before inventing payloads):** `../xrpl-js-python-simple-scripts/devnet/permissionedDomains.js` and `credentials.js`. Also search the reference app for Credential / domain usage if present. Log every unclear error as DevEx.

#### C2 — MPT authorization (`scripts/03_permissioned_domain.ts`, continued)
`1 person · 1 h · 🔴`

Configure `lsfMPTRequireAuth` on the vault's MPT issuance. The Broker (as MPT issuer) then authorizes Investor A and Investor B as approved holders. Confirm that the uncredentialed account has no MPT authorization. This is the on-chain compliance perimeter: shares cannot move to any address the issuer has not explicitly approved.

**Inspiration:** `../xrpl-js-python-simple-scripts/js/mpt.js` and reference `mpt-metadata.ts`. Document whether `lsfMPTRequireAuth` + Credentials interaction appears in either sibling (likely a DevEx gap if not).

#### C3 — Credential gate in subscription (`scripts/04_subscription.ts`, updated)
`1 person · 30 min · 🟡`

Add an uncredentialed `VaultDeposit` attempt to the subscription script. Capture the full error response — code, message, and any additional fields — verbatim. This is the demo's opening scene and the first DevEx probe: does the rejection explain that a Credential is missing, or does it only say "transaction failed"?

#### C4 — MPT share transfer (`scripts/07_mpt_transfer.ts`)
`1 person · 30 min · 🟡`

Transfer half of Investor A's shares to Investor B — both are credentialed and MPT-authorized, so this succeeds. Then attempt to transfer shares to the uncredentialed account. Capture the rejection verbatim. This scene is the demo's most distinctive moment: it shows the compliance perimeter enforced at the token level, not just at the vault deposit gate. The interaction between `lsfMPTRequireAuth` and Permissioned Domain Credentials is explicitly under-documented and a primary feedback contribution.

**Inspiration:** MPT transfer / authorize flows in `../xrpl-js-python-simple-scripts/js/mpt.js`.

#### C5 — Friction capture
`All · ongoing · 🟡`

Log all Permissioned Domain and MPT interaction friction to `docs/DEVEX_LOG.md`. Priority: setup ergonomics for `PermissionedDomainSet`, the clarity of MPT authorization errors, and whether the two primitives' interaction is documented anywhere in the V1.1 spec.

---

## Phase D — Polish, rejections, and reporting
`Sat 20:00 – Sun 12:30 · ~8 h · split responsibilities`

Finalizes all 10 scripts and produces the written deliverables that drive 40%+ of the judging score. Priority order: D4 (DevEx report) before D5 (README) before D1–D3 (remaining scripts) before D6 (slides) before D7 (stretch goal).

#### D1 — Coupon injection (`scripts/06_coupon_injection.ts`)
`1 person · 1 h · 🟡`

Call `VaultDeposit` from the Broker account with the `tfVaultDonation` flag set, injecting a fixed XRP amount as mid-Investment interest. Log PPS before and after, and verify that the delta equals the injected amount divided by total shares outstanding. DevEx probe: is `tfVaultDonation` clearly documented in the V1.1 spec, and does the SDK expose it as a named flag or require a raw bitmask?

**Inspiration:** search reference `vault.ts` / deposit helpers for donation or `tfVaultDonation`; if absent in both siblings, that absence is itself a DevEx finding.

#### D2 — Batch rejection demos (`scripts/10_rejection_demos.ts`)
`1 person · 1 h · 🟢`

Submit a batch of intentionally invalid transactions: `VaultDeposit` during Investment phase, `VaultWithdraw` during Investment phase, and `LoanSet` during Subscription phase. Capture the full error response for each — code, message, and any auxiliary fields — verbatim. These are the primary data points for the phase-gate error quality section of the DevEx report.

#### D3 — Over-subscription cap probe (finalizing `scripts/04_subscription.ts`)
`1 person · 30 min · 🟢`

Finalize the over-subscription probe from B2: confirm the protocol's response is recorded completely and accurately. Determine whether the cap behaviour is documented in the V1.1 spec and whether the response is actionable to a developer who encounters it for the first time.

#### D4 — DevEx feedback report (`docs/DEVEX_REPORT.md`)
`1 person · 2 h · 🟡`

Write the manual feedback report. State track (Track 2), flavour (Loaded), environment (public XRPL Devnet), and library version (`xrpl.js@5.2.0-beta.1`) at the top. Include ≥5 issues, each following the required format: category, title, description, repro or transaction link, severity, library version, and a concrete proposed fix. Proposed fixes score materially higher than flags alone on the 40% criterion — every issue must have one before it is considered complete. Draw from `docs/DEVEX_LOG.md`; do not reconstruct from memory.

#### D5 — README
`1 person · 1 h · 🟢`

Write `README.md` covering: what the project does, setup and run instructions, chosen track (Track 2), environment (public XRPL Devnet), library version, all XLS-65/66 transaction types used, and a verified Devnet explorer link for every significant transaction. Consistently use "private credit fund" or "credit facility" framing — never "tokenized bond."

#### D6 — Slide deck
`1 person · 1.5 h · 🟢`

Produce ≤10 slides: use case and institutional framing, on-chain lifecycle diagram, and the three most important friction points with proposed improvements. The deck is secondary to the code and report; finish only after D4 and D5 are complete.

#### D7 — TokenEscrow borrower collateral (conditional stretch)
`1 person · 2 h · 🔴`

Only start if D1–D3 are complete by Saturday 22:00 and both Loaded primitives (Permissioned Domains + MPTs) are fully confirmed. Locks XRP in a `TokenEscrow` before the drawdown, released on repayment or forfeited on default. Turns the loan from unsecured to secured and opens a DevEx surface on `TokenEscrow` + XLS-66 interaction. Skip entirely if there is any doubt — a working terminal demo of the core flow is worth more than a broken stretch feature.

**Inspiration:** `../xrpl-js-python-simple-scripts/devnet/tokenEscrow.js` before designing escrow + loan coordination.

---

## Phase E — Demo prep and submission
`Sun 12:30–13:00 · ~30 min · All`

#### E1 — Pre-confirm all transactions
`All · 15 min · 🟢`

Verify every significant transaction from the previous night's run is confirmed on the Devnet explorer and that all explorer links resolve correctly. Pre-confirm everything so the Sunday live demo only needs to submit one illustrative transaction.

#### E2 — Demo rehearsal
`All · 10 min · 🟢`

Run the 4-minute arc at least once: rejection scene → subscription → investment → coupon injection → MPT share transfer → redemption. Time it. Confirm the narrative hits the three differentiators: credential gate, MPT compliance perimeter, and pre-maturity exit via share transfer.

#### E3 — Backup screenshots
`1 person · 5 min · 🟢`

Prepare a screenshot set of all key terminal outputs and explorer links in case of Devnet latency during the live demo.

#### E4 — Submit
`1 person · 5 min · 🟢`

Push the final commit containing scripts, DevEx report, README, and slides. Confirm the repository is public and the submission form is complete before 13:00.

---

## Script inventory

| Script | Purpose | Phase |
|---|---|---|
| `scripts/01_setup_accounts.ts` | Fund 5 accounts from faucet; write seeds to `.env` | A |
| `scripts/02_create_vault.ts` | `VaultCreate` — closed-ended, XRP, compressed dates | B |
| `scripts/03_permissioned_domain.ts` | Permissioned Domain + Credential issuance; MPT authorization | C |
| `scripts/04_subscription.ts` | `VaultDeposit` from A, B, uncredentialed; over-subscription probe | B / C |
| `scripts/05_investment.ts` | `LoanSet` multi-sig + drawdown | B |
| `scripts/06_coupon_injection.ts` | `VaultDeposit` with `tfVaultDonation`; PPS delta verification | D |
| `scripts/07_mpt_transfer.ts` | MPT share transfer A→B (success) and A→uncredentialed (rejection) | C |
| `scripts/08_repayment.ts` | Single repayment; cash-basis PPS proof | B |
| `scripts/09_redemption.ts` | `VaultWithdraw` from A and B; share burn verification | B |
| `scripts/10_rejection_demos.ts` | Batch wrong-phase rejections; capture all errors verbatim | D |

---

## DevEx priority log (known friction surfaces)

Pre-identified surfaces to probe and log during the sprint. Each must appear in the final report with a proposed fix. Log findings live to `docs/DEVEX_LOG.md` using `/devex-log` — do not reconstruct from memory at Sunday 12:00.

#### X1 — Phase-gate error message legibility · `scripts/10`
Does the rejection explain which phase is required, or does it only say "transaction failed"? The wrong-phase batch in script 10 is the capture point. A high-quality error would name the current phase, the required phase, and the relevant transaction type.

#### X2 — Cash-basis accounting at origination · `scripts/08`
PPS does not change when the loan is originated — only when the repayment arrives. This is correct V1.1 behaviour but likely to surprise developers coming from full-accrual mental models. Is it documented clearly in the spec? What would a useful inline SDK warning look like?

#### X3 — `tfVaultDonation` flag coverage · `scripts/06`
Is this flag documented in the V1.1 spec? Does `xrpl.js@5.2.0-beta.1` expose it as a named constant or require a raw bitmask? Does the SDK include it in type definitions for `VaultDeposit`?

#### X4 — `lsfMPTRequireAuth` + Permissioned Domains interaction · `scripts/07`
Is the interaction between these two primitives documented anywhere? When an MPT transfer is rejected because the recipient is not issuer-authorized, does the error explain that reason, or is it opaque? This is the most likely gap in the V1.1 documentation.

#### X5 — Multi-party `LoanSet` coordination · `scripts/05`
Does `xrpl.js@5.2.0-beta.1` expose a helper for multi-signer flows, or must the developer construct the `Signers` array from raw JSON? Is the expected signing coordination pattern documented in the SDK or only in the ledger spec? **First compare** `../xrpl-reference-app-lending-sav/src/lib/xrpl/loan.ts` — if the reference is clear and the beta SDK is not, that delta is the DevEx finding.

#### X6 — Devnet explorer vs. ledger documentation consistency · All scripts
Do V1.1 objects (vault, loan, domain, credentials) render correctly in the Devnet explorer? Are the field names shown in the explorer consistent with the names used in the ledger spec and the SDK type definitions?

---

## Risks

Full register in §9 of `docs/PRODUCT_DEFINITION.md`. Sprint-critical items only:

#### Beta SDK blocking bug
Affects `VaultCreate`, `VaultDeposit`, `LoanSet`, or `VaultWithdraw`. Mitigated by Phase A smoke-tests within the first 90 minutes. If a call is broken, fall back to raw JSON-RPC for that specific call and log the SDK gap as a DevEx finding — the blocker becomes the report's highest-severity issue. Compare failing payloads to sibling reference helpers before concluding the SDK is broken.

#### Multi-party LoanSet coordination unclear
The broker + borrower multi-signature flow for `LoanSet` may require constructing raw JSON if the beta SDK does not expose a clean helper. Mitigated by reading sibling `../xrpl-reference-app-lending-sav/src/lib/xrpl/loan.ts` (and V1.1 docs) before Phase B; treat remaining confusion as DevEx with a proposed fix.

#### Wall-clock phase transition
A vault phase transition occurring during a meal or overnight can break the sequential flow. Mitigated by compressing phases aggressively, setting phone alarms for every boundary, and assigning one person on standby at each transition.

#### Permissioned Domains setup overruns timebox
If `scripts/03` is not working by Saturday 19:00, drop to MPT-only Loaded and document all setup friction as the primary DevEx finding. Do not let this block Phase D. Start from `../xrpl-js-python-simple-scripts/devnet/permissionedDomains.js` + `credentials.js` before burning the timebox on guesswork.

#### `lsfMPTRequireAuth` + Credentials interaction broken
If the KYC ring is not enforced at transfer time, drop the MPT transfer rejection scene from the demo and document the gap — it is still a high-value finding. Test immediately after C2.

#### Devnet latency spike during live demo
Pre-confirm all transactions Saturday night. The Sunday live demo submits only one illustrative transaction; all others are shown via explorer links. Backup screenshots cover the worst case.

#### DevEx report thin on proposed fixes
Judges reward proposals, not flags. Every logged issue must include a proposed fix before it is considered complete. Designate a friction logger from the sprint start; do not assemble the report from memory on Sunday morning.

---

## Sprint schedule summary

| Phase | Window | Active work |
|---|---|---|
| Phase 0 | Before Sat 11:30 | ~1.5 h |
| Phase A | Sat 11:30–13:00 | ~1.5 h |
| Phase B | Sat 13:00–17:00 | ~4 h |
| Phase C | Sat 17:00–20:00 | ~3 h |
| Phase D | Sat 20:00–Sun 12:30 | ~8 h |
| Phase E | Sun 12:30–13:00 | ~0.5 h |
| **Total** | **~25 h calendar** | **~18.5 h active** |

Buffer (~6.5 h) covers debugging, phase-transition waits, meals, and Sunday morning polish.
