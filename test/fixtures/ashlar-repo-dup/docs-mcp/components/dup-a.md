---
name: ln-dup
classification: simple
status: stable
domain: frontend
summary: First file declaring the duplicate name "ln-dup", for duplicate-name validation testing.
tags: [fake, fixture, dup]
---

## 1. Core Behavior & Responsibility

Duplicate-name test fixture A.

## 2. Minimal HTML Markup & Usage Variants

### Base HTML Markup

```html
<div data-ln-dup="true"></div>
```

## 3. Declarative API Contract (Attributes & Events)

### Attributes Table

| Attribute | Element | Type / Values | Default | Description |
| --- | --- | --- | --- | --- |
| `data-ln-dup` | `div` | `boolean` | `false` | Activates the fixture |

### Events API

| Event | Direction | Cancelable | Description | `detail` Object |
| --- | --- | --- | --- | --- |
| `ln:dup:activate` | Emits | No | Emitted on activation | `{}` |

## 4. CSS Styling & Behavioral Concept

Not applicable — this is a fixture.

## 5. Accessibility (ARIA) & Common Pitfalls

Not applicable — this is a fixture.

## 6. Flow Diagram & Lifecycle

No related documents in this fixture.

## 7. Related Components

No usage example in this fixture.
