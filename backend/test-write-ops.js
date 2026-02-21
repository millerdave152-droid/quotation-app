const http = require("http");

const TOKEN = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJ1c2VySWQiOjEsImVtYWlsIjoiYWRtaW5AeW91cmNvbXBhbnkuY29tIiwicm9sZSI6ImFkbWluIiwidHlwZSI6ImFjY2VzcyIsImlhdCI6MTc3MTM2MTA2MywiZXhwIjoxNzcxMzYyODYzLCJhdWQiOiJxdW90YXRpb24tYXBwLWNsaWVudCIsImlzcyI6InF1b3RhdGlvbi1hcHAifQ.2hFeA5BkrH0Sh2WcpP2ETnSoTurFXXmLEk06Odz6joU";
const HOST = "localhost";
const PORT = 3001;
const results = [];
const rand = Math.floor(Math.random() * 100000);

function request(method, path, body) {
  return new Promise((resolve, reject) => {
    const data = JSON.stringify(body);
    const opts = {
      hostname: HOST, port: PORT, path: path, method: method,
      headers: {
        "Content-Type": "application/json",
        "Authorization": "Bearer " + TOKEN,
        "Content-Length": Buffer.byteLength(data)
      }
    };
    const req = http.request(opts, (res) => {
      let chunks = [];
      res.on("data", (c) => chunks.push(c));
      res.on("end", () => {
        resolve({ status: res.statusCode, body: Buffer.concat(chunks).toString() });
      });
    });
    req.on("error", reject);
    req.write(data);
    req.end();
  });
}

function log(method, url, status, body, label) {
  const pass = status >= 200 && status < 300;
  const snippet = body.substring(0, 200);
  const tag = pass ? "PASS" : "FAIL";
  results.push({ label, pass, status });
  console.log("");
  console.log("[" + tag + "] " + label);
  console.log("  " + method + " " + url + " => " + status);
  console.log("  Body: " + snippet);
}

async function run() {
  let createdQuoteId, createdCustomerId, createdTaskId;

  // 1. POST /api/quotes
  try {
    const r = await request("POST", "/api/quotes", {
      customer_id: 1, items: [{ product_id: 1, quantity: 1, unit_price: 100 }]
    });
    log("POST", "/api/quotes", r.status, r.body, "1. Create Quote");
    try { const d = JSON.parse(r.body); createdQuoteId = d.data?.id || d.data?.quote_id || d.id; } catch(e) {}
  } catch (e) {
    console.log("[FAIL] 1. Create Quote - Error: " + e.message);
    results.push({ label: "1. Create Quote", pass: false });
  }

  // 2. PUT /api/quotes/:id
  if (createdQuoteId) {
    try {
      const r = await request("PUT", "/api/quotes/" + createdQuoteId, { notes: "Updated by test script" });
      log("PUT", "/api/quotes/" + createdQuoteId, r.status, r.body, "2. Update Quote");
    } catch (e) {
      console.log("[FAIL] 2. Update Quote - Error: " + e.message);
      results.push({ label: "2. Update Quote", pass: false });
    }
  } else {
    console.log(""); console.log("[SKIP] 2. Update Quote - no quote ID from step 1");
    results.push({ label: "2. Update Quote", pass: false });
  }

  // 3. POST /api/customers
  try {
    const r = await request("POST", "/api/customers", {
      name: "Test Customer " + rand, email: "testcust" + rand + "@example.com", phone: "555-0100"
    });
    log("POST", "/api/customers", r.status, r.body, "3. Create Customer");
    try { const d = JSON.parse(r.body); createdCustomerId = d.data?.id || d.data?.customer_id || d.id; } catch(e) {}
  } catch (e) {
    console.log("[FAIL] 3. Create Customer - Error: " + e.message);
    results.push({ label: "3. Create Customer", pass: false });
  }

  // 4. PUT /api/customers/:id
  if (createdCustomerId) {
    try {
      const r = await request("PUT", "/api/customers/" + createdCustomerId, {
        name: "Updated Test Customer " + rand, phone: "555-0199"
      });
      log("PUT", "/api/customers/" + createdCustomerId, r.status, r.body, "4. Update Customer");
    } catch (e) {
      console.log("[FAIL] 4. Update Customer - Error: " + e.message);
      results.push({ label: "4. Update Customer", pass: false });
    }
  } else {
    console.log(""); console.log("[SKIP] 4. Update Customer - no customer ID from step 3");
    results.push({ label: "4. Update Customer", pass: false });
  }

  // 5. POST /api/tasks
  try {
    const r = await request("POST", "/api/tasks", {
      title: "Test Task " + rand, description: "Automated test task", due_date: "2026-03-01", priority: "normal", task_type: "follow_up"
    });
    log("POST", "/api/tasks", r.status, r.body, "5. Create Task");
    try { const d = JSON.parse(r.body); createdTaskId = d.data?.id || d.data?.task_id || d.id; } catch(e) {}
  } catch (e) {
    console.log("[FAIL] 5. Create Task - Error: " + e.message);
    results.push({ label: "5. Create Task", pass: false });
  }

  // 6. PUT /api/tasks/:id
  if (createdTaskId) {
    try {
      const r = await request("PUT", "/api/tasks/" + createdTaskId, { title: "Updated Task " + rand, priority: "high" });
      log("PUT", "/api/tasks/" + createdTaskId, r.status, r.body, "6. Update Task");
    } catch (e) {
      console.log("[FAIL] 6. Update Task - Error: " + e.message);
      results.push({ label: "6. Update Task", pass: false });
    }
  } else {
    console.log(""); console.log("[SKIP] 6. Update Task - no task ID from step 5");
    results.push({ label: "6. Update Task", pass: false });
  }

  // 7. POST /api/leads
  try {
    const r = await request("POST", "/api/leads", {
      contact_name: "Lead Person " + rand, contact_email: "lead" + rand + "@example.com", lead_source: "website", priority: "warm"
    });
    log("POST", "/api/leads", r.status, r.body, "7. Create Lead");
  } catch (e) {
    console.log("[FAIL] 7. Create Lead - Error: " + e.message);
    results.push({ label: "7. Create Lead", pass: false });
  }

  // 8. POST /api/products
  try {
    const r = await request("POST", "/api/products", {
      model: "TST-" + rand, name: "Test Product " + rand, category: "Accessories", cost_cents: 2500, msrp_cents: 4999
    });
    log("POST", "/api/products", r.status, r.body, "8. Create Product");
  } catch (e) {
    console.log("[FAIL] 8. Create Product - Error: " + e.message);
    results.push({ label: "8. Create Product", pass: false });
  }

  // Summary
  const passed = results.filter(r => r.pass).length;
  const failed = results.filter(r => !r.pass).length;
  console.log("");
  console.log("============================================================");
  console.log("SUMMARY: " + passed + " PASSED, " + failed + " FAILED out of " + results.length + " tests");
  console.log("============================================================");
  results.forEach(r => {
    console.log("  " + (r.pass ? "PASS" : "FAIL") + " - " + r.label + (r.status ? " (HTTP " + r.status + ")" : ""));
  });
}

run().catch(e => console.error("Fatal:", e));
