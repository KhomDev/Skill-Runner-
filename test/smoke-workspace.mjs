// Real-workspace smoke check for khomdev-skill-runner.
// Usage: node test/smoke-workspace.mjs [workspaceRoot]
import { apply } from "../lib/index.js";

const workspaceRoot = process.argv[2] ?? "C:\\Users\\d3fal\\Desktop\\hustle\\BOUNTY\\audit";
const ctx = { set(k, v) { this[k] = v; }, reflect: {}, logger: { info() {}, warn() {} } };
const svc = apply(ctx, { workspaceRoot });

const t0 = Date.now();
const cat = await svc.catalog();
const t1 = Date.now();
const protos = await svc.protocols();
const t2 = Date.now();
const meta = await svc.meta();

console.log("catalog   : ok=" + cat.ok + " · " + cat.counts.skills + " skills · " + cat.counts.loadable + " loadable · " + cat.counts.native + " DSH-native · " + cat.counts.collections + " collections · " + (t1 - t0) + " ms");
console.log("collections: " + cat.collections.map((c) => (c.essential ? "*" : "") + c.label + "=" + c.count).join(", "));
const sample = cat.skills.filter((s) => s.essential).slice(0, 6).map((s) => s.name + (s.loadable ? "✓" : "✗") + (s.native ? "⚡" : ""));
console.log("essential sample: " + sample.join("  "));
const noNative = cat.skills.filter((s) => s.loadable && !s.native).map((s) => s.name);
console.log("loadable but not yet DSH-native (" + noNative.length + "): " + noNative.join(", "));

console.log("protocols : ok=" + protos.ok + " · " + protos.counts.protocols + " targets · " + protos.counts.withTests + " with tests · " + (t2 - t1) + " ms");
const langs = {};
for (const p of protos.protocols) langs[p.language] = (langs[p.language] ?? 0) + 1;
console.log("languages : " + Object.entries(langs).map(([k, v]) => k + "=" + v).join(", "));
console.log("sample    : " + protos.protocols.slice(0, 5).map((p) => p.name + "[" + p.language + "," + p.files + "f" + (p.hasTests ? ",t" : "") + "]").join("  "));
console.log("base      : " + meta.serviceBase);
const json = JSON.stringify([cat.skills, protos.protocols]);
console.log("host-path leak check: " + (json.includes("\\\\Users") ? "FAIL" : "clean"));
