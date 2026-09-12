---
name: xrpl-session-analysis
description: Produce a structured XRPL developer experience analysis of this session (friction, doc gaps, wrong assumptions, error messages, retries, timeline) as a markdown report plus a JSON block, save it locally, and offer to submit it to the event organizer. Use when the developer runs it, mid-day and end of day, or when a session reminder suggests it.
argument-hint: "[optional: focus, e.g. 'only the vault work']"
allowed-tools: Bash(node *), Bash(find *), Bash(ls *), Bash(cat *), Bash(mkdir *), Read, Write
---

You are writing a developer experience analysis of this session for the XRPL team. The subject is the protocol, its documentation and its tooling. It is not an assessment of the developer. Where the developer got something wrong, the interesting question is what made that mistake easy to make.

Optional focus from the developer: $ARGUMENTS

## Inputs

1. Find the capture repo: `./hook/submit.mjs` if it exists, else `find . -path '*/hook/submit.mjs' -not -path '*/node_modules/*' | head -1`. Call its parent-of-hook directory `REPO`. Read `REPO/hook/devex.config.json` for `event` and `focus_features` (the features this event is focused on; report on any XRPL feature you see).
2. Read `.xrpl-devex/identity.json` for `participant_id` and `team`. If it is missing or says `declined`, say the developer has not opted in, point to `/xrpl-setup`, and stop.
3. Evidence files, read both: `.xrpl-devex/buffer.jsonl` (not yet sent) and `.xrpl-devex/sent.jsonl` (already sent). Each line is one event: `prompt` rows are the developer's verbatim XRPL questions, `tool_result` rows carry `tx_type`, `result_code`, `failed`, `attempts`, `retry_resolved` rows carry `attempts` and `elapsed_seconds`, `package_install` rows list packages, `reflection` and `feedback` rows are prior notes. Filter on the current session when `session_id` matches `${CLAUDE_SESSION_ID}`, but use other sessions of the same day for the timeline if the developer confirms they belong to them.
4. The transcript: you have this session in context. If parts were compacted, also try the transcript file: list `~/.claude/projects/`, pick the folder whose name is this project's absolute path with `/` replaced by `-`, and read `${CLAUDE_SESSION_ID}.jsonl` there (large; skim for tool calls and errors). If it is not there, say so in the coverage line.

## Procedure

STEP 1, coverage. State it honestly as one of `full | partial | compacted | interview_only`, plus one line on what was and was not visible. If little or nothing is visible, skip to step 4. Never invent detail. An honest "not observed" beats a confident guess: these reports are aggregated and one confabulated retry count poisons the average.

STEP 2, extract friction chronologically, citing the moment each came from (turn, command or file). Use the friction_type enum: `retry_loop`, `doc_gap`, `wrong_model`, `expectation`, `error_message`, `dead_end`, `workaround`, `docs_broken`, `terminology`, `timing`. Prefer a few well-evidenced items to many thin ones. For `doc_gap`, quote the developer's questions verbatim, this is the most valuable section. For `error_message`, table every result code hit, what was actually wrong, and a 1 to 5 clarity score (5 = the code pointed straight at the cause). Cross-check against the hook evidence: if it shows a `retry_resolved` with `attempts: 4`, the report says 4, not "several", and marks it `observed`.

STEP 3, rank by (time cost) x (likelihood another developer hits it). Name the single fix that would have saved the most time.

STEP 4, ask at most three questions, only things that cannot be determined from the record and that would change the conclusions. If none, say so and move on. Do not pad. Also ask, if not already known: did you work in other Claude sessions or tools today? Mark answers as `reported`.

STEP 5, redact, then write. Remove seed phrases, secret keys, API keys, tokens, private URLs, anything identifying a third party, private repo code beyond what a point needs. Keep ledger addresses and transaction hashes, they are public and useful. Note the type of anything stripped in `redacted`.

## Surface values

`protocol` ledger behaviour, transaction semantics, amendments. `docs` xrpl.org, XLS specs, tutorials, reference pages. `sdk` client libraries. `infra` networks, faucet, explorers, RPC. `tooling` the local environment for this event: starter repo, XRPL AI Starter Kit, MPP SDK, this capture system, Claude Code, env setup. Never use `unknown` here.

## Evidence values

`observed` for things in the transcript or hook buffer, `reported` for things the developer said in step 4, `inferred` for your own reading.

## Output 1: markdown report, fixed structure

```
# XRPL Session Analysis
**Participant:** <pseudonym>   **Team:** <team>   **Event:** <event id>
**Coverage:** full | partial | compacted | interview_only, plus one line on what was and was not visible
**Features touched:** ...
**What was attempted:** two or three sentences

## Top 3 friction points
## Documentation gaps
## Wrong assumptions
## Error messages worth improving   (table: result code | actual mistake | pointed at cause 1-5)
## Abandoned
## Workarounds
## Timeline   (elapsed time to first success per transaction type, with source: hook | transcript | reported)
## Not observed
```

Prose under two pages. Specific beats vague: "the counterparty signature flow on LoanSet took four attempts and about 40 minutes" is useful, "signing was confusing" is not. Write in English, whatever language the session was in: a verbatim quote in another language is followed by its English translation in brackets, and `doc_questions[].question` in the JSON block holds the English version. No em dashes: use commas, colons or full stops.

## Output 2: JSON block, fixed shape (this is what gets aggregated)

```json
{
  "participant": "<pseudonym>",
  "team": "<team>",
  "event": "<event id>",
  "coverage": "full | partial | compacted | interview_only",
  "features_touched": ["xls-66"],
  "friction": [
    {
      "rank": 1,
      "friction_type": "retry_loop | doc_gap | wrong_model | expectation | error_message | dead_end | workaround | docs_broken | terminology | timing",
      "surface": "protocol | docs | sdk | infra | tooling",
      "feature": "xls-66",
      "tx_type": null,
      "result_code": null,
      "summary": "one line",
      "attempts": 0,
      "minutes_lost": 0,
      "evidence": "observed | reported | inferred",
      "likely_general": true
    }
  ],
  "doc_questions": [{"question": "", "feature": "", "surface": "docs"}],
  "error_codes": [{"code": "", "tx_type": "", "actual_mistake": "", "clarity_1_5": 3}],
  "abandoned": [{"what": "", "blocked_at": ""}],
  "workarounds": [{"what": "", "should_be_provided_by": "sdk | protocol | docs"}],
  "time_to_first_success_minutes": {},
  "time_to_first_success_source": {},
  "single_fix": "",
  "not_observed": [],
  "redacted": []
}
```

`time_to_first_success_minutes` is keyed by canonical tx_type with integer or null values; `time_to_first_success_source` uses the same keys with `hook | transcript | reported`. `feature` values are lowercase hyphenated tags (`xls-65`, `xls-66`, `mpt`, `amm`, `rlusd`, `mpp`, `x402`). `attempts` and `minutes_lost` are non-negative integers. Never put `praise` or `unknown` in this block.

## Checkpoint mode

When this procedure is triggered by the Stop hook checkpoint instruction (it says "XRPL DevEx checkpoint" and gives a period start), do everything above with four differences: cover only the period since the given start, skip step 4 entirely (no questions; list what you could not determine under Not observed), add `"trigger": "checkpoint"` and `"period_start": "<ISO>"` to the JSON block, and submit immediately with the `--checkpoint` flag instead of asking. Then tell the developer in one line where the report is, or that nothing in the period was worth reporting, and return to their task. Manual runs of `/xrpl-session-analysis` keep asking before submitting.

## Save, show, ask once, submit

1. `mkdir -p .xrpl-devex/reports` and write both files with the same timestamp: `.xrpl-devex/reports/session-analysis-<YYYYMMDD-HHMMSS>.md` and `.xrpl-devex/reports/session-analysis-<YYYYMMDD-HHMMSS>.json`.
2. Show the developer the header, the Top 3 section and the coverage line, then tell them where the files are.
3. Ask one question: "Submit now, or edit first?"
4. On submit: `node REPO/hook/submit.mjs --analysis <json path> --markdown <md path> --session "${CLAUDE_SESSION_ID}"`. It validates the JSON against the taxonomy, redacts again, POSTs to the organizer's Worker (or saves it for the next flush if offline) and appends to `.xrpl-devex/analyses.log`. Relay its one-line output. If it reports a validation error, fix the JSON and run it once more.
5. On edit or wait: do not submit. Tell them the exact command from step 4 to run later. The developer owns the file.
