# Developer Experience Feedback Report

**Track:** Track 2 · Closed-ended Vault  
**Flavour:** Loaded (Permissioned Domains + Credentials + MPT shares)  
**Environment:** XRPL public Devnet  
**Library:** `xrpl.js@5.2.0-beta.1` (we also hit several issues on `beta.0` before the organizer upgrade)  

**Team:** quant-lending · Ramiro Rodriguez, Boris Danailov  
**Event:** XRPL Lending Protocol Hackathon · DeVinci Blockchain / Ripple · 13 Sep 2026  

We ran the mandated DevEx hook locally (invite `BFT-PARIS-26`).  

Structured issue write-ups (category, title, description, repro / tx links, severity, library version, proposed fix) live in **[`docs/DEVEX_LOG.md`](docs/DEVEX_LOG.md)**, indexed as DX-01 through DX-18. This root file is the short manual report: what we tried, what surprised us, and what we would change.

---

## What we built (so the feedback has context)

We implemented a closed-ended lending vault end-to-end on public Devnet: create vault → credential-gated subscribe → dual-signed loan → repay → redeem, plus Loaded pieces (Permissioned Domain, uncredentialed deposit reject, MPT share transfer success/reject). Everything is TypeScript scripts against `xrpl.js`, not a UI. We verified txs on [devnet.xrpl.org](https://devnet.xrpl.org) and state via RPC.

Below we answer the Track 2 “Feedback to capture” questions from that run.

---

## Feedback to capture

### Was the three-phase model intuitive to implement?

The *idea* is intuitive. Once someone tells you “Subscription, then Investment, then Redemption,” the product story clicks. Implementing it the first time did not.

We started the way most tutorials nudge you: create a vault, try to attach a loan broker. That failed with `tecNO_PERMISSION` and a message about not owning the vault, except we *did* own it. The real issue was vault kind: lending expects a **closed-ended** vault. Open-ended is the quiet default. Nothing in the happy-path docs put “set `VaultKind` and the two dates first” in front of us.

**Proposed fix:** A single Track 2 quickstart that creates a closed-ended vault with dates, then `LoanBrokerSet`, in that order, and error text that says “vault is open-ended / wrong kind,” not “you don’t own this vault.”  
Details: [DX-05](docs/DEVEX_LOG.md#dx-05--vaultkind-subscriptiondate-redemptiondate-are-xls-65-v11-fields-completely-absent-from-published-vaultcreate-docs).

### Were `VaultKind`, `SubscriptionDate` and `RedemptionDate` self-explanatory?

No. We did not find them on the published `VaultCreate` page. We found them by reading errors, poking the binary codec, and looking at sibling samples. “Closed-ended needs both dates” only became clear after a failed submit. Mapping wall-clock time to XRPL epoch was another small tax we paid by guessing and checking.

When we later read phase dates back from `vault_info`, the response shape was also guesswork (`result.vault`, not something like `vault_data`).

**Proposed fix:** Put the three fields on the VaultCreate reference with types, required-when-closed rules, and a one-liner for epoch conversion; document the `vault_info` response key.  
Details: [DX-05](docs/DEVEX_LOG.md#dx-05--vaultkind-subscriptiondate-redemptiondate-are-xls-65-v11-fields-completely-absent-from-published-vaultcreate-docs), [DX-04](docs/DEVEX_LOG.md#dx-04--vault_info-response-shape-undocumented-key-is-resultvault-not-resultvault_data).

### Were phase-gate error messages legible?

Not in the sense of “this failed because of the phase.” We wrote a rejection script (`scripts/10_rejection_demos.ts`) and captured codes like `tecNO_PERMISSION`, `tecINSUFFICIENT_FUNDS`, `tecNO_ENTRY`. They tell you *something* failed; they do not say “vault is in Investment” or “LoanSet only allowed after SubscriptionDate.” We had to compare ledger time to the vault’s dates ourselves.

That matches a broader pattern this weekend: the same `tec*` codes get reused for new XLS-65/66 situations, and the message often points you at the wrong mental model (ownership, funds, auth) instead of the real rule.

**Proposed fix:** For phase-sensitive rejects, include current phase (or date window) and the phase the tx requires. Same idea for other misleading reuse (wrong vault kind, vault-managed MPT, etc.).  
Related: [DX-05](docs/DEVEX_LOG.md#dx-05--vaultkind-subscriptiondate-redemptiondate-are-xls-65-v11-fields-completely-absent-from-published-vaultcreate-docs), [DX-09](docs/DEVEX_LOG.md#dx-09--mptokenisuanceset-with-tfmptseterequireauth-returns-tecno_permission-on-vault-share-mpts).

### Was the final-payment-before-redemption constraint clear before trial and error?

No. We knew conceptually that the loan should be cleaned up before investors redeem, but the docs never gave us a simple calendar: last `LoanPay` must land before `RedemptionDate`, with compressed hackathon timings called out.

Separately, payment *timing* burned us. We treated `GracePeriod` like “extra time after due.” On ledger it opens the window *before* `NextPaymentDue` and does not extend past it. We submitted `LoanPay` a few seconds late and got `tecEXPIRED` (hash `CB58FE571CBAC0D552CD12DEA9B29F78ADFD9A4489ECD8E5423F7183780F2E36`). That was not obvious from the field name.

**Proposed fix:** A short lifecycle diagram (subscribe → invest → pay window → redeem) in the Track 2 docs; rename or diagram `GracePeriod` as an early-payment window; put deadline vs close time on `tecEXPIRED`.  
Details: [DX-12](docs/DEVEX_LOG.md#dx-12--graceperiod-in-loanset-opens-the-payment-window-before-nextpaymentdue-not-after).

### How easy was it to verify the lifecycle on the explorer?

Easy for **transactions**, awkward for **state**. Script stdout → paste hash → explorer works well; our README is basically a list of those links. Checking “are we still in Subscription?” or “what are share balances / PPS?” meant RPC (`vault_info`, `account_objects`). Vault / Loan / MPT objects are harder to browse than a simple payment tx. For a hackathon demo that is fine if you plan for it; as a default developer path it is clunky.

**Proposed fix:** Explorer deep-links or clearer object pages for Vault and Loan; keep `vault_info` schema documented so scripts stay trustworthy.  
Related: [DX-04](docs/DEVEX_LOG.md#dx-04--vault_info-response-shape-undocumented-key-is-resultvault-not-resultvault_data).

### Did cash-basis accounting behave as expected (interest on payment, not at origination)?

The ledger did what cash-basis says: originating the loan did not pump PPS the way a full-accrual mental model expects. Value showed up when cash hit the vault (`LoanPay`, and separately our coupon probe with `tfVaultDonation`).

What we did *not* expect from the docs: on a **short** Investment window, even a high annualized `InterestRate` moves PPS by dust. So “repay and watch yield” is a bad demo unless you also document the donation/coupon path, and that flag is painful to discover in the current SDK/docs.

**Proposed fix:** Explicitly document cash-basis at origination vs payment; document short-duration yield limits; expose `tfVaultDonation` as a named flag with a “demo / test yield” note.  
Details: [DX-01](docs/DEVEX_LOG.md#dx-01--interestrate-annualized-formula-produces-unobservable-yield-in-short-duration-vaults), [DX-13](docs/DEVEX_LOG.md#dx-13--tfvaultdonation-flag-absent-from-xrpljs-sdk-ripple-binary-codec-and-published-docs).

---

## Other sharp edges we hit (Loaded + tooling)

These were not on the Track 2 bullet list, but they blocked or misled us while shipping the Loaded flavour:

- **Dual-party `LoanSet` signing:** stock `signLoanSetByCounterparty` still uses the old STX prefix after the CPT amendment; every loan failed until we signed with `encodeForSigningCounterparty` ourselves. **Fix:** one-line SDK change. → [DX-06](docs/DEVEX_LOG.md#dx-06--signloansetbycounterparty-uses-wrong-signing-prefix-after-fixcleanup3_4_0-amendment)  
- **Private vault + domain:** `DomainID` needs `tfVaultPrivate`; neither the field name nor the flag pairing was obvious. → [DX-07](docs/DEVEX_LOG.md#dx-07--vaultcreate-field-for-permissioned-domain-is-domainid-not-permissioneddomainid), [DX-08](docs/DEVEX_LOG.md#dx-08--vaultcreate-requires-tfvaultprivate-flag-when-domainid-is-set-undocumented-coupling)  
- **Vault share MPT auth:** we could not set `lsfMPTRequireAuth` on the vault’s share issuance (`tecNO_PERMISSION`). Domain gate at deposit ≠ full transfer perimeter. → [DX-09](docs/DEVEX_LOG.md#dx-09--mptokenisuanceset-with-tfmptseterequireauth-returns-tecno_permission-on-vault-share-mpts), [DX-10](docs/DEVEX_LOG.md#dx-10--vaultdeposit-domain-gate-creates-implicit-mpt-transfer-barrier-via-mptoken-entry-requirement)  
- **Devnet connectivity:** WSS only on port 51233 plus a short default timeout is rough on event Wi-Fi. → [DX-02](docs/DEVEX_LOG.md#dx-02--devnet-websocket-exposes-only-port-51233-blocked-by-corporate-and-isp-firewalls), [DX-03](docs/DEVEX_LOG.md#dx-03--xrpljs-default-5s-connectiontimeout-too-short-for-mobile--event-networks)

---

## Issue catalog

For the format required in the brief (category, title, description, repro or tx/code link, severity, library + version, proposed fix), see:

**[`docs/DEVEX_LOG.md`](docs/DEVEX_LOG.md)**
