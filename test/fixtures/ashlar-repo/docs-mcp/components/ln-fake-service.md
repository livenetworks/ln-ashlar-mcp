---
name: ln-fake-service
classification: service
status: stable
summary: Fake service component used for ashlar-docs test fixtures.
tags: [fake, fixture, service]
source: fake/ln-fake-service.js
---

## 1. Опис и Намена

`ln-fake-service` е измислена (fake) сервисна компонента која служи исклучиво
за тестирање на ashlar-docs алатките. Нема реална имплементација.

## 2. Минимален HTML Маркап и Варијанти на Употреба

### Базен HTML Маркап

```js
import { lnFakeService } from "ln-ashlar";

lnFakeService.init();
```

### Варијанта 1: Со опции

```js
import { lnFakeService } from "ln-ashlar";

lnFakeService.init({ debug: true });
```

## 3. Декларативен API Договор (Атрибути и Настани)

### Табела со Атрибути

| Атрибут | Елемент | Тип / Вредности | Стандардна вредност | Опис |
| --- | --- | --- | --- | --- |
| `data-ln-fake-service` | `div` | `boolean` | `false` | Активира ја fake сервисната компонента |

### Настани (Events API)

| Настан | Насока | Cancelable | Опис | `detail` Објект |
| --- | --- | --- | --- | --- |
| `ln:fake-service:ready` | Емитува | Не | Се емитува кога сервисот е спремен | `{}` |

## 4. SCSS / Стилизација

Компонентата не носи сопствен SCSS API во оваа фикстура.

## 5. JS Однесување

Нема реално JS однесување — ова е фикстура.

## 6. Поврзани Документи

Нема поврзани документи во оваа фикстура.

## 7. Пример за Употреба

```js
import { lnFakeService } from "ln-ashlar";

lnFakeService.init();
```
