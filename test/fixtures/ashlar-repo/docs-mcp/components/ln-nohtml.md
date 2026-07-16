---
name: ln-nohtml
classification: simple
status: stable
domain: frontend
summary: Fake simple component with no html block in §2, used for ashlar-docs test fixtures.
tags: [fake, fixture, simple]
source: fake/ln-nohtml.js
---

## 1. Core Behavior & Responsibility

`ln-nohtml` is a fake simple component used exclusively for testing the
ashlar-docs tools. It has no real implementation.

## 2. Minimal HTML Markup & Usage Variants

### Base HTML Markup

This component intentionally has no html block in §2, to test validate_docs.

## 3. Declarative API Contract (Attributes & Events)

### Attributes Table

| Attribute | Element | Type / Values | Default | Description |
| --- | --- | --- | --- | --- |
| `data-ln-nohtml` | `div` | `boolean` | `false` | Activates the fake component |

### Events API

| Event | Direction | Cancelable | Description | `detail` Object |
| --- | --- | --- | --- | --- |
| `ln:nohtml:activate` | Emits | No | Emitted when the component is activated | `{}` |

## 4. CSS Styling & Behavioral Concept

This fixture carries no own SCSS API.

## 5. Accessibility (ARIA) & Common Pitfalls

Not applicable — this is a fixture.

## 6. Flow Diagram & Lifecycle

No related documents in this fixture.

## 7. Related Components

No usage example in this fixture.
