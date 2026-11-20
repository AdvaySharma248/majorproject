import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
const __dirname = path.dirname(fileURLToPath(import.meta.url));
import vm from "node:vm";
import ts from "typescript";
const source = fs.readFileSync(path.join(__dirname, "../src/lib/placepro/routing.ts"), "utf8");
const code = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS } }).outputText;
const context = { exports: {}, URLSearchParams };
vm.runInNewContext(code, context);
const { routeHref, resolveRoute, canVisit, bindNavigation, pushNavigation } = context.exports;

test("role routes and query parameters round-trip without losing page state", () => {
  const params = { page: "3", q: "A & B", batch: "2026 CSE", studentId: "12" };
  const url = new URL(routeHref("trainer", "students", params), "http://localhost");
  assert.equal(url.pathname, "/trainer/students");
  const resolved = resolveRoute(url.pathname, "trainer", Object.fromEntries(url.searchParams));
  assert.equal(resolved.page, "students");
  assert.deepEqual(resolved.params, params);
});
test("unknown and cross-role paths never resolve to a portal screen", () => {
  for (const url of ["/admin/users", "/student/my-profile", "/trainer/users", "/trainer/unknown", "/trainer/students/extra"])
    assert.equal(resolveRoute(url, "trainer", {}), null);
  assert.equal(canVisit("admin", "skills"), true);
  assert.equal(canVisit("student", "skills"), false);
  assert.equal(canVisit("trainer", "student-profile"), true);
});
test("legacy action navigation delegates each page change to the framework router", () => {
  const pushed = [];
  bindNavigation(href => pushed.push(href));
  pushNavigation(routeHref("trainer", "students"));
  pushNavigation(routeHref("trainer", "assessments"));
  assert.deepEqual(pushed, ["/trainer/students", "/trainer/assessments"]);
});
