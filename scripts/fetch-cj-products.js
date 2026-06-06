import fs from "fs";

const email = process.env.CJ_EMAIL;
const apiKey = process.env.CJ_API_KEY;

if (!email || !apiKey) {
  console.log("CJ_EMAIL/CJ_API_KEY missing. Keeping existing products.json if present.");
  if (!fs.existsSync("products.json")) fs.writeFileSync("products.json", "[]");
  process.exit(0);
}

console.log("IMPORTANT: Replace this placeholder with your existing working CJ fetcher if your repo already has one.");
if (!fs.existsSync("products.json")) fs.writeFileSync("products.json", "[]");
