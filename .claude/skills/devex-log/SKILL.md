---
name: devex-log
description: Log a developer experience observation (friction, doc gap, tooling issue, SDK confusion) encountered while building on XRPL. Appends a structured entry to docs/DEVEX_LOG.md for the hackathon committee evaluation.
user-invocable: true
---

## What this Skill is for
Use this Skill to capture developer experience observations during XRPL hackathon development. This feeds the committee evaluation criterion on developer experience — concrete, timestamped evidence of friction, gaps, and improvements discovered while building.

## When to use
- User invokes `/devex-log` explicitly
- A documentation gap is encountered (missing example, unclear spec, broken link)
- An SDK or tooling error causes unexpected friction
- An API behaves differently than its docs suggest
- A workaround is needed for something that should work out of the box
- A concept takes significantly longer to figure out than it should
- A tool, MCP, or AI assistant gives incomplete or wrong XRPL guidance

## Log file
Always append to: `docs/DEVEX_LOG.md`
Create the file with the header below if it does not exist yet:

```
# XRPL Developer Experience Log

> Captured during hackathon development of the xrpl-lending-protocol.
> Each entry documents a real friction point encountered while building.

---
```

## Entry format
Append one entry per observation using this exact structure:

```
### [CATEGORY] Short title of the issue
**Date:** YYYY-MM-DD  
**Severity:** minor | moderate | blocking  
**Context:** What were we trying to do when this was encountered?  
**Observation:** What was the friction, gap, or error?  
**Impact:** How did it slow down or block development?  
**Suggested improvement:** What would fix or improve this?  

---
```

## Categories
- `[DOC GAP]` — Missing, incomplete, or outdated documentation
- `[SDK FRICTION]` — xrpl.js or other SDK usability issue
- `[TOOLING]` — MCP server, AI tool, CLI, or dev tool issue
- `[API CONFUSION]` — XRPL ledger API behaved unexpectedly or was poorly specified
- `[MISSING EXAMPLE]` — A code example would have saved significant time
- `[BUG]` — Confirmed bug in a library or tool
- `[SETUP]` — Environment or configuration friction
- `[OTHER]` — Anything else worth reporting

## Steps
1. If the user did not describe the observation, ask them what was encountered.
2. Infer category and severity from context; confirm with the user if ambiguous.
3. Use today's date for the Date field.
4. Append the formatted entry to `docs/DEVEX_LOG.md` using the Edit tool.
5. Confirm the entry was saved and state the running total of logged entries.
6. Proactively suggest logging when you notice: repeated trial-and-error, a workaround being applied, a confusing error message, or a gap between docs and actual behavior.
