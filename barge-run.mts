import fs from "fs";
import { createRequire } from "module";
const require = createRequire(process.cwd() + "/package.json");
const jwt = require("jsonwebtoken");
import { parseMarineOrderCsv } from "./src/lib/marine-order-csv.ts";

const envText = fs.readFileSync(".env.local", "utf8");
const env = {};
for (const line of envText.split(/\r?\n/)) {
  const m = line.match(/^([A-Z0-9_]+)=(.*)$/);
  if (m) env[m[1]] = m[2].replace(/^"|"$/g, "");
}
const host = new URL(env.NEXT_PUBLIC_SUPABASE_URL).host;
if (!host.startsWith("hvktzvklpcttqhvqpvml")) {
  console.log("WRONG_PROJECT", host);
  process.exit(2);
}
const text = fs.readFileSync("C:/Users/Deepa/AppData/Local/Temp/sinclair-marine-order-utf8.csv", "utf8");
const parsed = parseMarineOrderCsv(text);
console.log("LOCAL", JSON.stringify({ products: parsed.products.length, skipped: parsed.skippedBanners }));
const token = jwt.sign({
  sub: "barge-replace",
  username: "owner",
  role: "owner",
  display_name: "Barge replace",
  permissions: [],
}, env.ADMIN_SECRET_KEY, { expiresIn: "1h" });
const body = JSON.stringify({ mode: "preview_barge", products: parsed.products });
const res = await fetch("https://graftontowboatservices.com/api/products", {
  method: "POST",
  headers: { "Content-Type": "application/json", Authorization: "Bearer " + token },
  body,
});
const data = await res.json();
console.log("PREVIEW_STATUS", res.status);
if (!res.ok) {
  console.log("PREVIEW_ERROR", JSON.stringify(data).slice(0, 500));
  process.exit(1);
}
console.log("PREVIEW", JSON.stringify(data.summary));
for (const g of data.shared_barcodes || []) {
  console.log("FLAG", g.upc, (g.items || []).map(i => i.description + " [" + (i.pkg_size || "") + "]").join(" || "));
}
fs.writeFileSync("C:/Users/Deepa/AppData/Local/Temp/barge-preview.json", JSON.stringify({ summary: data.summary, flags: data.shared_barcodes }));
