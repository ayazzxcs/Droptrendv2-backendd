# DropTrend v2 Backend

This backend fetches real CJdropshipping products, derives clean trend keywords from those CJ products, checks Google Trends via SerpApi, checks Amazon demand via Rainforest API, then merges the signals into `products.json`.

## Data flow

1. `scripts/fetch-cj-products.js` → real CJ products, images, prices, margins.
2. `scripts/fetch-google-trends.js` → builds `trend-keywords.json` from CJ titles/categories and saves `google-trends.json`.
3. `scripts/fetch-amazon-products.js` → uses Google signals plus CJ-derived keywords and saves `amazon-products.json`.
4. `scripts/merge-trend-signals.js` → writes final `products.json` with `dropTrendScore` and `trendProof`.

## Required GitHub Secrets

- `CJ_EMAIL`
- `CJ_API_KEY`
- `SERPAPI_KEY`
- `RAINFOREST_API_KEY`

## Useful workflow env settings

- `GOOGLE_TRENDS_LIMIT`: default 120 in workflow
- `AMAZON_KEYWORD_LIMIT`: default 80 in workflow
- `AMAZON_RESULTS_PER_KEYWORD`: default 5 in workflow
- `TREND_KEYWORDS`: optional comma-separated manual seed keywords

## Output fields

Each product can include:

- `dropTrendScore`
- `trendProof.googleTrends`
- `trendProof.amazon`
- `trendProof.cjSupplier`

The score is calculated from real matched signals, but it is still a custom DropTrend score.
