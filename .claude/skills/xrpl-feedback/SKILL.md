---
name: xrpl-feedback
description: Log one piece of XRPL developer feedback in the moment, classified into the DevEx taxonomy and written to the local capture buffer. Use when the developer types /xrpl-feedback followed by what happened, including praise. Costs the developer five seconds.
argument-hint: "[what happened, in your own words]"
allowed-tools: Bash(node *), Bash(find *)
---

The developer wrote: $ARGUMENTS

If that is empty, ask once: "What happened?" and wait. Otherwise do the four steps below without commentary.

## 1. Classify

Read the text and the last few turns of context. Pick exactly one value for each field. Prefer `unknown` surface over a guess only when truly ambiguous. Never invent a `tx_type` or `result_code` that is not in the developer's text or the recent context; use `null`.

surface (where the friction sits):
- `protocol` ledger behaviour, transaction semantics, amendments (tec codes, flag semantics, vault share maths, rippling)
- `docs` xrpl.org, XLS specs, tutorials, reference pages (missing field description, wrong snippet, outdated tutorial)
- `sdk` client libraries (xrpl.js, xrpl-py, xrpl4j, xrpl-rust, wallet SDKs)
- `infra` networks and services (testnet or devnet availability, faucet, explorers, rippled or clio RPC, WebSocket disconnects)
- `tooling` the local environment for this event (starter repo, XRPL AI Starter Kit, MPP SDK, this capture system, Claude Code, env setup)
- `unknown` truly ambiguous

friction_type (what kind of friction):
- `retry_loop` same operation attempted 2+ times before success
- `doc_gap` a question the docs should have answered
- `wrong_model` the developer believed something false about how the protocol works
- `expectation` expected X, got Y, including cases where Y was correct
- `error_message` a result code or error that did not point at the actual cause
- `dead_end` something attempted then abandoned
- `workaround` hand-rolled code for something the SDK or protocol should provide
- `docs_broken` a copied snippet or tutorial step that failed as written
- `terminology` inconsistent or incorrect use of terms (assets vs shares, redeem vs withdraw, vault owner vs loan broker)
- `timing` elapsed time from first attempt to first success
- `praise` something that worked well and is worth keeping (positive statements go here)

feature: a short lowercase hyphenated tag or `null`: `xls-65` (single asset vault), `xls-66` (lending, loan broker), `mpt`, `amm`, `payment-channels`, `credentials`, `permissioned-domains`, `nft`, `escrow`, `checks`, `dex`, `trust-lines`, `rlusd`, `mpp`, `x402`, `starter-kit`. Check `hook/devex.config.json` `focus_features` for this event's focus, but tag what the text is actually about.

tx_type: canonical XRPL transaction type when identifiable (`VaultDeposit`, `LoanSet`, `Payment`) or `null`. result_code: canonical code (`tecNO_PERMISSION`) or `null`. summary: one line, in English, in the developer's own words lightly cleaned, under 200 characters. text: the developer's words, in English, at most 2000 characters. Everything stored is English: when the developer wrote in another language, translate faithfully into `text` and `summary`, and keep the original in `payload.original_text`.

## 2. Write it through submit.mjs

Never hand-write the buffer file. Find the repo (`./hook/submit.mjs`, else `find . -path '*/hook/submit.mjs' -not -path '*/node_modules/*' | head -1`) and run:

```
node <repo>/hook/submit.mjs --local --channel feedback --session "${CLAUDE_SESSION_ID}" --json '{"surface":"...","friction_type":"...","feature":null,"tx_type":null,"result_code":null,"summary":"...","text":"...","payload":{"original_text":"<only when translated>"}}'
```

Omit `payload` when the developer already wrote in English.

If the text contains single quotes, pipe it instead: `printf '%s' '<json>' | node <repo>/hook/submit.mjs --local --channel feedback --session "${CLAUDE_SESSION_ID}" --json -`

If submit.mjs rejects the JSON, fix the field it names and run it once more. If it says the identity is not set up, run `/xrpl-setup` behaviour instead and come back.

## 3. Reply in one line

Exactly: `Logged as [surface / friction_type]. Back to it.` Nothing else. No follow-up questions, no advice, unless the developer asks.

## Worked examples

Input: "VaultDeposit returns tecNO_PERMISSION even though I am the vault owner, the doc says nothing about this"
-> surface `docs`, friction_type `doc_gap`, feature `xls-65`, tx_type `VaultDeposit`, result_code `tecNO_PERMISSION`, summary "VaultDeposit returns tecNO_PERMISSION for the vault owner and the doc does not say why". Reply: `Logged as [docs / doc_gap]. Back to it.`

Input: "took me 4 tries to get LoanSet accepted, the counterparty signature flow is not obvious"
-> surface `protocol`, friction_type `retry_loop`, feature `xls-66`, tx_type `LoanSet`, result_code `null`.

Input: "the faucet on devnet has been returning 500 for the last 20 minutes"
-> surface `infra`, friction_type `dead_end` if they stopped, otherwise `expectation`; feature `null`; tx_type `null`.

Input: "xrpl.js autofill silently dropped my NetworkID so devnet rejected everything"
-> surface `sdk`, friction_type `error_message` if the rejection was unhelpful, `expectation` otherwise; feature `null`; result_code the actual code if they gave it, else `null`.

Input: "honestly submitAndWait is great, way nicer than polling"
-> surface `sdk`, friction_type `praise`, feature `null`. Reply: `Logged as [sdk / praise]. Back to it.`

Input: "I had to write my own retry around tefPAST_SEQ because the SDK does not handle it"
-> surface `sdk`, friction_type `workaround`, result_code `tefPAST_SEQ`.

Input: "the tutorial calls it redeem but the tx is VaultWithdraw"
-> surface `docs`, friction_type `terminology`, feature `xls-65`, tx_type `VaultWithdraw`.

Input: "la page VaultDeposit ne dit pas qui a le droit de déposer dans un vault privé"
-> surface `docs`, friction_type `doc_gap`, feature `xls-65`, tx_type `VaultDeposit`, text "The VaultDeposit page does not say who is allowed to deposit into a private vault", payload `{"original_text":"la page VaultDeposit ne dit pas qui a le droit de déposer dans un vault privé"}`. Reply: `Logged as [docs / doc_gap]. Back to it.`
