import assert from "node:assert/strict";

let captured = null;
globalThis.window = { __ModuleLoader__: { load(mod) { captured = mod; } } };
await import("../lib/client.js");
assert.ok(captured && captured.id === "khomdev-skill-runner", "bundle registered with the loader");

const reactStub = {
  createElement: () => null,
  useState: () => [null, () => {}],
  useEffect: () => {},
  useMemo: (f) => f(),
  useCallback: (f) => f,
  useSyncExternalStore: () => ({ byId: {} }),
};
const mod = captured.factory((name) => {
  if (name === "react") return reactStub;
  throw new Error("unexpected require: " + name);
});
assert.equal(typeof mod.apply, "function");
assert.deepEqual(mod.inject, ["slots", "locale", "remote", "sessions"]);

const { buildPrompt } = mod.__test;
const prompt = buildPrompt({
  protocol: "demo-evm",
  protocolLanguage: "foundry",
  mode: "subagents",
  focus: "oracle staleness",
  skills: [
    { name: "fizz", description: "Fuzz suites.", sourcePath: "SKILLS/skills-pashov/fizz/SKILL.md", loadable: true },
    { name: "legacy", description: "Legacy skill.", sourcePath: "SKILLS/old/SKILL.md", loadable: false },
  ],
});
for (const needle of [
  "PROTOCOLS/demo-evm",
  'name "fizz"',
  "NOT in this session catalog",
  "parallel subagent lanes",
  "Operator focus:",
  "oracle staleness",
  "poc_proposal_execution",
  "tier 8",
  "engagements/",
]) assert.ok(prompt.includes(needle), "prompt must contain: " + needle);
assert.ok(!prompt.includes("C:\\Users"), "no host-absolute paths in the prompt");

const p2 = buildPrompt({ protocol: "x", skills: [], mode: "advisory", focus: "" });
assert.ok(p2.includes("single-pass (this session)"));
assert.ok(p2.includes("— none —"));
assert.ok(p2.includes("— none selected —") || p2.includes("none selected"));

// apply() against a mock client context
const injected = [];
const mockCtx = {
  remote: { $mount: async () => () => {} },
  slots: { inject(name, fn) { injected.push(name); assert.equal(typeof fn, "function"); } },
  locale: {}, sessions: {}, on() {}, logger: { warn() {} },
};
mod.apply(mockCtx);
assert.deepEqual(injected, ["sidebar.panellist", "main"]);
console.log("test-client: all assertions passed");
