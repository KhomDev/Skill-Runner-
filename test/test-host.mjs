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

// The closer is a full line of dashes: a "----" rule (or a "---note" line)
// inside the frontmatter must not terminate it early.
const fmRule = __internals.parseFrontmatter("---\nname: ruled\ndescription: x\n----\nallowed-tools: Read Grep\n---note\n---\n");
assert.equal(fmRule.name, "ruled");
assert.equal(fmRule.allowedTools, "Read Grep", "keys after an interior dash rule survive");

// --- service ---
const ctx = { set(k, v) { this[k] = v; }, reflect: {}, logger: { info() {}, warn() {} } };
apply(ctx, { workspaceRoot: FIX, catalogTtlMs: 60000 });
const svc = ctx.skillRunner;
assert.ok(svc, "apply() registers the service under ctx.skillRunner and returns nothing (Cordis Invalid-effect rule)");

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
// v0.1.1: the Typert Gateway only resolves endpoints carried on the service
// prototype's version-1 Remote-method descriptor (what @Remote writes).
const RMD = "@deepseek-ai/dsh-typert-protocol/remote-methods";
const svcProto = Object.getPrototypeOf(svc);
assert.ok(Object.prototype.hasOwnProperty.call(svcProto, RMD), "service carries the Remote-method descriptor");
assert.equal(svcProto[RMD].version, 1);
assert.deepEqual(svcProto[RMD].methods.map((m) => m.method).sort(), ["catalog", "meta", "protocols", "refresh"]);
for (const marker of svcProto[RMD].methods) {
  assert.equal(marker.invocation.kind, "direct");
  assert.ok(Object.isFrozen(marker), "marker frozen");
}

// In-flight dedup: two concurrent catalog() calls on a cold cache must share
// one production (same result object identity), not re-scan the tree twice.
{
  const ctx2 = { set(k, v) { this[k] = v; }, reflect: {}, logger: { info() {}, warn() {} } };
  apply(ctx2, { workspaceRoot: FIX, catalogTtlMs: 60000 });
  const svc2 = ctx2.skillRunner;
  const [a, b] = await Promise.all([svc2.catalog(), svc2.catalog()]);
  assert.equal(a, b, "concurrent catalog() calls join the same in-flight scan");
  assert.equal(a.ok, true);
}
console.log("test-host: all assertions passed (base=" + meta.serviceBase + ")");
