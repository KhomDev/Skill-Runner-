# khomdev-skill-runner

Custom DeepSeek Harness (DSH) bundle for the KhomDev audit workspace: a
**skill-run composer**. Pick a protocol from `PROTOCOLS/`, pick skills from the
`SKILLS/` collections (Pashov, Trail of Bits, Web3 Bounty Hunting are the
essential core; every other collection is discovered dynamically), preview the
exact run prompt, and queue it into a DSH session with one explicit click.

One package, two faces (khomdev-audit-ops pattern):

| Face | File | What it does |
|---|---|---|
| Host plugin | `lib/index.js` (package main) | Read-only scans of `SKILLS/` (frontmatter name/description, source path, collection), `.dsh/skills/` (loadability + `dsh-adapted` native markers), and `PROTOCOLS/` (language guess, capped file counts, tests, git branch). Serves the `skillRunner` Typert remote namespace (`catalog` / `protocols` / `meta` / `refresh`). No spawns, no writes. |
| Browser bundle | `lib/client.js` (`./client` export, `dsh.client` declaration) | The **Skill Runner** web panel: gradient header, protocol + skill **popup picker dialogs** (searchable, collection-filtered, internally scrolled), run-mode cards (parallel subagent lanes / single pass), operator focus, session picker, collapsible prompt preview, Send / Copy. The panel owns its scrolling (flex column root + internal scroll + pinned action bar). Sending queues ONE user message via `sessions.using(...).prompt([{type:"text",text}], "queue"|"steer")`. |

The bundle's `cordis.patch.yml` (`dsh.bundle.patch`) inserts the package itself
as one loader entry — one entry serves both faces.

## Contract (non-negotiable)

- **Read-only host surface.** No subprocess, no file writes, no auditd/auditmem
  calls. The exhaustive surface is fs reads of the three trees.
- **The only mutation is the operator's Send click**, which queues one user
  message into a session the operator picked. Nothing runs from the panel.
- Every dispatched prompt bakes in the workspace skill boundary: skills are
  tier-8 advisory (hypotheses for notes, never findings/severity/submission
  content); no workflow/prehunt/target/submission commands; `PROTOCOLS/` is
  read-only; PoC execution needs the exact-hash plan approval at
  `poc_proposal_execution`; outputs go to `engagements/<audit>/notes/` or stay
  in-session.
- Prompt text carries repo-relative paths only (host-path sanitization).
- Payloads expose `workspaceRoot` solely so the panel can preselect the
  matching session; it is never rendered.

## Layout

```
package.json          bundle package: main + ./client + dsh.bundle.patch + dsh.client
cordis.patch.yml      bundle patch (self-insert with config)
lib/index.js          host plugin (ESM, no build step)
lib/client.js         browser bundle (factory format, no build step)
locale/en.json        panel label
icon.svg              Plugins-page card artwork
test/test-host.mjs    unit + service assertions over test/fixtures
test/test-client.mjs  bundle-format + prompt-composer assertions (window shim)
test/smoke-workspace.mjs  live read-only scan of the real workspace
```

## Install

1. Plugins page → install from the local path
   `C:/Users/d3fal/dev/khomdev-skill-runner` (repo root **is** the package; forward
   slashes are the portable spelling — the backslash form is
   `C:\Users\d3fal\dev\khomdev-skill-runner`), or
   replicate manually in the profile (`~/.dsh/profiles/desktop`):
   - `package.json`: `dependencies["khomdev-skill-runner"] = "link:C:/Users/d3fal/dev/khomdev-skill-runner"`
     and append `"khomdev-skill-runner"` to `dsh.profile.bundles`.
   - `node_modules/khomdev-skill-runner` → symlink/junction to the repo
     (relative `../../../../dev/khomdev-skill-runner`, matching audit-ops).
2. **Restart DSH** — the running composition keeps its old entry list until
   restart.
3. Rollback: remove the two package.json edits + the link (or uninstall via
   the Plugins page after restart).

## Verify after restart

1. Plugins page lists `khomdev-skill-runner` without error.
2. Sidebar shows **Skill Runner**; the panel loads the live catalog
   (37 skills / 71 protocols at build time) and the protocol and skill picker
   popups open from the summary rows.
3. `node test/test-host.mjs`, `node test/test-client.mjs`,
   `node test/smoke-workspace.mjs` all pass.
4. Pick a protocol + a few skills, review the preview, Send to the session:
   the message appears in the chat and the agent starts the run.

## Skill catalog rules

- A skill is **loadable** when its name exists in the workspace project skill
  root `.dsh/skills/` (what the `skill` tool can load). Non-loadable entries
  are still selectable: the composed prompt points the agent at the source
  file to read instead.
- A skill is **DSH-native** (`⚡`) when its `.dsh/skills/` copy carries
  `dsh-adapted: true` in frontmatter — the DSH refactor of the upstream
  Claude-Code skill text (knowledge preserved, tool instructions translated).
  `.claude/skills/` junctions keep reading the pristine `SKILLS/` source, so
  Claude Code sessions are unaffected.

## Design notes

- Client wire declarations use `{ mode: "src-json" }` pass-through codecs
  (no zod client-side), zero-parameter methods only — the prompt is composed
  client-side by a pure function (`buildPrompt`), unit-tested via the
  `window.__ModuleLoader__` shim.
- The host resolves its service base synchronously (bare specifier → DSH
  runtime path → local fallback), the v0.1.2 audit-ops lesson: registering
  after an await fails the Cordis fiber start.
- DSH target: 0.2.0-rc.2 (desktop channel is nightly — re-verify on updates).

## Version

0.1.4 — 2026-11-09. The actual live-GUI root cause, found with a probe the
panel itself rendered: the client namespace WAS mounted — "remote
namespace unavailable" was my resolution bug. Client Remote namespaces are
nested cordis services under "remote.<namespace>"; shipped consumers get
them via injection (ui-skill injects "remote.skills"), and a plugin that
creates its own namespace through $mount cannot inject it (circular
dependency — the mount itself provides the service). The panel now resolves
the namespace the way cordis does — ctx.get("remote.skillRunner") — with
the old property form kept as a fallback. Unit-tested via waitForFace.
Also: $mount rejections are no longer swallowed (the real error shows in
the panel status), and the temporary boot diagnostics are removed.

0.1.3 — 2026-11-09. Security-and-quality audit pass over v0.1.2 (12 fixes):
host — in-flight scan dedup (refresh racing the client poll no longer
double-scans the workspace), host-path scrubbing of raw fs error text,
lastErrors capped at 20, frontmatter closer no longer false-closes on
"----" rules; client — composed-prompt hardening (every third-party
interpolation flattened to one line so crafted skill/protocol text cannot
forge prompt lines), remote-mount teardown-race guard, prompt-throw retires
the submission echo (no phantom queued message), failed feed errors now
render instead of silently emptying the pickers, sidebar label wired through
the locale service, version sites synced; docs — install path restored,
stale grid claim reworded. Tests extended: concurrent-dedup identity,
frontmatter-closer regression, newline-smuggling payloads, locale-aware
mock.

0.1.2 — 2026-11-09. The second half of the v0.1.0 live failure: apply()
returned the service object, but Cordis validates a plugin's return value
(function disposer | null/undefined | promise of those | iterator) and a
plain-object return is the "Invalid effect" failure class — the fiber start
failed and the host plugin never registered, which is what put the
"skillRunner remote namespace unavailable" error on the panel and a load
error on the Plugins page. apply() now returns nothing; the service
registers through its base constructor as ctx.skillRunner (tests updated to
match). With v0.1.1's gateway markers this completes the host-side fix.

0.1.1 — 2026-11-09. Fixes the v0.1.0 live-GUI failure "skillRunner remote
namespace unavailable": the Typert Gateway's source-mode discovery only
resolves endpoints whose methods are carried on the service prototype's
version-1 Remote-method descriptor (what the shipped @Remote decorator
writes); hand-authored services must attach the same descriptor, which the
host now does for catalog/protocols/refresh/meta (verified against the real
runtime TypertRemoteService). The panel was also rebuilt after operator
feedback: protocol and skill selection moved into popup picker dialogs, the
page scrolls internally (flex column root + scroll area + pinned action bar),
the absolute banner-glow overlay and fixed toast were removed (no more
overlaps), and the remote face is awaited for up to 15 s instead of failing
when the panel renders before the client-side $mount settles.

0.1.0 — 2026-11-09. Initial release.
