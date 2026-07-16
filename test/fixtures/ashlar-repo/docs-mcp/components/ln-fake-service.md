---
name: ln-fake-service
classification: service
status: stable
domain: backend
summary: Fake service component used for ashlar-docs test fixtures.
tags: [fake, fixture, service]
source: fake/ln-fake-service.js
---

## 1. Core Behavior & Responsibility

`ln-fake-service` is a fake service component used exclusively for testing
the ashlar-docs tools. It has no real implementation.

## 2. Minimal HTML Markup & Usage Variants

### Base HTML Markup

```js
import { lnFakeService } from "ln-ashlar";

lnFakeService.init();
```

### Variant 1: With Options

```js
import { lnFakeService } from "ln-ashlar";

lnFakeService.init({ debug: true });
```

## 3. Declarative API Contract (Attributes & Events)

### Attributes Table

| Attribute | Element | Type / Values | Default | Description |
| --- | --- | --- | --- | --- |
| `data-ln-fake-service` | `div` | `boolean` | `false` | Activates the fake service component |

### Events API

| Event | Direction | Cancelable | Description | `detail` Object |
| --- | --- | --- | --- | --- |
| `ln:fake-service:ready` | Emits | No | Emitted when the service is ready | `{}` |

## 4. CSS Styling & Behavioral Concept

This fixture carries no own SCSS API.

## 5. Accessibility (ARIA) & Common Pitfalls

Not applicable — this is a background service.

## 6. Flow Diagram & Lifecycle

No related documents in this fixture.

## 7. Related Components

```js
import { lnFakeService } from "ln-ashlar";

lnFakeService.init();
```
