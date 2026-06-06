# DropTrend Backend - Fully API-Free Trend Scrapers

This version removes both:
- SerpApi
- Rainforest API

It uses:
- CJ API for products
- Playwright for Google Trends
- Playwright for Amazon search validation

## GitHub Secrets Needed
Only:
- CJ_EMAIL
- CJ_API_KEY

You can delete:
- SERPAPI_KEY
- RAINFOREST_API_KEY

## Output Files
- products.json
- trend-keywords.json
- google-trends.json
- amazon-keywords.json
- amazon-products.json

## Important note
Amazon can sometimes show CAPTCHA/bot-check pages. This scraper includes delays and lightweight extraction, but if Amazon blocks GitHub Actions, lower `AMAZON_KEYWORD_LIMIT` to 20-40 or run less often.
