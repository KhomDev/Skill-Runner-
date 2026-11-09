// khomdev-skill-runner — DSH host plugin (skill-run composer).
//
// One read-only bridge between the KhomDev audit workspace's SKILLS/ and
// PROTOCOLS/ trees and the DSH Web panel:
//   * catalog()   — every SKILL.md under SKILLS/ (frontmatter name +
//                   description, source path, collection badge), merged with
//                   the project skill root (.dsh/skills) so each entry knows
//                   whether the session can load it through the skill tool.
//   * protocols() — every target under PROTOCOLS/ with a language guess,
//                   capped file counts, test presence, git branch.
//   * meta()      — versions, config, cache ages.
//   * refresh()   — drops the TTL caches.
//
// Contract (mirrors khomdev-audit-ops):
//   * Read-only by construction: no spawns, no writes, no auditd/auditmem
//     calls. The exhaustive surface is fs reads of the three trees.
//   * The only mutation anywhere in the plugin is the operator's explicit
//     "Send to session" click in the browser panel, which queues one user
//     message into a session the operator picked. Composing and sending a
//     prompt never runs anything by itself.
//   * Payloads carry repo-relative paths only (PROTOCOLS/<name>,
//     SKILLS/<coll>/<skill>/SKILL.md). The single absolute value exposed is
//     workspaceRoot, used by the client to preselect the matching session and
//     never rendered.
//   * Skills stay tier-8 advisory: the composed prompt bakes the workspace
//     skill boundary (no workflow/prehunt/target/submission commands, no
//     writes into PROTOCOLS/ or package paths, PoC needs exact-hash plan
//     approval) into every dispatched run.

import { readdir, readFile, stat } from "node:fs/promises";
import path from "node:path";
import { createRequire } from "node:module";

export const name = "skill-runner";
export const inject = [];

const VERSION = "0.1.2";

const requireSync = createRequire(import.meta.url);

const DEFAULT_TYPERT_PROTOCOL_PATH =
  "C:\\Users\\d3fal\\AppData\\Local\\Programs\\DeepSeek Harness\\resources\\app.asar\\dsh\\node_modules\\@deepseek-ai\\dsh-typert-protocol\\lib\\index.js";

// ---------------------------------------------------------------------------
// Service base — resolved SYNCHRONOUSLY (bare specifier -> DSH runtime path
// -> local fallback class with the same observable typertRemote contract).
// v0.1.2 lesson from khomdev-audit-ops: registering the service after an
// await pushes the effect outside Cordis's synchronous effect-collection
// window and fails the fiber start ("Invalid effect").
// ---------------------------------------------------------------------------
let ServiceBase = null;
let serviceBaseSource = "unresolved";

function resolveServiceBaseSync(cfg) {
  if (ServiceBase) return ServiceBase;
  try {
    const m = requireSync("@deepseek-ai/dsh-typert-protocol");
    if (m && typeof m.TypertRemoteService === "function") {
      ServiceBase = m.TypertRemoteService;
      serviceBaseSource = "bare-specifier";
      return ServiceBase;
    }
  } catch (e) {}
  const candidates = [cfg && cfg.typertProtocolPath, DEFAULT_TYPERT_PROTOCOL_PATH].filter(Boolean);
  for (const p of candidates) {
    try {
      const m = requireSync(p);
      if (m && typeof m.TypertRemoteService === "function") {
        ServiceBase = m.TypertRemoteService;
        serviceBaseSource = "app-runtime";
        return ServiceBase;
      }
    } catch (e) {}
  }
  class LocalTypertRemoteService {
    constructor(ctx, serviceKey, options = {}) {
      this.ctx = ctx;
      this.name = serviceKey;
      this.typertRemote = Object.freeze({
        service: this,
        serviceKey,
        namespace: options.namespace ?? serviceKey,
      });
      let registered = false;
      try { ctx.set(serviceKey, this); registered = true; } catch (e) {}
      if (!registered) { try { ctx.reflect?.provide?.(serviceKey, this); registered = true; } catch (e) {} }
      if (!registered) ctx.logger?.warn?.("skill-runner: could not register service " + serviceKey);
    }
  }
  ServiceBase = LocalTypertRemoteService;
  serviceBaseSource = "local-fallback";
  return ServiceBase;
}

// ---------------------------------------------------------------------------
// Config
// ---------------------------------------------------------------------------
const DEFAULT_CONFIG = {
  workspaceRoot: "C:\\Users\\d3fal\\Desktop\\hustle\\BOUNTY\\audit",
  skillsDir: null,          // default: <workspaceRoot>/SKILLS
  protocolsDir: null,       // default: <workspaceRoot>/PROTOCOLS
  projectSkillsDir: null,   // default: <workspaceRoot>/.dsh/skills
  catalogTtlMs: 60000,
  scanMaxEntries: 2500,
  scanMaxDepth: 6,
  descriptionCap: 400,
  typertProtocolPath: null,
};

// Source collections in SKILLS/ -> badge metadata. Essential collections are
// the operator's named core (pashov, trail of bits, web3-bug-bounty-hunting);
// everything else is discovered dynamically with the same shape.
const COLLECTIONS = {
  "skills-pashov": { id: "pashov", label: "Pashov", color: "#F59E0B", essential: true },
  "trailofbits-skills": { id: "tob", label: "Trail of Bits", color: "#10B981", essential: true },
  "web3-bug-bounty-hunting-ai-skills": { id: "w3bbh", label: "Web3 Bounty Hunting", color: "#8B5CF6", essential: true },
  "quillshield_skills": { id: "quillshield", label: "QuillShield", color: "#06B6D4", essential: false },
  "web3-skills": { id: "web3", label: "Web3 Skills", color: "#3B82F6", essential: false },
  "ZeroSkills": { id: "zero", label: "ZeroSkills", color: "#EF4444", essential: false },
  "autonomus-skills": { id: "autonomus", label: "Autonomus", color: "#84CC16", essential: false },
};
const STANDALONE = { id: "standalone", label: "Standalone", color: "#64748B", essential: false };
const SESSION_EXTRA = { id: "session", label: "Session-only", color: "#94A3B8", essential: false };

const SKIP_DIRS = new Set([
  "node_modules", ".git", "lib", "dependencies", "out", "build", "artifacts",
  "cache", "target", ".forge-cache", ".dsh", "coverage", "dist", "crytic-export",
]);

// ---------------------------------------------------------------------------
// Frontmatter (tolerant line parser: name, description incl. folded blocks,
// allowed-tools, dsh-adapted marker)
// ---------------------------------------------------------------------------
function unquote(v) {
  const t = v.trim();
  if ((t.startsWith('"') && t.endsWith('"')) || (t.startsWith("'") && t.endsWith("'"))) {
    return t.slice(1, -1).trim();
  }
  return t;
}

function parseFrontmatter(text) {
  const out = { name: null, description: "", dshAdapted: false, allowedTools: null };
  if (typeof text !== "string" || !text.startsWith("---")) return out;
  const end = text.indexOf("\n---", 3);
  if (end < 0) return out;
  const block = text.slice(4, end);
  const lines = block.split(/\r?\n/);
  let foldedKey = null;
  const folded = [];
  const flush = () => {
    if (foldedKey === "description" && folded.length) {
      const joined = folded.join(" ").replace(/\s+/g, " ").trim();
      if (joined && !out.description) out.description = joined;
    }
    foldedKey = null;
    folded.length = 0;
  };
  for (const line of lines) {
    if (foldedKey !== null && (/^\s+\S/.test(line) || line.trim() === "")) {
      folded.push(line.trim());
      continue;
    }
    flush();
    const m = /^([A-Za-z0-9_-]+):\s*(.*)$/.exec(line);
    if (!m) continue;
    const key = m[1];
    const value = m[2].trim();
    if (value === ">" || value === ">-" || value === "|" || value === "|-" || value === "|+" || value === ">+") {
      foldedKey = key;
      continue;
    }
    if (key === "name" && out.name === null) out.name = unquote(value);
    else if (key === "description" && !out.description) out.description = unquote(value);
    else if (key === "allowed-tools") out.allowedTools = value;
    else if (key === "dsh-adapted" && /^(true|yes)$/i.test(value)) out.dshAdapted = true;
  }
  flush();
  return out;
}

function cap(text, max) {
  const s = String(text ?? "");
  return s.length > max ? s.slice(0, max) + "…" : s;
}

// ---------------------------------------------------------------------------
// Scans
// ---------------------------------------------------------------------------
async function listDir(dir) {
  try { return await readdir(dir, { withFileTypes: true }); } catch (e) { return null; }
}

async function walkSkillFiles(dir, depth, out, maxDepth) {
  if (depth > maxDepth || out.length > 500) return;
  const entries = await listDir(dir);
  if (!entries) return;
  for (const e of entries) {
    if (e.name === ".git" || e.name === "node_modules") continue;
    const p = path.join(dir, e.name);
    if (e.isDirectory()) await walkSkillFiles(p, depth + 1, out, maxDepth);
    else if (e.name === "SKILL.md") out.push(p);
  }
}

async function collectCatalog(cfg) {
  const skillsRoot = cfg.skillsDir;
  const files = [];
  // Depth 8 covers the nested marketplace layouts: <collection>/plugins/<plugin>/skills/<skill>/SKILL.md
  await walkSkillFiles(skillsRoot, 1, files, 8);

  const projectDirEntries = await listDir(cfg.projectSkillsDir);
  const loadable = new Set((projectDirEntries ?? []).filter((e) => e.isDirectory()).map((e) => e.name));
  // The DSH-native marker is read from the PROJECT copy (.dsh/skills), which
  // is the text sessions actually load — not from the pristine SKILLS/ source.
  const native = new Set();
  for (const e of projectDirEntries ?? []) {
    if (!e.isDirectory() || !loadable.has(e.name)) continue;
    try {
      const head = (await readFile(path.join(cfg.projectSkillsDir, e.name, "SKILL.md"), "utf8")).slice(0, 2000);
      if (parseFrontmatter(head).dshAdapted) native.add(e.name);
    } catch (err) {}
  }

  const skills = [];
  const seen = new Set();
  for (const file of files) {
    const rel = path.relative(skillsRoot, file).split(path.sep).join("/");
    const dirName = path.basename(path.dirname(file));
    let text = "";
    try { text = await readFile(file, "utf8"); } catch (e) { continue; }
    const fm = parseFrontmatter(text.slice(0, 8000));
    const name = fm.name || dirName;
    if (!name || seen.has(name)) continue;
    seen.add(name);
    const top = rel.includes("/") ? rel.slice(0, rel.indexOf("/")) : null;
    const collection = COLLECTIONS[top] ?? STANDALONE;
    skills.push({
      name,
      description: cap(fm.description, cfg.descriptionCap),
      collection: collection.id,
      collectionLabel: collection.label,
      color: collection.color,
      essential: collection.essential === true,
      sourcePath: "SKILLS/" + rel,
      loadable: loadable.has(name),
      native: native.has(name),
    });
  }

  // Session-only extras: loadable skills that live in the project skill root
  // but have no SKILLS/ source (hand-placed, e.g. web3-grep-arsenal).
  const byName = new Map(skills.map((s) => [s.name, s]));
  for (const e of projectDirEntries ?? []) {
    if (!e.isDirectory() || byName.has(e.name)) continue;
    let fm = { name: e.name, description: "", dshAdapted: false };
    try { fm = parseFrontmatter((await readFile(path.join(cfg.projectSkillsDir, e.name, "SKILL.md"), "utf8")).slice(0, 8000)); } catch (err) {}
    skills.push({
      name: e.name,
      description: cap(fm.description, cfg.descriptionCap),
      collection: SESSION_EXTRA.id,
      collectionLabel: SESSION_EXTRA.label,
      color: SESSION_EXTRA.color,
      essential: false,
      sourcePath: null,
      loadable: true,
      native: fm.dshAdapted === true,
    });
  }

  skills.sort((a, b) => (a.essential === b.essential ? 0 : a.essential ? -1 : 1) ||
    a.collection.localeCompare(b.collection) || a.name.localeCompare(b.name));

  const collectionCounts = {};
  for (const s of skills) collectionCounts[s.collection] = (collectionCounts[s.collection] ?? 0) + 1;
  const collections = [
    ...Object.values(COLLECTIONS).map((c) => ({ ...c, count: collectionCounts[c.id] ?? 0 })),
    { ...STANDALONE, count: collectionCounts[STANDALONE.id] ?? 0 },
    { ...SESSION_EXTRA, count: collectionCounts[SESSION_EXTRA.id] ?? 0 },
  ].filter((c) => c.count > 0);

  return {
    ok: true,
    generatedAt: new Date().toISOString(),
    workspaceRoot: cfg.workspaceRoot,
    counts: {
      skills: skills.length,
      collections: collections.length,
      loadable: skills.filter((s) => s.loadable).length,
      native: skills.filter((s) => s.native).length,
    },
    collections,
    skills,
  };
}

function detectLanguage(topEntries) {
  const names = new Set(topEntries.map((e) => e.name));
  if (names.has("foundry.toml") || names.has("foundry.yaml")) return "foundry";
  for (const n of names) if (/^hardhat\.config\.(js|ts|cjs|mjs)$/.test(n)) return "hardhat";
  if (names.has("Move.toml")) return "move";
  if (names.has("Scarb.toml")) return "cairo";
  if (names.has("Cargo.toml")) return "rust";
  if (names.has("package.json")) return "node";
  if (names.has("pytest.ini") || names.has("pyproject.toml")) return "python";
  return null;
}

async function countTree(dir, cfg) {
  const counts = { total: 0, sol: 0, rs: 0, move: 0, cairo: 0, ts: 0, js: 0, py: 0, go: 0 };
  let stack = [[dir, 1]];
  while (stack.length && counts.total < cfg.scanMaxEntries) {
    const [cur, depth] = stack.pop();
    if (depth > cfg.scanMaxDepth) continue;
    const entries = await listDir(cur);
    if (!entries) continue;
    for (const e of entries) {
      if (counts.total >= cfg.scanMaxEntries) break;
      if (e.isDirectory()) {
        if (SKIP_DIRS.has(e.name)) continue;
        stack.push([path.join(cur, e.name), depth + 1]);
      } else {
        counts.total++;
        const ext = path.extname(e.name).toLowerCase();
        if (ext === ".sol") counts.sol++;
        else if (ext === ".rs") counts.rs++;
        else if (ext === ".move") counts.move++;
        else if (ext === ".cairo") counts.cairo++;
        else if (ext === ".ts") counts.ts++;
        else if (ext === ".js") counts.js++;
        else if (ext === ".py") counts.py++;
        else if (ext === ".go") counts.go++;
      }
    }
  }
  return counts;
}

async function readBranch(dir) {
  try {
    const head = (await readFile(path.join(dir, ".git", "HEAD"), "utf8")).trim();
    if (head.startsWith("ref: refs/heads/")) return head.slice("ref: refs/heads/".length);
    if (head.length >= 40) return "detached:" + head.slice(0, 8);
    return head.slice(0, 24) || null;
  } catch (e) { return null; }
}

async function scanOneProtocol(root, name, cfg) {
  const dir = path.join(root, name);
  const top = (await listDir(dir)) ?? [];
  let language = detectLanguage(top);
  const counts = await countTree(dir, cfg);
  if (!language) {
    if (counts.cairo > 0) language = "cairo";
    else if (counts.move > 0) language = "move";
    else if (counts.sol > 0) language = "solidity";
    else if (counts.rs > 0) language = "rust";
    else if (counts.go > 0) language = "go";
    else if (counts.py > 0) language = "python";
    else if (counts.ts + counts.js > 0) language = "node";
  }
  let lastModified = null;
  try { lastModified = (await stat(dir)).mtime.toISOString(); } catch (e) {}
  const names = new Set(top.map((e) => e.name));
  const testProbe = ["test", "tests", "fuzz"];
  let hasTests = testProbe.some((n) => names.has(n));
  if (!hasTests) {
    // one cheap second-level probe for repos that keep tests under src/ or contracts/
    for (const parent of ["src", "contracts", "app", "crate", "packages"]) {
      if (!names.has(parent)) continue;
      try {
        const sub = await readdir(path.join(dir, parent), { withFileTypes: true });
        if (sub.some((e) => e.isDirectory() && testProbe.includes(e.name))) { hasTests = true; break; }
      } catch (e) {}
    }
  }
  return {
    name,
    language: language ?? "unknown",
    files: counts.total,
    sol: counts.sol,
    rs: counts.rs,
    move: counts.move,
    cairo: counts.cairo,
    ts: counts.ts,
    js: counts.js,
    py: counts.py,
    go: counts.go,
    hasTests,
    branch: await readBranch(dir),
    lastModified,
  };
}

async function collectProtocols(cfg) {
  const root = cfg.protocolsDir;
  const entries = await listDir(root);
  if (!entries) return { ok: false, error: "no PROTOCOLS directory at the configured root", protocols: [] };
  const names = entries.filter((e) => e.isDirectory() && !e.name.startsWith(".")).map((e) => e.name);
  const protocols = [];
  const queue = [...names];
  const workers = Array.from({ length: 4 }, async () => {
    while (queue.length) {
      const n = queue.shift();
      if (!n) continue;
      try { protocols.push(await scanOneProtocol(root, n, cfg)); }
      catch (e) { protocols.push({ name: n, language: "unknown", error: "scan failed" }); }
    }
  });
  await Promise.all(workers);
  protocols.sort((a, b) => a.name.localeCompare(b.name));
  return {
    ok: true,
    generatedAt: new Date().toISOString(),
    counts: { protocols: protocols.length, withTests: protocols.filter((p) => p.hasTests).length },
    protocols,
  };
}

// ---------------------------------------------------------------------------
// Service
// ---------------------------------------------------------------------------
function makeServiceClass(Base) {
  return class SkillRunnerService extends Base {
    constructor(ctx, cfg) {
      super(ctx, "skillRunner", { namespace: "skillRunner" });
      this.cfg = cfg;
      this.cache = new Map();
      this.lastErrors = [];
    }

    _cfgResolved() {
      return {
        ...this.cfg,
        skillsDir: this.cfg.skillsDir ?? path.join(this.cfg.workspaceRoot, "SKILLS"),
        protocolsDir: this.cfg.protocolsDir ?? path.join(this.cfg.workspaceRoot, "PROTOCOLS"),
        projectSkillsDir: this.cfg.projectSkillsDir ?? path.join(this.cfg.workspaceRoot, ".dsh", "skills"),
      };
    }

    async _cached(key, producer) {
      const hit = this.cache.get(key);
      if (hit && Date.now() - hit.at < this.cfg.catalogTtlMs) return hit.value;
      let value;
      try { value = await producer(); }
      catch (e) {
        value = { ok: false, error: String((e && e.message) || e) };
      }
      this.cache.set(key, { at: Date.now(), value });
      if (value && value.ok === false) this.lastErrors.push(key + ": " + value.error);
      return value;
    }

    async catalog() { return this._cached("catalog", () => collectCatalog(this._cfgResolved())); }
    async protocols() { return this._cached("protocols", () => collectProtocols(this._cfgResolved())); }

    async refresh() {
      this.cache.clear();
      const [catalog, protocols] = await Promise.all([this.catalog(), this.protocols()]);
      return { ok: true, refreshedAt: new Date().toISOString(), catalog, protocols };
    }

    async meta() {
      const cfg = this._cfgResolved();
      const ages = {};
      for (const k of ["catalog", "protocols"]) {
        const c = this.cache.get(k);
        ages[k] = c ? Math.round((Date.now() - c.at) / 1000) + "s" : "cold";
      }
      return {
        plugin: "khomdev-skill-runner",
        version: VERSION,
        serviceBase: serviceBaseSource,
        config: {
          workspaceRoot: cfg.workspaceRoot,
          skillsDir: cfg.skillsDir,
          protocolsDir: cfg.protocolsDir,
          projectSkillsDir: cfg.projectSkillsDir,
          catalogTtlMs: this.cfg.catalogTtlMs,
        },
        cacheAges: ages,
        lastErrors: this.lastErrors.slice(-10),
        authority: "read-only catalog + prompt composer; skills are tier-8 advisory; the only mutation is the operator's explicit send",
      };
    }
  };
}

// ---------------------------------------------------------------------------
// Remote-method markers.
//
// The Typert Gateway's source-mode discovery resolves endpoint
// "skillRunner/<method>" only for methods carried on the service prototype's
// version-1 Remote-method descriptor — what the shipped @Remote decorator
// writes at build time. Hand-authored classes attach the identical descriptor
// directly; without it the gateway reports no claims for the namespace, the
// client-side $mount never becomes ready, and the panel shows
// "skillRunner remote namespace unavailable" (the v0.1.0 failure).
// ---------------------------------------------------------------------------
const REMOTE_METHOD_DESCRIPTOR = "@deepseek-ai/dsh-typert-protocol/remote-methods";

function markRemoteMethods(ServiceClass, methods) {
  Object.defineProperty(ServiceClass.prototype, REMOTE_METHOD_DESCRIPTOR, {
    configurable: true,
    value: Object.freeze({
      version: 1,
      methods: Object.freeze(
        methods.map((m) => Object.freeze({ method: m, invocation: Object.freeze({ kind: "direct" }) })),
      ),
    }),
  });
  return ServiceClass;
}

// ---------------------------------------------------------------------------
// Plugin entry — SYNCHRONOUS (service effect registration must land inside
// Cordis's effect-collection window).
// ---------------------------------------------------------------------------
export function apply(ctx, config = {}) {
  const cfg = { ...DEFAULT_CONFIG, ...(config || {}) };
  const Base = resolveServiceBaseSync(cfg);
  const ServiceClass = markRemoteMethods(makeServiceClass(Base), [
    "catalog",
    "protocols",
    "refresh",
    "meta",
  ]);
  const service = new ServiceClass(ctx, cfg);
  ctx.logger?.info?.("skill-runner: host plugin loaded (base=" + serviceBaseSource + ")");
  // CRITICAL: return nothing. Cordis validates a plugin's return value
  // (function disposer | null/undefined | promise of those | iterator);
  // returning the service object is the "Invalid effect" failure class — the
  // fiber start fails and the host plugin never registers (the v0.1.0/v0.1.1
  // live failure behind "skillRunner remote namespace unavailable"). The
  // service is reachable as ctx.skillRunner through its base constructor.
}

export const __internals = {
  VERSION, DEFAULT_CONFIG, COLLECTIONS, STANDALONE, SESSION_EXTRA,
  resolveServiceBaseSync, makeServiceClass, parseFrontmatter,
  collectCatalog, collectProtocols, detectLanguage,
};
