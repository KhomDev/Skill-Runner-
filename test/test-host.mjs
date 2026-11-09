import assert from "node:assert/strict";
import { apply, __internals } from "../lib/index.js";

const FIX = new URL("./fixtures", import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, "$1");

// --- frontmatter parser ---
const fm = __internals.parseFrontmatter("---\nname: quoted-skill\ndescription: \"A quoted description.\"\nallowed-tools: Read Grep\n---\n# body");
assert.equal(fm.name, "quoted-skill");
assert.equal(fm.description, "A quoted description.");
assert.equal(fm.allowedTools, "Read Grep");
assert.equal(fm.dshAdapted, false);

const fmFolded = __internals.parseFrontmatter("---\nname: folded\ndescription: >\n  A folded description\n  across lines.\ndsh-adapted: true\n---\n");
assert.equal(fmFolded.description, "A folded description across lines.");
assert.equal(fmFolded.dshAdapted, true);

// --- service ---
const ctx = { set(k, v) { this[k] = v; }, reflect: {}, logger: { info() {}, warn() {} } };
const svc = apply(ctx, { workspaceRoot: FIX, catalogTtlMs: 60000 });
assert.equal(ctx.skillRunner, svc, "service registered under ctx.skillRunner");

const cat = await svc.catalog();
assert.equal(cat.ok, true);
const fizz = cat.skills.find((s) => s.name === "fizz");
assert.equal(fizz.loadable, true);
assert.equal(fizz.collection, "pashov");
assert.equal(fizz.essential, true);
assert.ok(fizz.sourcePath === "SKILLS/skills-pashov/fizz/SKILL.md");
const w3 = cat.skills.find((s) => s.name === "web3-bug-classes");
assert.equal(w3.native, true, "dsh-adapted copy flagged native");
const standalone = cat.skills.find((s) => s.name === "standalone-skill");
assert.equal(standalone.loadable, false);
assert.equal(standalone.collection, "standalone");
assert.equal(standalone.allowed === undefined, true);

const pashovColl = cat.collections.find((c) => c.id === "pashov");
assert.equal(pashovColl.essential, true);
assert.equal(pashovColl.count, 1);
const noHostPaths = JSON.stringify([cat.skills, cat.collections]);
assert.ok(!noHostPaths.includes("\\\\Users"), "no host paths in catalog payloads");

const protos = await svc.protocols();
assert.equal(protos.ok, true);
const evm = protos.protocols.find((p) => p.name === "demo-evm");
assert.equal(evm.language, "foundry");
assert.equal(evm.sol, 2);
assert.equal(evm.hasTests, true);
const rs = protos.protocols.find((p) => p.name === "demo-rs");
assert.equal(rs.language, "rust");
assert.equal(rs.rs, 1);

const meta = await svc.meta();
assert.equal(meta.plugin, "khomdev-skill-runner");
assert.equal(meta.config.workspaceRoot, FIX);
const r = await svc.refresh();
assert.equal(r.ok, true);
console.log("test-host: all assertions passed (base=" + meta.serviceBase + ")");
