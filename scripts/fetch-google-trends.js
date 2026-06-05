import fs from "fs";
import fetch from "node-fetch";

const SERPAPI_KEY = process.env.SERPAPI_KEY;
const GEO = process.env.GOOGLE_TRENDS_GEO || "US";
const DATE_RANGE = process.env.GOOGLE_TRENDS_DATE || "today 1-m";
const LIMIT = Number(process.env.GOOGLE_TRENDS_LIMIT || 120);
const MIN_TIMELINE_POINTS = Number(process.env.GOOGLE_TRENDS_MIN_POINTS || 3);
const STATIC_KEYWORDS = (process.env.TREND_KEYWORDS || "")
  .split(",")
  .map(s => cleanKeyword(s))
  .filter(Boolean);

if (!SERPAPI_KEY) {
  console.error("Missing SERPAPI_KEY secret.");
  process.exit(1);
}

const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));
const number = v => Number.isFinite(Number(v)) ? Number(v) : 0;

const STOP_WORDS = new Set([
  "the", "and", "for", "with", "from", "into", "this", "that", "your", "our",
  "new", "hot", "sale", "free", "shipping", "dropshipping", "product", "products",
  "fashion", "style", "trendy", "popular", "wholesale", "retail", "factory",
  "high", "quality", "good", "best", "latest", "2023", "2024", "2025", "2026",
  "men", "mens", "man", "women", "womens", "woman", "girls", "boys",
  "cross", "border", "foreign", "trade", "independent", "station", "amazon", "tiktok"
]);

const SYNONYMS = new Map([
  ["slippers", "slides"],
  ["sandal", "sandals"],
  ["sandals", "sandals"],
  ["blazer", "blazer"],
  ["blazers", "blazer"],
  ["dress", "dress"],
  ["dresses", "dress"],
  ["necklace", "necklace"],
  ["bracelet", "bracelet"],
  ["earring", "earrings"],
  ["watch", "watch"],
  ["watches", "watch"],
  ["coffee", "coffee"],
  ["table", "table"],
  ["storage", "storage"],
  ["organizer", "organizer"],
  ["makeup", "makeup"],
  ["skincare", "skin care"],
  ["roller", "roller"],
  ["comb", "comb"],
  ["straightener", "hair straightener"],
  ["bag", "bag"],
  ["bags", "bag"],
  ["pet", "pet"],
  ["dog", "dog"],
  ["cat", "cat"],
  ["led", "led"],
  ["lamp", "lamp"],
  ["phone", "phone"],
  ["car", "car"],
  ["baby", "baby"],
  ["fitness", "fitness"]
]);

function readProducts() {
  if (!fs.existsSync("products.json")) return [];
  try {
    const data = JSON.parse(fs.readFileSync("products.json", "utf-8"));
    return Array.isArray(data) ? data : (Array.isArray(data.products) ? data.products : []);
  } catch (err) {
    console.warn("Could not read products.json:", err.message);
    return [];
  }
}

function cleanText(text) {
  return String(text || "")
    .replace(/<[^>]+>/g, " ")
    .replace(/[\[\]"']/g, " ")
    .replace(/&amp;/g, " and ")
    .replace(/[^a-zA-Z0-9\s-]/g, " ")
    .replace(/\b\d{4,}\b/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function cleanKeyword(text) {
  const tokens = cleanText(text)
    .toLowerCase()
    .split(/\s+/)
    .map(w => SYNONYMS.get(w) || w)
    .join(" ")
    .split(/\s+/)
    .filter(w => w.length > 2 && !STOP_WORDS.has(w));

  const deduped = [];
  for (const t of tokens) {
    if (!deduped.includes(t)) deduped.push(t);
  }
  return deduped.slice(0, 4).join(" ").trim();
}

function productEnglishName(product) {
  return product?.raw?.productNameEn || product?.productNameEn || product?.title || product?.name || product?.productName || "";
}

function productCategory(product) {
  return product?.category || product?.categoryName || product?.raw?.categoryName || product?.raw?.productType || "";
}

function keywordCandidates(product) {
  const name = cleanKeyword(productEnglishName(product));
  const category = cleanKeyword(productCategory(product));
  const candidates = [];

  if (name) candidates.push(name);
  if (category) candidates.push(category);

  const nameWords = name.split(/\s+/).filter(Boolean);
  const catWords = category.split(/\s+/).filter(Boolean);

  if (nameWords.length >= 2) candidates.push(nameWords.slice(-2).join(" "));
  if (nameWords.length >= 3) candidates.push(nameWords.slice(-3).join(" "));
  if (catWords.length && nameWords.length) candidates.push([...nameWords.slice(0, 2), catWords[catWords.length - 1]].join(" "));
  if (catWords.length >= 2) candidates.push(catWords.slice(-2).join(" "));

  return candidates
    .map(cleanKeyword)
    .filter(k => k && k.split(/\s+/).length >= 2 && k.split(/\s+/).length <= 4);
}

function productWeight(product) {
  const listed = number(product.listedCount || product.listedNum || product.raw?.listedNum || product.raw?.listingCount);
  const margin = number(product.margin);
  const profit = number(product.profit);
  const hasImage = /^https?:\/\//i.test(product.image || product.raw?.productImage || "");
  return (Math.log10(listed + 1) * 10) + Math.min(25, margin / 2) + Math.min(20, Math.log10(profit + 1) * 8) + (hasImage ? 5 : 0);
}

function buildKeywords() {
  const products = readProducts();
  const scoreByKeyword = new Map();

  for (const kw of STATIC_KEYWORDS) scoreByKeyword.set(kw, 10000);

  const sortedProducts = [...products]
    .sort((a, b) => productWeight(b) - productWeight(a))
    .slice(0, Math.max(LIMIT * 10, 800));

  for (const product of sortedProducts) {
    const weight = productWeight(product);
    for (const kw of keywordCandidates(product)) {
      scoreByKeyword.set(kw, (scoreByKeyword.get(kw) || 0) + weight);
    }
  }

  const keywords = [...scoreByKeyword.entries()]
    .sort((a, b) => b[1] - a[1])
    .map(([keyword]) => keyword)
    .filter(k => k.length >= 5 && k.length <= 60)
    .slice(0, LIMIT);

  fs.writeFileSync("trend-keywords.json", JSON.stringify({
    updatedAt: new Date().toISOString(),
    source: "Derived from CJ product titles/categories plus optional TREND_KEYWORDS",
    limit: LIMIT,
    count: keywords.length,
    keywords
  }, null, 2));

  return keywords;
}

async function serpApi(params) {
  const url = new URL("https://serpapi.com/search.json");
  for (const [k, v] of Object.entries(params)) url.searchParams.set(k, v);
  url.searchParams.set("api_key", SERPAPI_KEY);

  const res = await fetch(url);
  const text = await res.text();
  let data;
  try { data = JSON.parse(text); } catch { data = { raw: text }; }

  if (!res.ok || data.error) {
    throw new Error(`SerpApi error ${res.status}: ${JSON.stringify(data).slice(0, 700)}`);
  }

  return data;
}

function avg(values) {
  const nums = values.map(number).filter(n => n >= 0);
  return nums.length ? nums.reduce((a, b) => a + b, 0) / nums.length : 0;
}

function extractTimelineValues(data) {
  const timeline = data?.interest_over_time?.timeline_data || data?.timeline_data || [];
  return timeline.map(row => {
    const v = row?.values?.[0];
    return number(v?.extracted_value ?? v?.value ?? row?.value);
  }).filter(n => Number.isFinite(n));
}

function parseTrend(keyword, data) {
  const values = extractTimelineValues(data);
  if (values.length < MIN_TIMELINE_POINTS || Math.max(...values) <= 0) return null;

  const half = Math.max(1, Math.floor(values.length / 2));
  const firstAvg = avg(values.slice(0, half));
  const lastAvg = avg(values.slice(half));
  const maxValue = Math.max(...values);
  const latestValue = values[values.length - 1];
  const growthPercent = firstAvg > 0 ? Math.round(((lastAvg - firstAvg) / firstAvg) * 100) : Math.round(lastAvg * 2);

  const positiveGrowth = Math.max(0, growthPercent);
  const growthScore = Math.max(0, Math.min(55, positiveGrowth * 0.45));
  const volumeScore = Math.max(0, Math.min(30, lastAvg * 0.35));
  const momentumScore = latestValue >= lastAvg ? 15 : 6;
  const googleTrendScore = Math.round(Math.max(1, Math.min(100, growthScore + volumeScore + momentumScore)));

  return {
    keyword,
    googleTrendScore,
    growthPercent,
    firstAvg: Math.round(firstAvg),
    lastAvg: Math.round(lastAvg),
    latestValue,
    maxValue,
    timelinePoints: values.length
  };
}

async function main() {
  const keywords = buildKeywords();
  const signals = [];
  const failed = [];
  const noData = [];

  console.log(`Built ${keywords.length} trend keywords from CJ products.`);

  for (const keyword of keywords) {
    try {
      console.log(`Fetching Google Trends: ${keyword}`);
      const data = await serpApi({
        engine: "google_trends",
        q: keyword,
        date: DATE_RANGE,
        geo: GEO,
        data_type: "TIMESERIES"
      });
      const parsed = parseTrend(keyword, data);
      if (parsed) signals.push(parsed);
      else noData.push(keyword);
      await sleep(900);
    } catch (err) {
      console.warn(`Google Trends failed for "${keyword}": ${err.message}`);
      failed.push({ keyword, error: err.message });
    }
  }

  signals.sort((a, b) => b.googleTrendScore - a.googleTrendScore);

  fs.writeFileSync("google-trends.json", JSON.stringify({
    updatedAt: new Date().toISOString(),
    source: "SerpApi Google Trends",
    geo: GEO,
    dateRange: DATE_RANGE,
    keywordAttemptCount: keywords.length,
    count: signals.length,
    noDataCount: noData.length,
    failedCount: failed.length,
    signals,
    noData: noData.slice(0, 100),
    failed: failed.slice(0, 50)
  }, null, 2));

  console.log(`Saved ${signals.length} Google Trends signals from ${keywords.length} attempted keywords.`);
  console.log(`No-data keywords: ${noData.length}. Failed keywords: ${failed.length}.`);
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});
