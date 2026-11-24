import assert from "node:assert/strict";
import { test } from "node:test";
import { svg, wrap } from "./og.ts";

test("wrap keeps to the line limit and marks cut text", () => {
  const lines = wrap("A Practical Guide to Writing a Software Technical Design Document", 64, 640, 2);
  assert.equal(lines.length, 2);
  assert.ok(lines[1].endsWith("…"));
  assert.deepEqual(wrap("Short name", 64, 640, 2), ["Short name"]);
});

test("share image escapes deal text", () => {
  const out = svg({ id: "x", name: "R&D <Tools>", headline: "50% off", category: "Productivity", discount: 50, codes: [] });
  assert.ok(out.includes("R&amp;D &lt;Tools&gt;"));
  assert.ok(!out.includes("<Tools>"));
});
