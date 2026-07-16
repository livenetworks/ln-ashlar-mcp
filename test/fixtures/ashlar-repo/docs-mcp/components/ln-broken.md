---
name: ln-other
classification: pattern
status: bogus
summary: Broken fixture used to exercise validate_docs problem detection.
---

## 1. Core Behavior & Responsibility

`ln-broken` is a fake component with intentionally broken metadata and
structure, used only for testing validate_docs.

## 2. Minimal HTML Markup & Usage Variants

### Base HTML Markup

```html
<div data-ln-broken="true"></div>
```

## 3. Declarative API Contract (Attributes & Events)

### Attributes Table

| Attr | Description |
| --- | --- |
| `data-ln-broken` | Intentionally wrong columns for testing |

## 4. CSS Styling & Behavioral Concept

No own SCSS API in this fixture.

## 6. Flow Diagram & Lifecycle

Contains a dangling link to a [not-yet-authored document](./does-not-exist.md)
— valid, planned; no longer a validation finding.

## 7. Related Components

```html
<div data-ln-broken="true"></div>
```
