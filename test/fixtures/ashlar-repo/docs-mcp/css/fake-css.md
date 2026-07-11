---
name: fake-css
classification: css
status: stable
summary: Fake CSS API documentation used for ashlar-docs test fixtures.
tags: [fake, fixture, css]
---

## 1. Опис и Намена

Документ за измислен (fake) SCSS API, употребен исклучиво за тестирање.

## 2. Примена

```scss
.fake-target {
  @include fake-mixin(10px);
}
```

## 3. SCSS API (Миксини, Класи и Токени)

| Име | Вид | Параметри / Вредности | Опис |
| --- | --- | --- | --- |
| `fake-mixin` | mixin | `$size` | Применува измислено димензионирање |
| `.fake-class` | класа | — | Измислена помошна класа |
| `--fake-token` | токен | `10px` | Измислен spacing токен |
| `data-ln-fake-css` | атрибут | `boolean` | Измислен CSS hook атрибут |

## 4. Поврзани Документи

Поврзано со [ln-fake](../components/ln-fake.md).
