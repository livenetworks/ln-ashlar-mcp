---
name: ln-patho-mixed
classification: simple
status: stable
domain: frontend
summary: Pathological fixture testing mixed attribute+event table and qualified base markup heading.
source: fake/ln-patho-mixed.js
tags: [fixture, pathological, mixed]
---

# ln-patho-mixed

## 1. Core Behavior & Responsibility

Pathological test fixture for mixed tables.

## 2. Minimal HTML Markup & Usage Variants

### Base HTML Markup (SSR Mode)

```html
<div data-ln-patho-type="area">
  <span>Mixed test</span>
</div>
```

## 3. Contract

| Surface | Values / payload | Meaning |
|---|---|---|
| `data-ln-patho-type` | `line`, `area` | Type renderer |
| `ln-patho:request-data` | `{id}` | Request data event |
| `ln-patho:rendered` | `{count}` | Rendered event |

## 4. CSS Styling & Behavioral Concept

No CSS.

## 5. Accessibility (ARIA) & Common Pitfalls

None.

## 6. Flow Diagram & Lifecycle

None.

## 7. Related Components

None.
