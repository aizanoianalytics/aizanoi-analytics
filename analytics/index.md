# Analytics Index

Scope: analytics source/data-product work stored outside the production static frontend.

## Route by task

- Public Analytics product UI/route → `../frontend/analytics/`
- AizanoiOS Analytics catalog/routing → `../frontend/js/v3/registry.js`
- Analytics source assets, models or supporting material → remain within this area and follow the nearest local documentation.

## Boundary

**Analytics** is the stable public product family and `/analytics/` is its stable public route. Dashboards are a format within Analytics, not a separate umbrella product.

Do not mix public generated/frontend output with source-side analytical material unless the build/runtime contract explicitly requires it.