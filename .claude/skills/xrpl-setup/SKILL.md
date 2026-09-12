---
name: xrpl-setup
description: Set up XRPL DevEx Capture in this project. Shows the consent text, asks for consent and a team name, generates a pseudonym, registers the hooks project scoped. Use when a session says identity is not set up, or when the developer asks to enable or disable XRPL feedback capture.
argument-hint: "[register | disable | status | invite <code>]"
allowed-tools: Bash(node *), Bash(bash *), Bash(find *), Bash(cat *), Read
---

You are setting up XRPL DevEx Capture v2 for the developer in this project. Everything here is project scoped, never global.

## 1. Locate the repo

The capture scripts live in a directory containing `hook/setup.mjs`. Find it in this order and call its absolute path `REPO`:

1. `./hook/setup.mjs` exists: `REPO` is the project root.
2. Otherwise run `find . -path '*/hook/setup.mjs' -not -path '*/node_modules/*' | head -1` (vendored copy inside the project).
3. Otherwise tell the developer to clone it first: `git clone https://github.com/RippleDevRel/xrpl-devex-hook.git` and stop.

If `$ARGUMENTS` starts with `invite`, run `node REPO/hook/setup.mjs --invite <the code>` (ask for the code first if it is missing), relay the one-line result, and stop. If `$ARGUMENTS` is `status`, run `node REPO/hook/status.mjs` and relay the output. If it is `disable`, run `node REPO/hook/setup.mjs --unregister` and say that the project hooks are removed and the identity file remains until the developer deletes `.xrpl-devex/identity.json`. Otherwise continue.

## 2. Consent first, then team

Run `node REPO/hook/setup.mjs --check-invite` (says whether this event requires an invite code) and `node REPO/hook/setup.mjs --show-consent`, and show the consent paragraph to the developer verbatim. Then ask, in one message:

- Do you consent? (yes or no)
- What is your team name?
- When `invite_only` is true: what is the event invite code the organizer handed out?

Do not continue until they answer. Do not guess a team name or a code from the repo, the folder or a previous conversation. Never ask for a real name or an email; none is collected.

## 3. Record the answer

- Yes: `TEAM_NAME="<their team, as typed>" CONSENT=yes node REPO/hook/setup.mjs --non-interactive --agent <the agent you are running as: claude-code, cursor, codex, grok or vscode-copilot>`, with `INVITE_CODE="<the code>"` in front when the event requires one. A refused code stops the setup with a message: relay it and ask again.
- No: `CONSENT=no node REPO/hook/setup.mjs --non-interactive`, then tell them nothing will be captured and stop.

The script prints the pseudonym, adds `.xrpl-devex/` and the generated hook files to the project `.gitignore`, registers that agent's project-local hooks and installs the skills.

## 4. Project hooks

`CONSENT=yes --agent <agent>` already registered that agent's hooks in this project (Claude Code: `.claude/settings.local.json`; Cursor: `.cursor/hooks.json`; Codex: `.codex/hooks.json`; Grok: `.grok/hooks/xrpl-devex.json`; Copilot: `.github/hooks/xrpl-devex.json`) and installed the skills. If they are missing, run `node REPO/hook/setup.mjs --register <agent>`. Never write into a home directory config. Tell the developer to trust the folder (`/hooks-trust` in Grok, `/hooks` elsewhere) and that a running Claude Code session may need a restart.

## 5. Verify and report

Run `node REPO/hook/status.mjs`. Report in two or three lines: pseudonym and team, whether hooks are registered, and that the developer should run `/hooks` (or restart the session) to confirm the hooks loaded, since a running Claude Code session may need a restart to pick up new hook registrations. Mention `/xrpl-status`, `/xrpl-feedback` and `/xrpl-session-analysis` once. Then get out of the way.
