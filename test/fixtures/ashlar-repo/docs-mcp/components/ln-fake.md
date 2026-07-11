---
name: ln-fake
classification: simple
status: stable
summary: Fake simple component used for ashlar-docs test fixtures.
tags: [fake, fixture, simple]
source: fake/ln-fake.js
---

## 1. Опис и Намена

`ln-fake` е измислена (fake) едноставна компонента која служи исклучиво за
тестирање на ashlar-docs алатките. Нема реална имплементација.

## 2. Минимален HTML Маркап и Варијанти на Употреба

### Базен HTML Маркап

```html
<div data-ln-fake="true"></div>
```

### Варијанта 1: Со икона

```html
<div data-ln-fake="true" data-ln-fake-action="alert">
  <i class="icon"></i>
</div>
```

### Варијанта 2: Без икона

```html
<div data-ln-fake="true"></div>
```

## 3. Декларативен API Договор (Атрибути и Настани)

### Табела со Атрибути

| Атрибут | Елемент | Тип / Вредности | Стандардна вредност | Опис |
| --- | --- | --- | --- | --- |
| `data-ln-fake` | `div` | `boolean` | `false` | Активира ја fake компонентата |
| `data-ln-fake-action` | `div` | `alert\|none` | `none` | Акција што се извршува при клик |
| `data-ln-fake-target` | `div` | `string` (id) | — | Целен елемент за акцијата |

### Настани (Events API)

| Настан | Насока | Cancelable | Опис | `detail` Објект |
| --- | --- | --- | --- | --- |
| `ln:fake:activate` | Емитува | Да | Се емитува при активација на компонентата | `{ id: string }` |
| `ln:fake:refresh` | Слуша | Не | Се слуша за надворешно барање за освежување | `{}` |

## 4. SCSS / Стилизација

Компонентата не носи сопствен SCSS API во оваа фикстура.

## 5. JS Однесување

Нема реално JS однесување — ова е фикстура.

## 6. Поврзани Документи

Поврзано со [ln-broken](./ln-broken.md) и со [fake-css](../css/fake-css.md).

## 7. Пример за Употреба

```html
<div data-ln-fake="true" data-ln-fake-action="alert"></div>
```
