---
name: fake-css
classification: css
status: stable
domain: frontend
summary: Fake CSS API documentation used for ashlar-docs test fixtures.
tags: [fake, fixture, css]
---

## 1. Core Behavior & Responsibility

Documentation for a fake SCSS API, used exclusively for testing.

## 2. Minimal HTML Markup & Usage Variants

### Base HTML Markup

```html
<div class="fake-target"></div>
```

## 3. SCSS API (Mixins, Classes & Tokens)

| Name | Kind | Parameters / Values | Description |
| --- | --- | --- | --- |
| `fake-mixin` | mixin | `$size` | Applies fake sizing |
| `.fake-class` | class | — | Fake helper class |
| `--fake-token` | token | `10px` | Fake spacing token |
| `data-ln-fake-css` | attribute | `boolean` | Fake CSS hook attribute |

## 4. Accessibility & Common Pitfalls

Not applicable — this is a fixture.

## 5. Related Documents

Related to [ln-fake](../components/ln-fake.md) and to a
[not-yet-authored document](./not-written-yet.md) (dangling, planned).
