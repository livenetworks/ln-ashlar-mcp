---
name: ln-fake
classification: simple
status: stable
domain: frontend
summary: Fake simple component used for ashlar-docs test fixtures.
tags: [fake, fixture, simple]
source: fake/ln-fake.js
---

## 1. Core Behavior & Responsibility

`ln-fake` is a fake simple component used exclusively for testing the
ashlar-docs tools. It has no real implementation.

## 2. Minimal HTML Markup & Usage Variants

### Base HTML Markup

```html
<div data-ln-fake="true"></div>
```

### Variant 1: With Icon

```html
<div data-ln-fake="true" data-ln-fake-action="alert">
  <i class="icon"></i>
</div>
```

### Variant 2: Without Icon

```html
<div data-ln-fake="true"></div>
```

## 3. Declarative API Contract (Attributes & Events)

### Attributes Table

| Attribute | Element | Type / Values | Default | Description |
| --- | --- | --- | --- | --- |
| `data-ln-fake` | `div` | `boolean` | `false` | Activates the fake component |
| `data-ln-fake-action` | `div` | `alert\|none` | `none` | Action executed on click |
| `data-ln-fake-target` | `div` | `string` (id) | — | Target element for the action |

### Events API

| Event | Direction | Cancelable | Description | `detail` Object |
| --- | --- | --- | --- | --- |
| `ln:fake:activate` | Emits | Yes | Emitted when the component is activated | `{ id: string }` |
| `ln:fake:refresh` | Listens | No | Listened for an external refresh request | `{}` |

## 4. CSS Styling & Behavioral Concept

This fixture carries no own SCSS API.

## 5. Accessibility (ARIA) & Common Pitfalls

No real accessibility behavior — this is a fixture.

## 6. Flow Diagram & Lifecycle

```html
<div data-ln-fake="true" data-ln-fake-action="alert"></div>
```

## 7. Related Components

Related to [ln-broken](./ln-broken.md) and to [fake-css](../css/fake-css.md).
