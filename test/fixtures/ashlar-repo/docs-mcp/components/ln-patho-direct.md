---
name: ln-patho-direct
classification: simple
status: stable
domain: frontend
summary: Pathological fixture testing direct tables under Section 3 with no ### subheadings.
source: fake/ln-patho-direct.js
tags: [fixture, pathological, direct]
---

# ln-patho-direct

## 1. Core Behavior & Responsibility

Pathological test fixture for direct tables under ## 3.

## 2. Minimal HTML Markup & Usage Variants

### Base HTML Markup

```html
<div data-ln-patho-direct>
  <span>Direct test</span>
</div>
```

## 3. Declarative API Contract (Attributes & Events)

| Attribute | Element | Type / Values | Default | Description |
|---|---|---|---|---|
| `data-ln-patho-direct` | `div` | Flag | — | Direct attribute table |

| Event | Direction | Cancelable | Description | `detail` Object |
|---|---|---|---|---|
| `ln-patho:direct-event` | Emits | No | Direct event table | `{}` |

## 4. CSS Styling & Behavioral Concept

No CSS.

## 5. Accessibility (ARIA) & Common Pitfalls

None.

## 6. Flow Diagram & Lifecycle

None.

## 7. Related Components

None.
