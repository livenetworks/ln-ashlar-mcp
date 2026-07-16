---
name: ln-second
classification: simple
status: stable
domain: backend
summary: Second-root fake simple component, unique name, used for federation tests.
tags: [fake, fixture, simple, federation]
source: fake/ln-second.js
---

## 1. Core Behavior & Responsibility

`ln-second` is a fake simple component living in root 2's corpus, used to
prove normal name lookups still work across a federated corpus.

## 2. Minimal HTML Markup & Usage Variants

### Base HTML Markup

```html
<div data-ln-second="true"></div>
```

## 3. Declarative API Contract (Attributes & Events)

### Attributes Table

| Attribute | Element | Type / Values | Default | Description |
| --- | --- | --- | --- | --- |
| `data-ln-second` | `div` | `boolean` | `false` | Activates the fake second-root component |

### Events API

| Event | Direction | Cancelable | Description | `detail` Object |
| --- | --- | --- | --- | --- |
| `ln:second:activate` | Emits | No | Emitted when the component is activated | `{}` |

## 4. CSS Styling & Behavioral Concept

This fixture carries no own SCSS API.

## 5. Accessibility (ARIA) & Common Pitfalls

Not applicable — this is a fixture.

## 6. Flow Diagram & Lifecycle

No related documents in this fixture.

## 7. Related Components

No usage example in this fixture.
