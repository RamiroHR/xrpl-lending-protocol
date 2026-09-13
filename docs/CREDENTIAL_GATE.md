# How the KYC credential gate works

The compliance perimeter is built from three on-chain object types defined in XLS-70 (Credentials) and referenced by the vault via its `DomainID`. The Broker is the issuer and domain owner; investors are subjects who must actively accept their credentials before they can interact with the vault.

---

## The trust chain

Three objects are required per investor:

**1. `PermissionedDomainSet` — created once by the Broker**

The Broker creates a Permissioned Domain object on-ledger. This object declares: "any address holding a credential of type `X` issued by me is an authorised participant." The `DomainID` of this object is passed into `VaultCreate`, wiring the gate into the vault at creation time.

**2. `CredentialCreate` — Broker submits, naming the investor**

```
Broker → CredentialCreate { Subject: InvestorA, CredentialType: KYC_VERIFIED }
```

The credential sits on-chain but is not yet active (`lsfAccepted = false`). This represents the fund manager saying "I have verified this address and I vouch for it."

**3. `CredentialAccept` — Investor submits to activate**

```
InvestorA → CredentialAccept { Issuer: Broker, CredentialType: KYC_VERIFIED }
```

Once accepted (`lsfAccepted = true`), the address can call `VaultDeposit` on any vault referencing the domain. Without this step the vault gate will not honour the credential.

---

## Why both signatures matter

This is not a simple whitelist. Neither party can act unilaterally:

- The **Broker cannot force a credential onto an investor** — the investor must accept.
- The **investor cannot self-issue a credential** — only the domain owner's credentials count.

This models a real KYC/AML relationship: the fund manager issues accreditation, and the investor acknowledges it by signing. Both parties' intent is recorded on-chain.

---

## What the gate enforces, and what it does not

The on-chain gate checks **investor credential validity** at the time of `VaultDeposit` and at MPT share transfers. It does not reach into the borrower side — borrower fitness for the campaign mandate (e.g. whether a startup genuinely operates in quantum computing) is off-chain underwriting performed by the Broker before `LoanSet` is submitted.

| Check | Where enforced |
|---|---|
| Investor holds a valid, accepted credential | Protocol — `VaultDeposit` is rejected if not |
| MPT share recipient is issuer-authorized | Protocol — `MPTokenAuthorize` controls who can hold shares |
| Borrower suitability for the mandate | Off-chain — Broker underwriting before `LoanSet` |

---

## Adding a new investor

```
Broker:   CredentialCreate  { Subject: newInvestor, CredentialType: KYC_VERIFIED }
Investor: CredentialAccept  { Issuer: broker,       CredentialType: KYC_VERIFIED }
Broker:   MPTokenAuthorize  { Holder: newInvestor }   ← required to hold MPT shares
```

The final `MPTokenAuthorize` step is separate from the credential: a credentialed investor can deposit XRP into the vault, but to *receive* the resulting MPT fund shares the issuer must also authorize that address on the MPT issuance (`lsfMPTRequireAuth`).

---

## Relevant scripts

| Script | What it does |
|---|---|
| `scripts/03_permissioned_domain.ts` | Creates the domain, issues credentials to Investor A and B, runs `CredentialAccept` for both |
| `scripts/02_create_vault.ts` | Passes `DomainID` in `VaultCreate` to wire the gate |
| `scripts/04_subscription.ts` | Probes the gate — attempts a deposit from the uncredentialed account and captures the rejection verbatim |
| `scripts/07_mpt_transfer.ts` | Probes the MPT perimeter — transfer to uncredentialed address returns `tecNO_AUTH` |
