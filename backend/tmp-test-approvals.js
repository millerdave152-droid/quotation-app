const http = require("http");
const BASE = "http://localhost:3001";
function req(method, path, body, token) {
  return new Promise((resolve, reject) => {
    const url = new URL(path, BASE);
    const opts = { hostname: url.hostname, port: url.port, path: url.pathname, method, headers: { "Content-Type": "application/json" } };
    if (token) opts.headers["Authorization"] = "Bearer " + token;
    const r = http.request(opts, (res) => { let d = ""; res.on("data", c => d += c); res.on("end", () => resolve({ status: res.statusCode, body: d })); });
    r.on("error", reject); r.setTimeout(10000, () => r.destroy(new Error("Timeout")));
    if (body) r.write(JSON.stringify(body)); r.end();
  });
}
async function main() {
  console.log("=".repeat(80));
  console.log("APPROVAL & DISCOUNT ESCALATION ROUTE TESTS");
  console.log("=".repeat(80));
  console.log("");
  console.log("[LOGIN] POST /api/auth/login ...");
  let token;
  try {
    const lr = await req("POST", "/api/auth/login", { email: "admin@yourcompany.com", password: "TestPass123!" });
    if (lr.status !== 200) { console.log("FATAL: Login failed status " + lr.status); console.log(lr.body.substring(0,300)); process.exit(1); }
    const ld = JSON.parse(lr.body);
    token = ld.data?.accessToken || ld.accessToken || ld.token;
    if (!token) { console.log("FATAL: No token"); console.log(lr.body.substring(0,300)); process.exit(1); }
    console.log("[LOGIN] SUCCESS - token: " + token.substring(0,20) + "...");
  } catch (e) { console.log("FATAL: " + e.message); process.exit(1); }
  console.log("");
  const tests = [
    { m: "GET", p: "/api/approvals/pending", d: "List pending quote approvals" },
    { m: "GET", p: "/api/pos-approvals/pending", d: "POS pending override approvals" },
    { m: "GET", p: "/api/pos-approvals/analytics", d: "POS approval analytics" },
    { m: "GET", p: "/api/pos-approvals/settings/tiers", d: "POS approval tier settings" },
    { m: "GET", p: "/api/pos-approvals/audit-log", d: "POS approval audit log" },
    { m: "GET", p: "/api/manager-overrides/thresholds", d: "Override thresholds list" },
    { m: "GET", p: "/api/manager-overrides/thresholds/config", d: "Override threshold config" },
    { m: "GET", p: "/api/manager-overrides/requests/pending", d: "Pending override requests" },
    { m: "GET", p: "/api/manager-overrides/history", d: "Override history" },
    { m: "GET", p: "/api/manager-overrides/summary", d: "Override summary" },
    { m: "GET", p: "/api/discount-authority/my-tier", d: "My discount authority tier" },
    { m: "GET", p: "/api/discount-authority/tiers", d: "All discount authority tiers" },
    { m: "GET", p: "/api/discount-escalations/mine", d: "My escalations" },
    { m: "GET", p: "/api/discount-escalations/pending", d: "Pending escalations" },
    { m: "POST", p: "/api/discount-escalations", b: { productId: 1, discountPct: 15, reason: "test escalation" }, d: "Submit discount escalation" },
    { m: "POST", p: "/api/pos-approvals/request", b: { productId: 1, requestedPrice: 50, reason: "test override" }, d: "Request POS price override" },
    { m: "GET", p: "/api/admin/approval-rules", d: "Admin approval rules list" },
    { m: "GET", p: "/api/admin/approval-rules/effective", d: "Effective approval rules" },
    { m: "GET", p: "/api/approval-queue", d: "User-requested: approval-queue" },
    { m: "GET", p: "/api/approval-queue/stats", d: "User-requested: approval-queue stats" },
    { m: "GET", p: "/api/escalation/config", d: "User-requested: escalation config" },
    { m: "GET", p: "/api/escalation/history", d: "User-requested: escalation history" },
    { m: "POST", p: "/api/price-overrides/request", b: { product_id: 1, requested_price: 50, reason: "test" }, d: "User-requested: price-overrides request" },
    { m: "GET", p: "/api/price-overrides/pending", d: "User-requested: price-overrides pending" },
    { m: "GET", p: "/api/price-overrides/history", d: "User-requested: price-overrides history" },
  ];
  let pass = 0, fail = 0;
  const results = [];
  for (const t of tests) {
    const label = t.m + " " + t.p;
    try {
      const r = await req(t.m, t.p, t.b || null, token);
      const ok = r.status >= 200 && r.status < 300;
      const s = ok ? "PASS" : "FAIL";
      if (ok) pass++; else fail++;
      console.log("[" + s + "] " + label);
      console.log("       Desc:   " + t.d);
      console.log("       Status: " + r.status);
      console.log("       Body:   " + r.body.substring(0, 200));
      console.log("");
      results.push({ test: label, d: t.d, st: r.status, res: s });
    } catch (e) {
      fail++;
      console.log("[FAIL] " + label);
      console.log("       Desc:   " + t.d);
      console.log("       Error:  " + e.message);
      console.log("");
      results.push({ test: label, d: t.d, st: "ERR", res: "FAIL" });
    }
  }
  console.log("=".repeat(80));
  console.log("SUMMARY: " + pass + " PASS / " + fail + " FAIL / " + (pass + fail) + " TOTAL");
  console.log("=".repeat(80));
  console.log("");
  console.log("No. | Result | Status | Method & Path");
  console.log("-".repeat(80));
  results.forEach((r, i) => {
    console.log(String(i+1).padStart(3) + " | " + r.res.padEnd(6) + " | " + String(r.st).padEnd(6) + " | " + r.test);
  });
  console.log("");
  console.log("DONE.");
}
main().catch(e => { console.error("Unhandled:", e); process.exit(1); });