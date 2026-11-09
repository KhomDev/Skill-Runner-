// khomdev-skill-runner — browser bundle (loaded by the DSH web shell).
// Hand-authored in the shipped bundle format (khomdev-audit-ops precedent):
// window.__ModuleLoader__.load registers a factory whose require() resolves
// against the frozen platform baseline (react). No JSX, no build step.
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
    const VERSION = "0.1.0";
    const PROTOCOL_PREVIEW = 24;

    // ----- remote wire declarations (src-json codecs: pass-through, no zod)
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

    // ----- injected stylesheet (theme-aware via the shell's CSS variables) -----
    const CSS = [
      ".ksr_page{box-sizing:border-box;min-height:100%;padding:20px 24px 130px;max-width:1080px;margin:0 auto;font-family:var(--dsw-alias-font-family,sans-serif);color:var(--dsw-alias-label-primary,#1f2328)}",
      ".ksr_banner{position:relative;overflow:hidden;border-radius:14px;padding:18px 22px;color:#fff;background:linear-gradient(120deg,#7C3AED 0%,#C026D3 52%,#2563EB 100%);box-shadow:0 10px 30px rgba(124,58,237,.25)}",
      ".ksr_bannerGlow{position:absolute;inset:0;background:radial-gradient(420px 160px at 88% -30%,rgba(255,255,255,.35),transparent 65%);pointer-events:none}",
      ".ksr_bannerTitle{margin:0;font-size:19px;font-weight:700;display:flex;align-items:center;gap:10px}",
      ".ksr_bannerSub{margin:6px 0 0;font-size:12px;opacity:.92;max-width:640px}",
      ".ksr_pills{display:flex;flex-wrap:wrap;gap:8px;margin-top:12px}",
      ".ksr_pill{background:rgba(255,255,255,.16);border:1px solid rgba(255,255,255,.28);border-radius:999px;padding:2px 10px;font-size:11px;font-weight:600}",
      ".ksr_section{margin-top:24px}",
      ".ksr_sectionHead{display:flex;align-items:center;gap:10px;margin-bottom:10px;flex-wrap:wrap}",
      ".ksr_stepNum{width:22px;height:22px;border-radius:7px;background:linear-gradient(120deg,#7C3AED,#C026D3 55%,#2563EB);color:#fff;font-size:12px;font-weight:700;display:inline-flex;align-items:center;justify-content:center;flex:none}",
      ".ksr_sectionTitle{font-size:14px;font-weight:650;margin:0}",
      ".ksr_sectionSub{font-size:11.5px;color:var(--dsw-alias-label-tertiary,#6b7280);margin:1px 0 0}",
      ".ksr_toolsRow{display:flex;flex-wrap:wrap;gap:8px;align-items:center;margin-bottom:10px}",
      ".ksr_input{flex:1;min-width:200px;font-size:12.5px;padding:6px 10px;border-radius:8px;border:1px solid var(--dsw-alias-border-l2,#cfd6dd);background:var(--dsw-alias-bg-overlay,#fff);color:inherit;outline:none}",
      ".ksr_input:focus{border-color:#7C3AED;box-shadow:0 0 0 2px rgba(124,58,237,.18)}",
      ".ksr_button{font-size:12px;padding:5px 12px;border-radius:8px;border:1px solid var(--dsw-alias-border-strong,#d0d7de);background:var(--dsw-alias-bg-overlay,#fff);color:inherit;cursor:pointer}",
      ".ksr_button:hover{border-color:#7C3AED}",
      ".ksr_button:disabled{opacity:.5;cursor:default}",
      ".ksr_grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(210px,1fr));gap:10px}",
      ".ksr_gridSkills{display:grid;grid-template-columns:repeat(auto-fill,minmax(250px,1fr));gap:10px}",
      ".ksr_card{position:relative;border:1px solid var(--dsw-alias-border-l1,#d8dee4);border-radius:11px;background:var(--dsw-alias-bg-overlay,#fff);padding:11px 12px 11px 15px;cursor:pointer;transition:transform .12s,border-color .12s,box-shadow .12s;overflow:hidden}",
      ".ksr_card:hover{transform:translateY(-2px);border-color:rgba(124,58,237,.55);box-shadow:0 8px 22px rgba(124,58,237,.15)}",
      ".ksr_card[data-on='1']{border-color:#7C3AED;box-shadow:0 0 0 1px rgba(124,58,237,.5),0 6px 18px rgba(124,58,237,.18)}",
      ".ksr_bar{position:absolute;left:0;top:0;bottom:0;width:3px}",
      ".ksr_name{font-size:12.5px;font-weight:650;font-family:ui-monospace,Consolas,monospace;margin:0 0 3px;word-break:break-all}",
      ".ksr_desc{font-size:11px;color:var(--dsw-alias-label-tertiary,#6b7280);line-height:1.45;margin:0;display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical;overflow:hidden}",
      ".ksr_badges{display:flex;flex-wrap:wrap;gap:4px;margin-top:7px}",
      ".ksr_badge{font-size:10px;font-weight:600;border-radius:5px;padding:1px 6px;background:var(--dsw-alias-interactive-bg-hover,rgba(0,0,0,.06))}",
      ".ksr_badgeOk{color:#1a7f37}.ksr_badgeNo{color:#9a6700}.ksr_badgeNative{color:#8250df}.ksr_badgeEss{color:#b45309}",
      ".ksr_chips{display:flex;flex-wrap:wrap;gap:6px;margin-bottom:10px}",
      ".ksr_chip{display:inline-flex;align-items:center;gap:6px;font-size:11.5px;font-weight:600;padding:3px 10px;border-radius:999px;border:1px solid var(--dsw-alias-border-l2,#cfd6dd);background:var(--dsw-alias-bg-overlay,#fff);cursor:pointer;transition:border-color .12s,background .12s}",
      ".ksr_chip:hover{border-color:#7C3AED}",
      ".ksr_chip[data-on='1']{border-color:#7C3AED;background:rgba(124,58,237,.10)}",
      ".ksr_dot{width:8px;height:8px;border-radius:99px;flex:none}",
      ".ksr_modeRow{display:grid;grid-template-columns:1fr 1fr;gap:10px}",
      "@media (max-width:720px){.ksr_modeRow{grid-template-columns:1fr}}",
      ".ksr_mode{border:1px solid var(--dsw-alias-border-l1,#d8dee4);border-radius:11px;padding:12px 14px;cursor:pointer;background:var(--dsw-alias-bg-overlay,#fff);transition:border-color .12s,box-shadow .12s}",
      ".ksr_mode:hover{border-color:rgba(124,58,237,.55)}",
      ".ksr_mode[data-on='1']{border-color:#7C3AED;box-shadow:0 0 0 1px rgba(124,58,237,.5)}",
      ".ksr_modeTitle{font-size:13px;font-weight:650;margin:0}",
      ".ksr_modeDesc{font-size:11px;color:var(--dsw-alias-label-tertiary,#6b7280);margin:4px 0 0;line-height:1.5}",
      ".ksr_label{font-size:11px;font-weight:650;color:var(--dsw-alias-label-secondary,#374151);text-transform:uppercase;letter-spacing:.04em;margin:16px 0 6px}",
      ".ksr_textarea{width:100%;box-sizing:border-box;font:inherit;font-size:12.5px;min-height:56px;resize:vertical;padding:8px 10px;border-radius:8px;border:1px solid var(--dsw-alias-border-l2,#cfd6dd);background:var(--dsw-alias-bg-overlay,#fff);color:inherit;outline:none}",
      ".ksr_textarea:focus{border-color:#7C3AED}",
      ".ksr_select{font-size:12.5px;padding:6px 10px;border-radius:8px;border:1px solid var(--dsw-alias-border-l2,#cfd6dd);background:var(--dsw-alias-bg-overlay,#fff);color:inherit;max-width:100%}",
      ".ksr_preview{margin:0;padding:12px 14px;border-radius:10px;border:1px solid var(--dsw-alias-border-l1,#d8dee4);background:var(--dsw-alias-markdown-code-block,#f6f8fa);color:var(--dsw-alias-label-secondary,#374151);font-family:ui-monospace,Consolas,monospace;font-size:11px;line-height:1.55;white-space:pre-wrap;overflow-wrap:anywhere;max-height:280px;overflow:auto}",
      ".ksr_sticky{position:sticky;bottom:0;margin-top:18px;padding:12px 0 4px;display:flex;align-items:center;gap:12px;background:linear-gradient(to top,var(--dsw-alias-bg-canvas,transparent) 30%,transparent);flex-wrap:wrap}",
      ".ksr_send{background:linear-gradient(120deg,#7C3AED 0%,#C026D3 55%,#2563EB 100%);color:#fff;border:0;border-radius:10px;padding:9px 22px;font-size:13px;font-weight:700;cursor:pointer;box-shadow:0 6px 18px rgba(124,58,237,.35);transition:filter .12s,transform .12s}",
      ".ksr_send:hover{filter:brightness(1.12);transform:translateY(-1px)}",
      ".ksr_send:disabled{opacity:.45;cursor:default;box-shadow:none;filter:none;transform:none}",
      ".ksr_count{font-size:12px;color:var(--dsw-alias-label-secondary,#374151);font-weight:600}",
      ".ksr_toast{position:fixed;right:22px;bottom:22px;max-width:420px;border-radius:10px;padding:10px 14px;font-size:12.5px;box-shadow:0 10px 30px rgba(0,0,0,.25);z-index:60;animation:ksr_slide .18s ease-out}",
      ".ksr_toastOk{background:#0d1f0d;color:#7ee2a8;border:1px solid #1a7f37}",
      ".ksr_toastErr{background:#2a0d0d;color:#ffb4b4;border:1px solid #d1242f}",
      "@keyframes ksr_slide{from{opacity:0;transform:translateY(8px)}to{opacity:1;transform:none}}",
      "@keyframes ksr_pop{from{transform:scale(.4);opacity:0}to{transform:scale(1);opacity:1}}",
      ".ksr_check{animation:ksr_pop .16s ease-out}",
      ".ksr_fillRow{color:var(--dsw-alias-label-tertiary,#6b7280);font-size:12px;padding:6px 0}",
      ".ksr_err{color:var(--dsw-alias-label-danger,#d1242f);background:rgba(209,36,47,.08);border-radius:8px;padding:8px 12px;font-size:12px;margin-top:10px;white-space:pre-wrap}",
      ".ksr_note{font-size:11px;color:var(--dsw-alias-label-tertiary,#6b7280);margin-top:8px;line-height:1.5}",
      ".ksr_protoMeta{display:flex;flex-wrap:wrap;gap:4px 10px;font-size:10.5px;color:var(--dsw-alias-label-tertiary,#6b7280);margin-top:6px}",
      ".ksr_langChip{display:inline-block;font-size:10px;font-weight:700;border-radius:5px;padding:1px 6px;background:rgba(124,58,237,.12);color:#6d28d9}",
      "@media (prefers-reduced-motion:reduce){.ksr_card,.ksr_mode,.ksr_send,.ksr_chip{transition:none}.ksr_check,.ksr_toast{animation:none}}",
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
    function buildPrompt(input) {
      const protocol = String(input && input.protocol || "<pick a protocol>");
      const language = String(input && input.protocolLanguage || "unknown");
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
          lines.push("  " + (i + 1) + ". " + s.name + (s.description ? " — " + s.description : ""));
          lines.push("     source: " + (s.sourcePath || (".dsh/skills/" + s.name + " (project skill root)")));
          lines.push(s.loadable
            ? "     Load it: call the skill tool with name \"" + s.name + "\" (it is in this session catalog)."
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

    // ----- small view helpers -----
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

    function ProtocolCard({ p, selected, onPick }) {
      const langBits = [];
      if (p.sol) langBits.push(p.sol + " sol");
      if (p.rs) langBits.push(p.rs + " rs");
      if (p.move) langBits.push(p.move + " move");
      if (p.cairo) langBits.push(p.cairo + " cairo");
      if (p.ts || p.js) langBits.push((p.ts || 0) + (p.js || 0) + " ts/js");
      if (p.py) langBits.push(p.py + " py");
      if (p.go) langBits.push(p.go + " go");
      return h("div", {
        className: "ksr_card",
        "data-on": selected ? "1" : "0",
        onClick: onPick,
        role: "button",
        tabIndex: 0,
        onKeyDown: (e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); onPick(); } },
        title: p.name,
      },
        h("div", { className: "ksr_bar", style: { background: selected ? "linear-gradient(180deg,#7C3AED,#C026D3)" : "var(--dsw-alias-border-l2,#cfd6dd)" } }),
        h("p", { className: "ksr_name" }, p.name),
        h("div", { className: "ksr_protoMeta" },
          h("span", { className: "ksr_langChip" }, p.language || "?"),
          h("span", null, fmtCount(p.files) + " files"),
          p.hasTests ? h("span", { style: { color: "#1a7f37", fontWeight: 600 } }, "✓ tests") : null,
          p.branch ? h("span", { style: { fontFamily: "ui-monospace,Consolas,monospace" } }, p.branch) : null,
          ago(p.lastModified)),
        langBits.length ? h("div", { className: "ksr_protoMeta", style: { marginTop: 2 } }, langBits.join(" · ")) : null,
        p.error ? h("div", { className: "ksr_protoMeta", style: { color: "var(--dsw-alias-label-danger,#d1242f)" } }, p.error) : null,
        selected ? h("div", { style: { position: "absolute", top: 8, right: 10, color: "#7C3AED", fontWeight: 700, fontSize: 13 } }, "✓") : null);
    }

    function SkillCard({ s, selected, onToggle }) {
      return h("div", {
        className: "ksr_card",
        "data-on": selected ? "1" : "0",
        onClick: onToggle,
        role: "button",
        tabIndex: 0,
        "aria-pressed": selected,
        onKeyDown: (e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); onToggle(); } },
        title: s.name,
      },
        h("div", { className: "ksr_bar", style: { background: s.color || "#64748B" } }),
        h("p", { className: "ksr_name" }, s.name),
        h("p", { className: "ksr_desc" }, s.description || "(no description)"),
        h("div", { className: "ksr_badges" },
          s.loadable
            ? h("span", { className: "ksr_badge ksr_badgeOk", title: "The session catalog can load this skill through the skill tool." }, "✓ session catalog")
            : h("span", { className: "ksr_badge ksr_badgeNo", title: "Not in the session catalog — the run prompt will point at the source file to read instead." }, "read source"),
          s.native ? h("span", { className: "ksr_badge ksr_badgeNative", title: "A DSH-native refactor of the original skill text." }, "⚡ DSH-native") : null,
          s.essential ? h("span", { className: "ksr_badge ksr_badgeEss", title: "One of the operator's essential collections." }, "★ essential") : null),
        selected ? h("div", { style: { position: "absolute", top: 8, right: 10, color: "#7C3AED", fontWeight: 700, fontSize: 14 }, className: "ksr_check" }, "✓") : null);
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
        onKeyDown: (e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); onPick(); } },
      },
        h("p", { className: "ksr_modeTitle" }, (active ? "● " : "○ ") + m.cardTitle),
        h("p", { className: "ksr_modeDesc" }, m.cardDesc));
    }

    function SectionHead({ n, title, sub, right }) {
      return h("div", { className: "ksr_sectionHead" },
        h("span", { className: "ksr_stepNum" }, String(n)),
        h("div", { style: { minWidth: 0, flex: 1 } },
          h("p", { className: "ksr_sectionTitle" }, title),
          sub ? h("p", { className: "ksr_sectionSub" }, sub) : null),
        right || null);
    }

    function Toast({ toast, onClose }) {
      if (!toast) return null;
      return h("div", {
        className: "ksr_toast " + (toast.kind === "ok" ? "ksr_toastOk" : "ksr_toastErr"),
        role: "status",
        onClick: onClose,
        title: "click to dismiss",
      }, toast.text);
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
        const result = await session.prompt([{ type: "text", text }], mode, undefined, submission.requestId);
        if (result && result.ok === false) {
          const err = result.error;
          throw new Error((err && (err.code + ": " + err.message)) || "the session rejected the prompt");
        }
        return true;
      });
    }

    // ----- main panel -----
    function SkillRunnerPanel() {
      const [data, setData] = useState(null);
      const [error, setError] = useState(null);
      const [busy, setBusy] = useState(false);

      const [protocol, setProtocol] = useState(null);
      const [protocolQuery, setProtocolQuery] = useState("");
      const [showAllProtocols, setShowAllProtocols] = useState(false);

      const [skillQuery, setSkillQuery] = useState("");
      const [activeColl, setActiveColl] = useState("all");
      const [selected, setSelected] = useState([]);

      const [mode, setMode] = useState("subagents");
      const [focus, setFocus] = useState("");
      const [steer, setSteer] = useState(false);
      const [sessionId, setSessionId] = useState("");
      const [sending, setSending] = useState(false);
      const [toast, setToast] = useState(null);

      const catalog = data && data.catalog && data.catalog.ok ? data.catalog : null;
      const protocolsData = data && data.protocols && data.protocols.ok ? data.protocols : null;
      const workspaceRoot = catalog ? catalog.workspaceRoot : null;

      const load = useCallback(async (force) => {
        setBusy(true);
        try {
          const api = remoteFace();
          if (!api) {
            setError("skillRunner remote namespace unavailable — check the Plugins page for a load error on khomdev-skill-runner, then toggle it off/on");
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
          setError(null);
        } catch (e) {
          setError(String((e && (e.message || e.toString())) || e));
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
        if (!toast) return;
        const t = setTimeout(() => setToast(null), 6000);
        return () => clearTimeout(t);
      }, [toast]);

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

      const protocols = useMemo(() => {
        const list = (protocolsData && protocolsData.protocols) || [];
        const q = protocolQuery.trim().toLowerCase();
        const filtered = q === "" ? list : list.filter((p) => p.name.toLowerCase().includes(q));
        return showAllProtocols || q !== "" ? filtered : filtered.slice(0, PROTOCOL_PREVIEW);
      }, [protocolsData, protocolQuery, showAllProtocols]);

      const totalProtocols = (protocolsData && protocolsData.protocols) ? protocolsData.protocols.length : 0;

      const selectedSkills = useMemo(() => {
        const byName = new Map((catalog ? catalog.skills : []).map((s) => [s.name, s]));
        return selected.map((n) => byName.get(n)).filter(Boolean);
      }, [catalog, selected]);

      const visibleSkills = useMemo(() => {
        const list = (catalog ? catalog.skills : []) || [];
        const q = skillQuery.trim().toLowerCase();
        return list.filter((s) =>
          (activeColl === "all" || s.collection === activeColl) &&
          (q === "" || s.name.toLowerCase().includes(q) || String(s.description || "").toLowerCase().includes(q)));
      }, [catalog, activeColl, skillQuery]);

      const promptText = useMemo(() => buildPrompt({
        protocol,
        protocolLanguage: protocol && protocolsData ? ((protocolsData.protocols.find((p) => p.name === protocol) || {}).language) : null,
        skills: selectedSkills,
        mode,
        focus,
      }), [protocol, protocolsData, selectedSkills, mode, focus]);

      const canSend = !!(protocol && selectedSkills.length && sessionId && !sending);

      const toggleSkill = (name) => {
        setSelected((prev) => prev.includes(name) ? prev.filter((n) => n !== name) : [...prev, name]);
      };

      const copyPrompt = () => {
        try {
          if (navigator.clipboard && navigator.clipboard.writeText) {
            navigator.clipboard.writeText(promptText).then(
              () => setToast({ kind: "ok", text: "Prompt copied to clipboard." }),
              () => setToast({ kind: "err", text: "Clipboard copy failed — select the preview text manually." }));
            return;
          }
        } catch (e) {}
        setToast({ kind: "err", text: "Clipboard unavailable — select the preview text manually." });
      };

      const send = async () => {
        if (!canSend) return;
        setSending(true);
        try {
          await sendToSession(panelCtx, sessionId, promptText, steer);
          setToast({ kind: "ok", text: "Queued the skill run into the session (" + selectedSkills.length + " skill(s) on " + protocol + ")" + (steer ? " — steering the running turn." : ".") });
        } catch (e) {
          setToast({ kind: "err", text: "Send failed: " + String((e && (e.message || e.toString())) || e) });
        } finally {
          setSending(false);
        }
      };

      const borderNone = { outline: "none", border: "none" };

      return h("div", { className: "ksr_page" },
        h("div", { className: "ksr_banner" },
          h("div", { className: "ksr_bannerGlow" }),
          h("h2", { style: { ...borderNone, ...{ margin: 0, fontSize: "19px", fontWeight: 700, display: "flex", alignItems: "center", gap: "10px" } } },
            "⚡ Skill Runner"),
          h("p", { style: { ...borderNone, ...{ margin: "6px 0 0", fontSize: "12px", opacity: 0.92, maxWidth: "640px" } } },
            "Pick a protocol, pick skills from the SKILLS/ collections, compose a contract-safe run, and queue it into a session. The catalog is read-only; the only action here is your explicit Send."),
          h("div", { className: "ksr_pills" },
            catalog ? h("span", { className: "ksr_pill" }, catalog.counts.skills + " skills") : null,
            catalog ? h("span", { className: "ksr_pill" }, catalog.counts.loadable + " in session catalog") : null,
            catalog && catalog.counts.native ? h("span", { className: "ksr_pill" }, catalog.counts.native + " DSH-native") : null,
            protocolsData ? h("span", { className: "ksr_pill" }, protocolsData.counts.protocols + " protocols") : null,
            busy ? h("span", { className: "ksr_pill" }, "refreshing…") : null,
            h("button", { className: "ksr_button", style: { marginLeft: "auto" }, disabled: busy, onClick: () => load(true) }, "Refresh"))),

        error ? h("div", { className: "ksr_err" }, error) : null,
        data === null && error === null ? h("div", { className: "ksr_fillRow" }, "Loading the skill catalog and protocol list from the host…") : null,
        catalog && catalog.ok === false ? h("div", { className: "ksr_err" }, "catalog feed: " + catalog.error) : null,
        protocolsData && protocolsData.ok === false ? h("div", { className: "ksr_err" }, "protocols feed: " + protocolsData.error) : null,

        // ----- step 1: protocol -----
        h("div", { className: "ksr_section" },
          h(SectionHead, { n: 1, title: "Protocol", sub: "Read-only target checkouts under PROTOCOLS/ — click one to select it." }),
          h("div", { className: "ksr_toolsRow" },
            h("input", {
              className: "ksr_input",
              placeholder: "Search " + (totalProtocols || "…") + " protocols…",
              value: protocolQuery,
              onChange: (e) => setProtocolQuery(e.target.value),
            })),
          h("div", { className: "ksr_grid" },
            protocols.map((p) => h(ProtocolCard, {
              key: p.name,
              p,
              selected: protocol === p.name,
              onPick: () => setProtocol(protocol === p.name ? null : p.name),
            }))),
          !showAllProtocols && protocolQuery === "" && totalProtocols > PROTOCOL_PREVIEW
            ? h("div", { style: { marginTop: 10 } },
                h("button", { className: "ksr_button", onClick: () => setShowAllProtocols(true) }, "Show all " + totalProtocols + " protocols"))
            : null,
          showAllProtocols && protocolQuery === ""
            ? h("div", { style: { marginTop: 10 } },
                h("button", { className: "ksr_button", onClick: () => setShowAllProtocols(false) }, "Show fewer"))
            : null),

        // ----- step 2: skills -----
        h("div", { className: "ksr_section" },
          h(SectionHead, {
            n: 2,
            title: "Skills",
            sub: "From SKILLS/ — ★ collections are your essentials (Pashov, Trail of Bits, Web3 Bounty Hunting); the rest is discovered dynamically.",
            right: selected.length ? h("button", { className: "ksr_button", onClick: () => setSelected([]) }, "Clear " + selected.length) : null,
          }),
          h("div", { className: "ksr_chips" },
            h("button", { className: "ksr_chip", "data-on": activeColl === "all" ? "1" : "0", onClick: () => setActiveColl("all") },
              "All · " + (catalog ? catalog.counts.skills : 0)),
            (catalog ? catalog.collections : []).map((c) => h("button", {
              key: c.id,
              className: "ksr_chip",
              "data-on": activeColl === c.id ? "1" : "0",
              onClick: () => setActiveColl(c.id),
              title: c.essential ? "essential collection" : c.label,
            },
              h("span", { className: "ksr_dot", style: { background: c.color } }),
              (c.essential ? "★ " : "") + c.label + " · " + c.count))),
          h("div", { className: "ksr_toolsRow" },
            h("input", {
              className: "ksr_input",
              placeholder: "Search skills by name or description…",
              value: skillQuery,
              onChange: (e) => setSkillQuery(e.target.value),
            })),
          visibleSkills.length
            ? h("div", { className: "ksr_gridSkills" },
                visibleSkills.map((s) => h(SkillCard, {
                  key: s.collection + ":" + s.name,
                  s,
                  selected: selected.includes(s.name),
                  onToggle: () => toggleSkill(s.name),
                })))
            : h("div", { className: "ksr_fillRow" }, "No skills match this filter.")),

        // ----- step 3: dispatch -----
        h("div", { className: "ksr_section" },
          h(SectionHead, { n: 3, title: "Dispatch", sub: "Choose how the run executes, review the exact prompt, then send it to a session." }),
          h("div", { className: "ksr_modeRow" },
            h(ModeCard, { id: "subagents", active: mode === "subagents", onPick: () => setMode("subagents") }),
            h(ModeCard, { id: "advisory", active: mode === "advisory", onPick: () => setMode("advisory") })),

          h("div", { className: "ksr_label" }, "Operator focus (optional)"),
          h("textarea", {
            className: "ksr_textarea",
            placeholder: "e.g. concentrate on oracle staleness in the lending adapters, or skip anything the prior audit already covered…",
            value: focus,
            onChange: (e) => setFocus(e.target.value),
          }),

          rows.length
            ? h("div", null,
                h("div", { className: "ksr_label" }, "Target session"),
                h("select", {
                  className: "ksr_select",
                  value: sessionId,
                  onChange: (e) => setSessionId(e.target.value),
                },
                  rows.map((r) => h("option", { key: r.id, value: r.id },
                    (r.running ? "● " : "○ ") + (r.displayTitle || r.id) + "  ·  " + cwdTail(r.cwd)))),
                h("label", { style: { display: "inline-flex", alignItems: "center", gap: "6px", marginTop: "8px", fontSize: "12px", color: "var(--dsw-alias-label-secondary,#374151)", cursor: "pointer" } },
                  h("input", { type: "checkbox", checked: steer, onChange: (e) => setSteer(e.target.checked) }),
                  "Steer the running turn instead of queueing (interrupts the current turn)"))
              : h("div", { className: "ksr_note" }, "No sessions visible from this panel — use Copy prompt and paste it into a chat yourself."),

          h("div", { className: "ksr_label" }, "Prompt preview (sent verbatim as one user message)"),
          h("pre", { className: "ksr_preview" }, promptText),

          h("div", { className: "ksr_sticky" },
            h("span", { className: "ksr_count" },
              (protocol || "no protocol") + " · " + selectedSkills.length + " skill(s) selected" + (mode === "subagents" ? " · parallel lanes" : " · single pass")),
            h("button", { className: "ksr_send", disabled: !canSend, onClick: send },
              sending ? "Sending…" : "Send to session"),
            h("button", { className: "ksr_button", onClick: copyPrompt, disabled: sending }, "Copy prompt"))),

        h("div", { className: "ksr_note" },
          "khomdev-skill-runner v" + VERSION + " · read-only catalog over SKILLS/, PROTOCOLS/ and .dsh/skills/ · sending queues one user message; nothing runs from this page · skills stay tier-8 advisory — severity and gates belong to the workspace authority pipeline"),
        h(Toast, { toast, onClose: () => setToast(null) }));
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

      try {
        const p = ctx.remote && typeof ctx.remote.$mount === "function"
          ? ctx.remote.$mount(TYPERT_REMOTE) : null;
        if (p && typeof p.then === "function") {
          p.then((d) => { disposeMount = d; },
                 (e) => ctx.logger?.warn?.("skill-runner ui: remote mount failed: " + (e && e.message)));
        }
      } catch (e) {
        ctx.logger?.warn?.("skill-runner ui: remote mount threw: " + (e && e.message));
      }
      ctx.on("dispose", () => { try { disposeMount && disposeMount(); } catch (e) {} });

      ctx.slots.inject("sidebar.panellist", () => ctx.slots.register({
        name: "sidebar.panellist",
        id: PANEL_ID,
        order: 61,
        locale: NS,
        label: () => "Skill Runner",
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
    exports.__test = { buildPrompt, MODES };
    return module.exports;
  }
});

//# sourceURL=khomdev-skill-runner/client.js
