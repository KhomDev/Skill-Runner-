// khomdev-skill-runner — browser bundle (loaded by the DSH web shell).
// Hand-authored in the shipped bundle format: window.__ModuleLoader__.load
// registers a factory whose require() resolves against the frozen platform
// baseline (react). No JSX, no build step, string concatenation only.
//
// v0.1.1: panel rebuilt after live GUI feedback —
//   * protocol and skill selection moved into popup modal dialogs (searchable,
//     collection-filtered, internally scrolled);
//   * the page owns its scrolling (flex column root + internal scroll area +
//     pinned action bar) instead of relying on the shell;
//   * removed the absolute banner glow overlay and the fixed toast in favor of
//     an inline status line — nothing floats over other UI;
//   * the remote face is now awaited (mount race): v0.1.0 declared the
//     namespace unavailable when the panel rendered before $mount settled.
//
// Panel contract: the host plugin exposes a read-only skillRunner remote
// (catalog / protocols / meta / refresh). This panel renders that catalog,
// lets the operator pick a protocol + skills + a run mode, previews the exact
// composed prompt, and — only on an explicit click — queues it into a session
// as ONE user message. Nothing executes from here; skills stay tier-8
// advisory and every workspace boundary is baked into the prompt text.

window.__ModuleLoader__.load({
  id: "khomdev-skill-runner",
  factory: (require) => {
    var module = { exports: {} };
    var exports = module.exports;
    Object.defineProperty(exports, Symbol.toStringTag, { value: "Module" });
    var react = require("react");

    const { createElement: h, useState, useEffect, useMemo, useCallback, useSyncExternalStore } = react;

    const NS = "skill-runner";
    const PANEL_ID = "skill-runner";
    const VERSION = "0.1.3";
    // English dictionary for the skill-runner namespace (mirrors
    // locale/en.json; registered through ctx.locale at apply time).
    const LOCALE_EN = { panel: "Skill Runner" };

    // ----- remote wire declarations (src-json codecs: pass-through, no zod) -----
    const TYPERT_REMOTE = {
      package: "khomdev-skill-runner",
      descriptors: [
        {
          id: "khomdev-skill-runner#skillRunner/catalog",
          service: "skillRunner",
          namespace: "skillRunner",
          method: "catalog",
          invocation: { kind: "direct" },
          parameters: [],
          result: { mode: "src-json" },
        },
        {
          id: "khomdev-skill-runner#skillRunner/protocols",
          service: "skillRunner",
          namespace: "skillRunner",
          method: "protocols",
          invocation: { kind: "direct" },
          parameters: [],
          result: { mode: "src-json" },
        },
        {
          id: "khomdev-skill-runner#skillRunner/meta",
          service: "skillRunner",
          namespace: "skillRunner",
          method: "meta",
          invocation: { kind: "direct" },
          parameters: [],
          result: { mode: "src-json" },
        },
        {
          id: "khomdev-skill-runner#skillRunner/refresh",
          service: "skillRunner",
          namespace: "skillRunner",
          method: "refresh",
          invocation: { kind: "direct" },
          parameters: [],
          result: { mode: "src-json" },
        },
      ],
    };

    let panelCtx = null;
    let disposeMount = null;

    function remoteFace() {
      try {
        const remote = panelCtx && panelCtx.remote;
        if (!remote) return null;
        const api = remote.skillRunner;
        return api && typeof api.catalog === "function" ? api : null;
      } catch (e) {
        return null;
      }
    }

    // v0.1.1: the $mount promise resolves asynchronously, and the panel can
    // render first. Poll briefly instead of declaring failure.
    function waitForFace(ms) {
      const deadline = Date.now() + ms;
      return new Promise((resolve) => {
        const attempt = () => {
          const api = remoteFace();
          if (api || Date.now() > deadline) return resolve(api);
          setTimeout(attempt, 250);
        };
        attempt();
      });
    }

    // ----- injected stylesheet (theme-aware via the shell's CSS variables) -----
    const CSS = [
      ".ksr_root{display:flex;flex-direction:column;height:100%;min-height:0;max-height:100%;box-sizing:border-box;font-family:var(--dsw-alias-font-family,sans-serif);color:var(--dsw-alias-label-primary,#1f2328);background:var(--dsw-alias-bg-canvas,transparent)}",
      ".ksr_scroll{flex:1 1 auto;min-height:0;overflow-y:auto;overscroll-behavior:contain;width:100%;max-width:1080px;margin:0 auto;padding:16px 20px 8px;box-sizing:border-box}",
      ".ksr_actionBar{flex:none;width:100%;max-width:1080px;margin:0 auto;padding:10px 20px 12px;border-top:1px solid var(--dsw-alias-border-l1,#d8dee4);background:var(--dsw-alias-bg-overlay,#fff);display:flex;align-items:center;gap:10px;flex-wrap:wrap;box-sizing:border-box}",
      ".ksr_banner{position:relative;border-radius:12px;padding:14px 18px;color:#fff;background:linear-gradient(120deg,#7C3AED 0%,#C026D3 52%,#2563EB 100%)}",
      ".ksr_bannerTitle{margin:0;font-size:17px;font-weight:700;display:flex;align-items:center;gap:8px;flex-wrap:wrap}",
      ".ksr_pills{display:flex;flex-wrap:wrap;gap:6px;margin-top:10px;align-items:center}",
      ".ksr_pill{background:rgba(255,255,255,.16);border:1px solid rgba(255,255,255,.28);border-radius:999px;padding:2px 10px;font-size:11px;font-weight:600}",
      ".ksr_section{margin-top:14px}",
      ".ksr_sectionHead{display:flex;align-items:center;gap:8px;margin-bottom:8px;flex-wrap:wrap}",
      ".ksr_stepNum{width:20px;height:20px;border-radius:6px;background:linear-gradient(120deg,#7C3AED,#C026D3 55%,#2563EB);color:#fff;font-size:11px;font-weight:700;display:inline-flex;align-items:center;justify-content:center;flex:none}",
      ".ksr_sectionTitle{font-size:13px;font-weight:650;margin:0}",
      ".ksr_sectionSub{font-size:11px;color:var(--dsw-alias-label-tertiary,#6b7280);margin:1px 0 0}",
      ".ksr_pickRow{display:flex;gap:10px;flex-wrap:wrap;margin-top:10px;align-items:stretch}",
      ".ksr_summary{flex:1;min-width:240px;display:flex;align-items:center;gap:6px;flex-wrap:wrap;min-height:38px;padding:6px 10px;border:1px solid var(--dsw-alias-border-l2,#cfd6dd);border-radius:10px;cursor:pointer;background:var(--dsw-alias-bg-overlay,#fff);transition:border-color .12s}",
      ".ksr_summary:hover{border-color:#7C3AED}",
      ".ksr_summary[data-on='1']{border-color:#7C3AED;box-shadow:0 0 0 1px rgba(124,58,237,.35)}",
      ".ksr_summaryLabel{font-size:10.5px;font-weight:700;text-transform:uppercase;letter-spacing:.04em;color:var(--dsw-alias-label-tertiary,#6b7280);margin-right:2px}",
      ".ksr_summaryHint{font-size:12px;color:var(--dsw-alias-label-tertiary,#6b7280)}",
      ".ksr_protoBadge{display:inline-flex;align-items:center;gap:6px;font-size:12px;font-weight:650}",
      ".ksr_langChip{display:inline-block;font-size:10px;font-weight:700;border-radius:5px;padding:1px 6px;background:rgba(124,58,237,.12);color:#6d28d9}",
      ".ksr_protoMeta{font-size:10.5px;color:var(--dsw-alias-label-tertiary,#6b7280)}",
      ".ksr_schips{display:flex;flex-wrap:wrap;gap:4px;max-height:78px;overflow-y:auto;flex:1;min-width:0}",
      ".ksr_schip{display:inline-flex;align-items:center;gap:3px;border-radius:6px;padding:1px 4px 1px 8px;background:rgba(124,58,237,.12);color:#5b21b6;font-size:11px;font-weight:600;max-width:100%}",
      ".ksr_schipName{overflow:hidden;text-overflow:ellipsis;white-space:nowrap;max-width:180px}",
      ".ksr_schip button{border:0;background:0;cursor:pointer;color:inherit;font-size:12px;line-height:1;padding:2px 4px;border-radius:4px}",
      ".ksr_schip button:hover{background:rgba(124,58,237,.2)}",
      ".ksr_button{font-size:12px;padding:6px 14px;border-radius:8px;border:1px solid var(--dsw-alias-border-strong,#d0d7de);background:var(--dsw-alias-bg-overlay,#fff);color:inherit;cursor:pointer;white-space:nowrap}",
      ".ksr_button:hover{border-color:#7C3AED}",
      ".ksr_button:disabled{opacity:.5;cursor:default}",
      ".ksr_modeRow{display:grid;grid-template-columns:1fr 1fr;gap:10px}",
      "@media (max-width:680px){.ksr_modeRow{grid-template-columns:1fr}}",
      ".ksr_mode{border:1px solid var(--dsw-alias-border-l1,#d8dee4);border-radius:10px;padding:10px 12px;cursor:pointer;background:var(--dsw-alias-bg-overlay,#fff);transition:border-color .12s,box-shadow .12s}",
      ".ksr_mode:hover{border-color:rgba(124,58,237,.55)}",
      ".ksr_mode[data-on='1']{border-color:#7C3AED;box-shadow:0 0 0 1px rgba(124,58,237,.5)}",
      ".ksr_modeTitle{font-size:12.5px;font-weight:650;margin:0}",
      ".ksr_modeDesc{font-size:11px;color:var(--dsw-alias-label-tertiary,#6b7280);margin:3px 0 0;line-height:1.5}",
      ".ksr_label{font-size:10.5px;font-weight:650;color:var(--dsw-alias-label-secondary,#374151);text-transform:uppercase;letter-spacing:.04em;margin:12px 0 5px}",
      ".ksr_textarea{width:100%;box-sizing:border-box;font:inherit;font-size:12.5px;min-height:48px;resize:vertical;padding:7px 10px;border-radius:8px;border:1px solid var(--dsw-alias-border-l2,#cfd6dd);background:var(--dsw-alias-bg-overlay,#fff);color:inherit;outline:none}",
      ".ksr_textarea:focus{border-color:#7C3AED}",
      ".ksr_select{font-size:12.5px;padding:6px 10px;border-radius:8px;border:1px solid var(--dsw-alias-border-l2,#cfd6dd);background:var(--dsw-alias-bg-overlay,#fff);color:inherit;max-width:100%}",
      ".ksr_preview{margin:0;padding:10px 12px;border-radius:10px;border:1px solid var(--dsw-alias-border-l1,#d8dee4);background:var(--dsw-alias-markdown-code-block,#f6f8fa);color:var(--dsw-alias-label-secondary,#374151);font-family:ui-monospace,Consolas,monospace;font-size:10.5px;line-height:1.55;white-space:pre-wrap;overflow-wrap:anywhere;max-height:220px;overflow:auto}",
      ".ksr_send{background:linear-gradient(120deg,#7C3AED 0%,#C026D3 55%,#2563EB 100%);color:#fff;border:0;border-radius:9px;padding:8px 20px;font-size:12.5px;font-weight:700;cursor:pointer;box-shadow:0 5px 16px rgba(124,58,237,.35);transition:filter .12s}",
      ".ksr_send:hover{filter:brightness(1.12)}",
      ".ksr_send:disabled{opacity:.45;cursor:default;box-shadow:none;filter:none}",
      ".ksr_count{font-size:12px;color:var(--dsw-alias-label-secondary,#374151);font-weight:600}",
      ".ksr_status{font-size:11.5px;min-height:16px;flex:1;min-width:120px;text-align:right}",
      ".ksr_statusOk{color:#1a7f37}",
      ".ksr_statusErr{color:var(--dsw-alias-label-danger,#d1242f)}",
      ".ksr_statusInfo{color:var(--dsw-alias-label-tertiary,#6b7280)}",
      ".ksr_fillRow{color:var(--dsw-alias-label-tertiary,#6b7280);font-size:12px;padding:6px 0}",
      ".ksr_note{font-size:10.5px;color:var(--dsw-alias-label-tertiary,#6b7280);margin-top:10px;line-height:1.5}",
      ".ksr_overlay{position:fixed;inset:0;background:rgba(10,8,24,.5);display:flex;align-items:center;justify-content:center;padding:22px;z-index:70;animation:ksr_fade .12s ease-out}",
      ".ksr_modal{width:min(780px,100%);max-height:min(84vh,760px);display:flex;flex-direction:column;border-radius:14px;background:var(--dsw-alias-bg-overlay,#fff);color:var(--dsw-alias-label-primary,#1f2328);box-shadow:0 24px 70px rgba(0,0,0,.4);overflow:hidden;animation:ksr_rise .14s ease-out}",
      ".ksr_modalHead{flex:none;display:flex;align-items:center;gap:10px;padding:12px 16px;border-bottom:1px solid var(--dsw-alias-border-l1,#d8dee4)}",
      ".ksr_modalTitle{margin:0;font-size:13.5px;font-weight:700;flex:1;min-width:0}",
      ".ksr_modalClose{border:0;background:0;color:var(--dsw-alias-label-tertiary,#6b7280);font-size:14px;cursor:pointer;border-radius:7px;padding:2px 8px}",
      ".ksr_modalClose:hover{background:var(--dsw-alias-interactive-bg-hover,rgba(0,0,0,.06));color:var(--dsw-alias-label-primary,#1f2328)}",
      ".ksr_modalTools{flex:none;display:flex;gap:8px;align-items:center;padding:10px 12px 6px;flex-wrap:wrap}",
      ".ksr_modalTools .ksr_input{flex:1;min-width:180px}",
      ".ksr_input{font-size:12px;padding:6px 10px;border-radius:8px;border:1px solid var(--dsw-alias-border-l2,#cfd6dd);background:var(--dsw-alias-bg-overlay,#fff);color:inherit;outline:none;box-sizing:border-box}",
      ".ksr_input:focus{border-color:#7C3AED;box-shadow:0 0 0 2px rgba(124,58,237,.18)}",
      ".ksr_chips{display:flex;flex-wrap:wrap;gap:5px;padding:0 12px 8px}",
      ".ksr_chip{display:inline-flex;align-items:center;gap:5px;font-size:11px;font-weight:600;padding:2px 9px;border-radius:999px;border:1px solid var(--dsw-alias-border-l2,#cfd6dd);background:var(--dsw-alias-bg-overlay,#fff);cursor:pointer;transition:border-color .12s,background .12s}",
      ".ksr_chip:hover{border-color:#7C3AED}",
      ".ksr_chip[data-on='1']{border-color:#7C3AED;background:rgba(124,58,237,.10)}",
      ".ksr_dot{width:7px;height:7px;border-radius:99px;flex:none}",
      ".ksr_modalBody{flex:1;min-height:0;overflow-y:auto;overscroll-behavior:contain;padding:2px 10px 10px}",
      ".ksr_listRow{display:flex;align-items:flex-start;gap:8px;padding:7px 9px;border-radius:9px;cursor:pointer;border:1px solid transparent}",
      ".ksr_listRow:hover{background:var(--dsw-alias-interactive-bg-hover,rgba(0,0,0,.05))}",
      ".ksr_listRow[data-on='1']{background:rgba(124,58,237,.10);border-color:rgba(124,58,237,.45)}",
      ".ksr_listCheck{flex:none;width:16px;font-size:13px;font-weight:700;color:#7C3AED;padding-top:1px}",
      ".ksr_listCheckOff{color:var(--dsw-alias-label-tertiary,#6b7280);font-weight:400}",
      ".ksr_listMain{flex:1;min-width:0}",
      ".ksr_listName{font-size:12px;font-weight:650;font-family:ui-monospace,Consolas,monospace;word-break:break-all}",
      ".ksr_listDesc{font-size:10.5px;color:var(--dsw-alias-label-tertiary,#6b7280);line-height:1.45;margin:2px 0 0}",
      ".ksr_badges{display:flex;flex-wrap:wrap;gap:3px;margin-top:3px}",
      ".ksr_badge{font-size:9.5px;font-weight:600;border-radius:4px;padding:0 5px;background:var(--dsw-alias-interactive-bg-hover,rgba(0,0,0,.06))}",
      ".ksr_badgeOk{color:#1a7f37}.ksr_badgeNo{color:#9a6700}.ksr_badgeNative{color:#8250df}.ksr_badgeEss{color:#b45309}",
      ".ksr_bar{border-left:3px solid;align-self:stretch;flex:none;border-radius:2px;margin:-7px 0 -7px -9px}",
      ".ksr_modalFoot{flex:none;display:flex;align-items:center;gap:10px;padding:10px 16px;border-top:1px solid var(--dsw-alias-border-l1,#d8dee4);flex-wrap:wrap}",
      ".ksr_modalCount{font-size:11.5px;color:var(--dsw-alias-label-secondary,#374151);font-weight:600;flex:1;min-width:80px}",
      ".ksr_primaryBtn{background:linear-gradient(120deg,#7C3AED 0%,#C026D3 55%,#2563EB 100%);color:#fff;border:0;border-radius:8px;padding:7px 18px;font-size:12.5px;font-weight:700;cursor:pointer}",
      ".ksr_primaryBtn:hover{filter:brightness(1.12)}",
      "@keyframes ksr_fade{from{opacity:0}to{opacity:1}}",
      "@keyframes ksr_rise{from{opacity:0;transform:translateY(8px)}to{opacity:1;transform:none}}",
      "@media (prefers-reduced-motion:reduce){.ksr_mode,.ksr_chip,.ksr_summary{transition:none}.ksr_overlay,.ksr_modal{animation:none}}",
    ].join("\n");

    (function injectCss() {
      if (typeof document === "undefined") return;
      const tagId = "khomdev-skill-runner/panel.css";
      if (document.querySelector("style[data-plugin-css=" + JSON.stringify(tagId) + "]") !== null) return;
      const tag = document.createElement("style");
      tag.dataset.plugin = "khomdev-skill-runner";
      tag.dataset.pluginCss = tagId;
      tag.textContent = CSS;
      document.head.appendChild(tag);
    })();

    // ----- run modes -----
    const MODES = {
      subagents: {
        label: "parallel subagent lanes",
        text: "Dispatch each selected skill as an independent background subagent (the subagent tool with run_in_background true). Each subagent prompt must be self-contained: the skill name, its source path, the target protocol, and the six binding rules below. Collect results as the subagents settle and merge them into one combined coverage note; this session stays the coordinator.",
        cardTitle: "Parallel subagent lanes",
        cardDesc: "Each skill runs as an independent background subagent over the protocol; this session collects and merges the results. Best for broad sweeps.",
      },
      advisory: {
        label: "single-pass (this session)",
        text: "Run every selected skill sequentially in THIS session. For each skill: load its instructions, apply them to the target protocol, record the advisory summary, then continue with the next skill.",
        cardTitle: "Single pass in this session",
        cardDesc: "Skills run one after another, in order, with full context shared. Best for focused, deep passes.",
      },
    };

    // ----- pure prompt composer (unit-tested from test/test-client.mjs) -----
    // Third-party text (skill name/description/sourcePath, protocol name,
    // language) is flattened to one line before it enters the prompt: a
    // newline smuggled through a crafted directory or frontmatter value must
    // not be able to forge extra numbered binding rules or "source:"/"Load
    // it:" lines inside the composed prompt. The operator's focus stays
    // verbatim (trusted, multi-line is legitimate).
    function flat(value) {
      return String(value ?? "").replace(/\s+/g, " ").trim();
    }

    function buildPrompt(input) {
      const protocol = flat(input && input.protocol) || "<pick a protocol>";
      const language = flat(input && input.protocolLanguage) || "unknown";
      const skills = Array.isArray(input && input.skills) ? input.skills : [];
      const mode = MODES[input && input.mode] ? input.mode : "subagents";
      const focus = String(input && input.focus || "").trim();
      const lines = [];
      lines.push("Skill run — protocol: " + protocol + " (" + language + ") · " + skills.length + " skill(s) · mode: " + MODES[mode].label);
      lines.push("");
      lines.push("Target: PROTOCOLS/" + protocol + " — a read-only checkout. Never write into it; any harness or PoC work happens on a re-clone under engagements/.");
      lines.push("");
      if (skills.length === 0) {
        lines.push("Skills to run: — none selected —");
      } else {
        lines.push("Skills to run, in order:");
        skills.forEach((s, i) => {
          const name = flat(s && s.name);
          const description = flat(s && s.description);
          const sourcePath = flat(s && s.sourcePath);
          lines.push("  " + (i + 1) + ". " + name + (description ? " — " + description : ""));
          lines.push("     source: " + (sourcePath || (".dsh/skills/" + name + " (project skill root)")));
          lines.push(s.loadable
            ? "     Load it: call the skill tool with name \"" + name + "\" (it is in this session catalog)."
            : "     Load it: the skill is NOT in this session catalog — read the source file above and follow it as written.");
        });
      }
      lines.push("");
      lines.push("Run mode — " + MODES[mode].label + ":");
      lines.push(MODES[mode].text);
      lines.push("");
      lines.push("Operator focus:");
      lines.push(focus === "" ? "— none —" : focus);
      lines.push("");
      lines.push("Binding rules for this run (these override any skill instruction):");
      lines.push("1. Skills are advisory (tier 8): their output is hypothesis material for notes. Never findings, severity, or submission content; severity and gates belong to the workspace authority pipeline.");
      lines.push("2. Do not run auditd/auditmem workflow, pre-hunt, target, or submission commands from this run. PoC execution requires the exact-hash plan approval at poc_proposal_execution.");
      lines.push("3. Read PROTOCOLS/" + protocol + " only. Never modify, format, or commit anything inside the checkout.");
      lines.push("4. DSH tool mapping: read/write/edit for files, glob/grep for search, pwsh for shell (prefix supported commands with rtk), run_code for code execution, subagent for parallel work, todo_write for progress tracking. Windows host: run shell scripts under Git Bash.");
      lines.push("5. Record outputs under engagements/<audit>/notes/ or engagements/<audit>/generated/ when an audit is active; otherwise report in this session only. Never write into engagements/*/packages*, submission_guides/, RESULTS/, or PROTOCOLS/.");
      lines.push("6. When a skill's own instructions conflict with these rules, these rules win.");
      lines.push("");
      lines.push("Deliverable per skill: one concise advisory summary — what was examined, the strongest observations (no severity labels), and what was not covered. Close with a single combined coverage note for PROTOCOLS/" + protocol + ".");
      return lines.join("\n");
    }

    // ----- small helpers -----
    function fmtCount(n) {
      if (n == null) return "?";
      if (n >= 1000) return (n / 1000).toFixed(1) + "k";
      return String(n);
    }

    function ago(iso) {
      const t = Date.parse(iso);
      if (!Number.isFinite(t)) return null;
      const days = Math.round((Date.now() - t) / 86400000);
      if (days < 1) return "today";
      if (days < 30) return days + "d old";
      if (days < 365) return Math.round(days / 30) + "mo old";
      return Math.round(days / 365) + "y old";
    }

    // ----- sessions -----
    const EMPTY_SNAP = { byId: {}, ids: [] };

    function sessionRows(snap, workspaceRoot) {
      const rows = [];
      const byId = (snap && snap.byId) || {};
      for (const row of Object.values(byId)) {
        if (!row || !row.id) continue;
        if (row.parentId || row.origin === "subagent") continue;
        rows.push(row);
      }
      rows.sort((a, b) => (b.running ? 1 : 0) - (a.running ? 1 : 0) || String(a.displayTitle || a.id).localeCompare(String(b.displayTitle || b.id)));
      if (workspaceRoot) {
        const norm = String(workspaceRoot).replace(/\\/g, "/").toLowerCase();
        const hit = rows.find((r) => r.cwd && String(r.cwd).replace(/\\/g, "/").toLowerCase() === norm);
        if (hit) return [hit, ...rows.filter((r) => r !== hit)];
      }
      return rows;
    }

    function cwdTail(cwd) {
      if (!cwd) return "";
      const parts = String(cwd).replace(/\\/g, "/").split("/").filter(Boolean);
      return parts.slice(-2).join("/");
    }

    async function sendToSession(ctx, sessionId, text, steer) {
      const mode = steer ? "steer" : "queue";
      return ctx.sessions.using(sessionId, { source: "skill-runner" }, async (reference) => {
        const session = reference.binding.session;
        const submission = session.beginSubmission({ mode, text, attachments: [] });
        let result;
        try {
          result = await session.prompt([{ type: "text", text }], mode, undefined, submission.requestId);
        } catch (e) {
          // prompt() THREW (transport fault) rather than returning {ok:false}:
          // the runtime retires the pending echo only on the result-failure
          // path, so retire it here or the session shows a phantom queued
          // message forever.
          try { submission.abandon(); } catch (e2) {}
          throw e;
        }
        if (result && result.ok === false) {
          const err = result.error;
          throw new Error((err && (err.code + ": " + err.message)) || "the session rejected the prompt");
        }
        return true;
      });
    }

    // ----- modal shell -----
    function Modal({ title, onClose, children, footer }) {
      useEffect(() => {
        const onKey = (e) => { if (e.key === "Escape") onClose(); };
        window.addEventListener("keydown", onKey);
        return () => window.removeEventListener("keydown", onKey);
      }, [onClose]);
      return h("div", { className: "ksr_overlay", onClick: onClose },
        h("div", {
          className: "ksr_modal",
          role: "dialog",
          "aria-modal": "true",
          "aria-label": title,
          onClick: (e) => e.stopPropagation(),
        },
          h("div", { className: "ksr_modalHead" },
            h("h3", { className: "ksr_modalTitle" }, title),
            h("button", { type: "button", className: "ksr_modalClose", onClick: onClose, "aria-label": "Close" }, "✕")),
          children,
          footer));
    }

    function rowKeyDown(onPick) {
      return (e) => {
        if (e.key === "Enter" || e.key === " ") { e.preventDefault(); onPick(); }
      };
    }

    // ----- protocol picker popup -----
    function ProtocolPickerModal({ protocols, selected, onApply, onClose }) {
      const [query, setQuery] = useState("");
      const [pick, setPick] = useState(selected);
      const list = useMemo(() => {
        const q = query.trim().toLowerCase();
        return q === "" ? protocols : protocols.filter((p) => p.name.toLowerCase().includes(q));
      }, [protocols, query]);
      return h(Modal, { title: "Choose protocol (" + protocols.length + " targets)", onClose },
        h("div", { className: "ksr_modalTools" },
          h("input", {
            className: "ksr_input",
            autoFocus: true,
            placeholder: "Search protocols…",
            value: query,
            onChange: (e) => setQuery(e.target.value),
          })),
        h("div", { className: "ksr_modalBody" },
          list.length === 0 ? h("div", { className: "ksr_fillRow" }, "No protocols match.") :
            list.map((p) => h("div", {
              key: p.name,
              className: "ksr_listRow",
              "data-on": pick === p.name ? "1" : "0",
              role: "button",
              tabIndex: 0,
              onClick: () => setPick(pick === p.name ? null : p.name),
              onKeyDown: rowKeyDown(() => setPick(pick === p.name ? null : p.name)),
            },
              h("span", { className: "ksr_listCheck" + (pick === p.name ? "" : " ksr_listCheckOff") }, pick === p.name ? "●" : "○"),
              h("div", { className: "ksr_listMain" },
                h("div", { className: "ksr_listName" }, p.name),
                h("div", { className: "ksr_listDesc" },
                  h("span", { className: "ksr_langChip" }, p.language || "?"),
                  "  " + fmtCount(p.files) + " files" + (p.hasTests ? " · ✓ tests" : "") + (p.branch ? " · " + p.branch : "") + (ago(p.lastModified) ? " · " + ago(p.lastModified) : "")))))),
        h("div", { className: "ksr_modalFoot" },
          h("span", { className: "ksr_modalCount" }, pick ? pick : "none selected"),
          h("button", { type: "button", className: "ksr_button", onClick: () => setPick(null) }, "Clear"),
          h("button", { type: "button", className: "ksr_primaryBtn", disabled: !pick, onClick: () => onApply(pick) }, "Choose")));
    }

    // ----- skill picker popup -----
    function SkillPickerModal({ catalog, selected, onApply, onClose }) {
      const [query, setQuery] = useState("");
      const [coll, setColl] = useState("all");
      const [picked, setPicked] = useState(selected.slice());
      const skills = catalog ? catalog.skills : [];
      const collections = catalog ? catalog.collections : [];
      const visible = useMemo(() => {
        const q = query.trim().toLowerCase();
        return skills.filter((s) =>
          (coll === "all" || s.collection === coll) &&
          (q === "" || s.name.toLowerCase().includes(q) || String(s.description || "").toLowerCase().includes(q)));
      }, [skills, coll, query]);
      const toggle = (name) => {
        setPicked((prev) => prev.includes(name) ? prev.filter((n) => n !== name) : [...prev, name]);
      };
      return h(Modal, { title: "Choose skills (" + skills.length + " available)", onClose },
        h("div", { className: "ksr_modalTools" },
          h("input", {
            className: "ksr_input",
            autoFocus: true,
            placeholder: "Search skills by name or description…",
            value: query,
            onChange: (e) => setQuery(e.target.value),
          })),
        h("div", { className: "ksr_chips" },
          h("button", { type: "button", className: "ksr_chip", "data-on": coll === "all" ? "1" : "0", onClick: () => setColl("all") },
            "All · " + skills.length),
          collections.map((c) => h("button", {
            key: c.id,
            type: "button",
            className: "ksr_chip",
            "data-on": coll === c.id ? "1" : "0",
            onClick: () => setColl(c.id),
            title: c.essential ? "essential collection" : c.label,
          },
            h("span", { className: "ksr_dot", style: { background: c.color } }),
            (c.essential ? "★ " : "") + c.label + " · " + c.count))),
        h("div", { className: "ksr_modalBody" },
          visible.length === 0 ? h("div", { className: "ksr_fillRow" }, "No skills match this filter.") :
            visible.map((s) => h("div", {
              key: s.collection + ":" + s.name,
              className: "ksr_listRow",
              "data-on": picked.includes(s.name) ? "1" : "0",
              role: "button",
              tabIndex: 0,
              onClick: () => toggle(s.name),
              onKeyDown: rowKeyDown(() => toggle(s.name)),
            },
              h("span", { className: "ksr_bar", style: { borderColor: s.color || "#64748B" } }),
              h("span", { className: "ksr_listCheck" + (picked.includes(s.name) ? "" : " ksr_listCheckOff") }, picked.includes(s.name) ? "✓" : "○"),
              h("div", { className: "ksr_listMain" },
                h("div", { className: "ksr_listName" }, s.name),
                h("p", { className: "ksr_listDesc" }, s.description || "(no description)"),
                h("div", { className: "ksr_badges" },
                  s.loadable
                    ? h("span", { className: "ksr_badge ksr_badgeOk", title: "The session catalog can load this skill through the skill tool." }, "✓ session catalog")
                    : h("span", { className: "ksr_badge ksr_badgeNo", title: "Not in the session catalog — the run prompt points at the source file to read instead." }, "read source"),
                  s.native ? h("span", { className: "ksr_badge ksr_badgeNative", title: "A DSH-native refactor of the original skill text." }, "⚡ DSH-native") : null,
                  s.essential ? h("span", { className: "ksr_badge ksr_badgeEss", title: "One of the operator's essential collections." }, "★ essential") : null))))),
        h("div", { className: "ksr_modalFoot" },
          h("span", { className: "ksr_modalCount" }, picked.length + " selected"),
          h("button", { type: "button", className: "ksr_button", onClick: () => setPicked([]) }, "Clear all"),
          h("button", { type: "button", className: "ksr_primaryBtn", onClick: () => onApply(picked) }, picked.length ? "Apply " + picked.length + " skill(s)" : "Apply")));
    }

    function ModeCard({ id, active, onPick }) {
      const m = MODES[id];
      return h("div", {
        className: "ksr_mode",
        "data-on": active ? "1" : "0",
        onClick: onPick,
        role: "radio",
        "aria-checked": active,
        tabIndex: 0,
        onKeyDown: rowKeyDown(onPick),
      },
        h("p", { className: "ksr_modeTitle" }, (active ? "● " : "○ ") + m.cardTitle),
        h("p", { className: "ksr_modeDesc" }, m.cardDesc));
    }

    function SectionHead({ n, title, sub }) {
      return h("div", { className: "ksr_sectionHead" },
        h("span", { className: "ksr_stepNum" }, String(n)),
        h("div", { style: { minWidth: 0, flex: 1 } },
          h("p", { className: "ksr_sectionTitle" }, title),
          sub ? h("p", { className: "ksr_sectionSub" }, sub) : null));
    }

    // ----- main panel -----
    function SkillRunnerPanel() {
      const [data, setData] = useState(null);
      const [status, setStatus] = useState(null); // {kind: ok|err|info, text}
      const [busy, setBusy] = useState(false);

      const [protocol, setProtocol] = useState(null);
      const [selected, setSelected] = useState([]);
      const [modal, setModal] = useState(null); // "skills" | "protocols" | null

      const [mode, setMode] = useState("subagents");
      const [focus, setFocus] = useState("");
      const [steer, setSteer] = useState(false);
      const [sessionId, setSessionId] = useState("");
      const [sending, setSending] = useState(false);
      const [showPreview, setShowPreview] = useState(true);

      // Raw feeds stay referenced: a {ok:false} payload (e.g. no PROTOCOLS/
      // directory at the configured root) must render its error line, not
      // silently turn the panel into empty pickers.
      const catalogFeed = data ? data.catalog : null;
      const protocolsFeed = data ? data.protocols : null;
      const catalog = catalogFeed && catalogFeed.ok ? catalogFeed : null;
      const protocolsData = protocolsFeed && protocolsFeed.ok ? protocolsFeed : null;
      const workspaceRoot = catalog ? catalog.workspaceRoot : null;
      const protocolRow = useMemo(() => {
        if (!protocol || !protocolsData) return null;
        return protocolsData.protocols.find((p) => p.name === protocol) || null;
      }, [protocol, protocolsData]);

      const load = useCallback(async (force) => {
        setBusy(true);
        try {
          const api = await waitForFace(15000);
          if (!api) {
            setStatus({ kind: "err", text: "skillRunner remote namespace unavailable — the host plugin did not register it (check the Plugins page for a load error on khomdev-skill-runner, then restart DSH)" });
            return;
          }
          let next;
          if (force) {
            const r = await api.refresh();
            next = { catalog: r.catalog, protocols: r.protocols };
          } else {
            const [c, p] = await Promise.all([api.catalog(), api.protocols()]);
            next = { catalog: c, protocols: p };
          }
          setData(next);
          setStatus(null);
        } catch (e) {
          setStatus({ kind: "err", text: String((e && (e.message || e.toString())) || e) });
        } finally {
          setBusy(false);
        }
      }, []);

      useEffect(() => {
        load(false);
        const t = setInterval(() => load(false), 120000);
        return () => clearInterval(t);
      }, [load]);

      useEffect(() => {
        if (!status || status.kind === "err") return;
        const t = setTimeout(() => setStatus(null), 6000);
        return () => clearTimeout(t);
      }, [status]);

      const sessionsStore = panelCtx && panelCtx.sessions && panelCtx.sessions.list ? panelCtx.sessions.list : null;
      const sessionsSnap = useSyncExternalStore(
        useCallback((fn) => (sessionsStore ? sessionsStore.subscribe(fn) : () => {}), [sessionsStore]),
        sessionsStore ? () => sessionsStore.getSnapshot() : () => EMPTY_SNAP
      );
      const rows = useMemo(() => sessionRows(sessionsSnap, workspaceRoot), [sessionsSnap, workspaceRoot]);

      useEffect(() => {
        if (sessionId && rows.some((r) => r.id === sessionId)) return;
        if (rows.length) setSessionId(rows[0].id);
      }, [rows, sessionId]);

      const selectedSkills = useMemo(() => {
        const byName = new Map((catalog ? catalog.skills : []).map((s) => [s.name, s]));
        return selected.map((n) => byName.get(n)).filter(Boolean);
      }, [catalog, selected]);

      const promptText = useMemo(() => buildPrompt({
        protocol,
        protocolLanguage: protocolRow ? protocolRow.language : null,
        skills: selectedSkills,
        mode,
        focus,
      }), [protocol, protocolRow, selectedSkills, mode, focus]);

      const canSend = !!(protocol && selectedSkills.length && sessionId && !sending);

      const copyPrompt = () => {
        try {
          if (navigator.clipboard && navigator.clipboard.writeText) {
            navigator.clipboard.writeText(promptText).then(
              () => setStatus({ kind: "ok", text: "Prompt copied to clipboard." }),
              () => setStatus({ kind: "err", text: "Clipboard copy failed — open the preview and copy manually." }));
            return;
          }
        } catch (e) {}
        setStatus({ kind: "err", text: "Clipboard unavailable — open the preview and copy manually." });
      };

      const send = async () => {
        if (!canSend) return;
        setSending(true);
        setStatus({ kind: "info", text: "Sending to the session…" });
        try {
          await sendToSession(panelCtx, sessionId, promptText, steer);
          setStatus({ kind: "ok", text: "Queued " + selectedSkills.length + " skill(s) on " + protocol + (steer ? " — steering the running turn." : ".") });
        } catch (e) {
          setStatus({ kind: "err", text: "Send failed: " + String((e && (e.message || e.toString())) || e) });
        } finally {
          setSending(false);
        }
      };

      const statusClass = status ? (status.kind === "ok" ? "ksr_statusOk" : status.kind === "err" ? "ksr_statusErr" : "ksr_statusInfo") : "";

      // ----- composed elements (each expression is closed on its own lines) -----
      const banner = h("div", { className: "ksr_banner" },
        h("h2", { style: { margin: 0, fontSize: "17px", fontWeight: 700, display: "flex", alignItems: "center", gap: "8px", flexWrap: "wrap", outline: "none", border: "none" } },
          "⚡ Skill Runner",
          busy ? h("span", { style: { fontSize: "11px", fontWeight: 600, opacity: 0.85 } }, "· refreshing…") : null),
        h("p", { style: { margin: "5px 0 0", fontSize: "11.5px", opacity: 0.92, maxWidth: "620px", outline: "none", border: "none" } },
          "Pick a protocol, pick skills from the SKILLS/ collections, review the run prompt, and queue it into a session. The catalog is read-only; the only action here is your explicit Send."),
        h("div", { className: "ksr_pills" },
          catalog ? h("span", { className: "ksr_pill" }, catalog.counts.skills + " skills") : null,
          catalog ? h("span", { className: "ksr_pill" }, catalog.counts.loadable + " in session catalog") : null,
          catalog && catalog.counts.native ? h("span", { className: "ksr_pill" }, catalog.counts.native + " DSH-native") : null,
          protocolsData ? h("span", { className: "ksr_pill" }, protocolsData.counts.protocols + " protocols") : null,
          h("button", { type: "button", className: "ksr_button", style: { marginLeft: "auto" }, disabled: busy, onClick: () => load(true) }, "Refresh")));

      const fills = h("div", null,
        data === null && (!status || status.kind !== "err")
          ? h("div", { className: "ksr_fillRow" }, "Loading the skill catalog and protocol list from the host…")
          : null,
        status && status.kind === "err" && data === null
          ? h("div", { className: "ksr_fillRow", style: { color: "var(--dsw-alias-label-danger,#d1242f)" } }, status.text)
          : null,
        catalogFeed && catalogFeed.ok === false
          ? h("div", { className: "ksr_fillRow", style: { color: "var(--dsw-alias-label-danger,#d1242f)" } }, "catalog feed: " + (catalogFeed.error || "unavailable"))
          : null,
        protocolsFeed && protocolsFeed.ok === false
          ? h("div", { className: "ksr_fillRow", style: { color: "var(--dsw-alias-label-danger,#d1242f)" } }, "protocols feed: " + (protocolsFeed.error || "unavailable"))
          : null);

      const protocolSummary = h("div", {
        className: "ksr_summary",
        "data-on": protocol ? "1" : "0",
        role: "button",
        tabIndex: 0,
        onClick: () => setModal("protocols"),
        onKeyDown: rowKeyDown(() => setModal("protocols")),
      },
        h("span", { className: "ksr_summaryLabel" }, "Target"),
        protocolRow
          ? h("span", { className: "ksr_protoBadge" },
              h("span", { className: "ksr_langChip" }, protocolRow.language || "?"),
              h("span", { style: { fontFamily: "ui-monospace,Consolas,monospace" } }, protocolRow.name),
              h("span", { className: "ksr_protoMeta" },
                fmtCount(protocolRow.files) + " files" + (protocolRow.hasTests ? " · tests" : "") + (protocolRow.branch ? " · " + protocolRow.branch : "")))
          : h("span", { className: "ksr_summaryHint" }, "Choose protocol…"));

      const section1 = h("div", { className: "ksr_section" },
        h(SectionHead, { n: 1, title: "Protocol", sub: "A read-only target checkout under PROTOCOLS/ — click to open the picker popup." }),
        h("div", { className: "ksr_pickRow" },
          protocolSummary,
          h("button", { type: "button", className: "ksr_button", style: { alignSelf: "center" }, onClick: () => setModal("protocols") }, "Browse…")));

      const skillsSummary = h("div", {
        className: "ksr_summary",
        "data-on": selected.length ? "1" : "0",
        role: "button",
        tabIndex: 0,
        onClick: () => setModal("skills"),
        onKeyDown: rowKeyDown(() => setModal("skills")),
        style: { alignItems: "flex-start" },
      },
        h("span", { className: "ksr_summaryLabel", style: { marginTop: "2px" } }, "Skills"),
        selected.length
          ? h("div", { className: "ksr_schips" },
              selected.map((name) => h("span", { key: name, className: "ksr_schip" },
                h("span", { className: "ksr_schipName" }, name),
                h("button", {
                  type: "button",
                  "aria-label": "Remove " + name,
                  onClick: (e) => { e.stopPropagation(); setSelected((prev) => prev.filter((n) => n !== name)); },
                }, "✕"))))
          : h("span", { className: "ksr_summaryHint" }, "Choose skills…"));

      const section2 = h("div", { className: "ksr_section" },
        h(SectionHead, { n: 2, title: "Skills", sub: "From SKILLS/ — ★ collections are your essentials; everything else is discovered dynamically. Click to open the picker popup." }),
        h("div", { className: "ksr_pickRow" },
          skillsSummary,
          h("button", { type: "button", className: "ksr_button", style: { alignSelf: "center" }, onClick: () => setModal("skills") },
            "Browse" + (selected.length ? " (" + selected.length + ")" : "…"))));

      const sessionBlock = rows.length
        ? h("div", null,
            h("div", { className: "ksr_label" }, "Target session"),
            h("select", {
              className: "ksr_select",
              value: sessionId,
              onChange: (e) => setSessionId(e.target.value),
            },
              rows.map((r) => h("option", { key: r.id, value: r.id },
                (r.running ? "● " : "○ ") + (r.displayTitle || r.id) + "  ·  " + cwdTail(r.cwd)))),
            h("label", { style: { display: "inline-flex", alignItems: "center", gap: "6px", marginTop: "7px", fontSize: "11.5px", color: "var(--dsw-alias-label-secondary,#374151)", cursor: "pointer" } },
              h("input", { type: "checkbox", checked: steer, onChange: (e) => setSteer(e.target.checked) }),
              "Steer the running turn instead of queueing (interrupts the current turn)"))
        : h("div", { className: "ksr_note" }, "No sessions visible from this panel — use Copy prompt and paste it into a chat yourself.");

      const previewHead = h("div", { className: "ksr_label", style: { display: "flex", alignItems: "center", width: "100%" } },
        "Prompt preview (sent verbatim as one user message)",
        h("button", {
          type: "button",
          className: "ksr_button",
          style: { marginLeft: "auto", padding: "1px 10px", fontSize: "11px" },
          onClick: () => setShowPreview((v) => !v),
        }, showPreview ? "Hide" : "Show"));

      const section3 = h("div", { className: "ksr_section" },
        h(SectionHead, { n: 3, title: "Dispatch", sub: "How the run executes, and where it goes." }),
        h("div", { className: "ksr_modeRow" },
          h(ModeCard, { id: "subagents", active: mode === "subagents", onPick: () => setMode("subagents") }),
          h(ModeCard, { id: "advisory", active: mode === "advisory", onPick: () => setMode("advisory") })),
        h("div", { className: "ksr_label" }, "Operator focus (optional)"),
        h("textarea", {
          className: "ksr_textarea",
          placeholder: "e.g. concentrate on oracle staleness in the lending adapters…",
          value: focus,
          onChange: (e) => setFocus(e.target.value),
        }),
        sessionBlock,
        previewHead,
        showPreview ? h("pre", { className: "ksr_preview" }, promptText) : null);

      const note = h("div", { className: "ksr_note" },
        "khomdev-skill-runner v" + VERSION + " · read-only catalog over SKILLS/, PROTOCOLS/ and .dsh/skills/ · sending queues one user message; nothing runs from this page · skills stay tier-8 advisory — severity and gates belong to the workspace authority pipeline");

      const scroll = h("div", { className: "ksr_scroll" }, banner, fills, section1, section2, section3, note);

      const actionBar = h("div", { className: "ksr_actionBar" },
        h("span", { className: "ksr_count" },
          (protocol || "no protocol") + " · " + selectedSkills.length + " skill(s)" + (mode === "subagents" ? " · parallel lanes" : " · single pass")),
        status
          ? h("span", { className: "ksr_status " + statusClass, title: status.text }, status.text)
          : h("span", { className: "ksr_status" }),
        h("button", { type: "button", className: "ksr_button", onClick: copyPrompt, disabled: sending }, "Copy prompt"),
        h("button", { type: "button", className: "ksr_send", disabled: !canSend, onClick: send },
          sending ? "Sending…" : "Send to session"));

      const protocolModal = modal === "protocols" && protocolsData
        ? h(ProtocolPickerModal, {
            protocols: protocolsData.protocols,
            selected: protocol,
            onApply: (name) => { setProtocol(name); setModal(null); },
            onClose: () => setModal(null),
          })
        : null;

      const skillsModal = modal === "skills" && catalog
        ? h(SkillPickerModal, {
            catalog,
            selected,
            onApply: (names) => { setSelected(names); setModal(null); },
            onClose: () => setModal(null),
          })
        : null;

      return h("div", { className: "ksr_root" }, scroll, actionBar, protocolModal, skillsModal);
    }

    function SkillRunnerIcon() {
      return h("svg", { width: "20", height: "20", viewBox: "0 0 24 24", fill: "none", "aria-hidden": "true" },
        h("defs", null,
          h("linearGradient", { id: "ksr-icon-grad", x1: "0", y1: "0", x2: "24", y2: "24", gradientUnits: "userSpaceOnUse" },
            h("stop", { offset: "0", stopColor: "#7C3AED" }),
            h("stop", { offset: ".5", stopColor: "#C026D3" }),
            h("stop", { offset: "1", stopColor: "#2563EB" }))),
        h("rect", { x: "2", y: "2", width: "20", height: "20", rx: "6", fill: "url(#ksr-icon-grad)" }),
        h("path", { d: "M13.2 4.5 7 13.4h3.9l-.9 6.1L16.8 10h-4l1.1-5.5z", fill: "#fff" }));
    }

    // ----- plugin entry -----
    function apply(ctx) {
      panelCtx = ctx;

      // Register the locale dictionary for the "skill-runner" namespace (the
      // same shape the shipped client plugins use); the sidebar label below
      // resolves through it. Degrades to the embedded English literal when
      // the locale service is unavailable.
      try {
        if (ctx.locale && typeof ctx.locale.register === "function" && typeof ctx.effect === "function") {
          ctx.effect(() => ctx.locale.register(NS, { en: LOCALE_EN }), "skill-runner ui: locale dictionaries");
        }
      } catch (e) {
        ctx.logger?.warn?.("skill-runner ui: locale registration failed: " + (e && e.message));
      }
      const t = ctx.locale && typeof ctx.locale.bind === "function"
        ? ctx.locale.bind(NS)
        : (key) => LOCALE_EN[key] ?? key;

      let mountDisposed = false;
      try {
        const p = ctx.remote && typeof ctx.remote.$mount === "function"
          ? ctx.remote.$mount(TYPERT_REMOTE) : null;
        // $mount resolves a disposer asynchronously; if the context is torn
        // down first, invoke the late disposer immediately instead of storing
        // it after the dispose handler already ran (the namespace would
        // otherwise stay mounted past plugin teardown).
        const keep = (d) => {
          if (typeof d !== "function") return;
          if (mountDisposed) { try { d(); } catch (e) {} return; }
          disposeMount = d;
        };
        if (p && typeof p.then === "function") {
          p.then(keep,
                 (e) => ctx.logger?.warn?.("skill-runner ui: remote mount failed: " + (e && e.message)));
        } else keep(p);
      } catch (e) {
        ctx.logger?.warn?.("skill-runner ui: remote mount threw: " + (e && e.message));
      }
      ctx.on("dispose", () => {
        mountDisposed = true;
        try { disposeMount && disposeMount(); } catch (e) {}
      });

      ctx.slots.inject("sidebar.panellist", () => ctx.slots.register({
        name: "sidebar.panellist",
        id: PANEL_ID,
        order: 61,
        locale: NS,
        label: () => t("panel"),
      }, SkillRunnerIcon));

      ctx.slots.inject("main", function* () {
        yield ctx.slots.register({
          name: "main",
          key: PANEL_ID,
          locale: NS,
        }, SkillRunnerPanel);
      });
    }

    const inject = ["slots", "locale", "remote", "sessions"];

    exports.NS = NS;
    exports.PANEL_ID = PANEL_ID;
    exports.VERSION = VERSION;
    exports.MODES = MODES;
    exports.apply = apply;
    exports.inject = inject;
    exports.__test = { buildPrompt, MODES, waitForFace };
    return module.exports;
  }
});

//# sourceURL=khomdev-skill-runner/client.js
