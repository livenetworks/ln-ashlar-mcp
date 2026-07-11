---
name: ln-other
classification: pattern
status: stable
summary: Broken fixture used to exercise validate_docs problem detection.
---

## 1. Опис и Намена

`ln-broken` е измислена компонента со намерно расипани мета-податоци и
структура, употребена само за тестирање на validate_docs.

## 2. Минимален HTML Маркап и Варијанти на Употреба

### Базен HTML Маркап

```html
<div data-ln-broken="true"></div>
```

## 3. Декларативен API Договор (Атрибути и Настани)

### Табела со Атрибути

| Attr | Опис |
| --- | --- |
| `data-ln-broken` | Намерно погрешни колони за тестирање |

## 4. SCSS / Стилизација

Нема сопствен SCSS API во оваа фикстура.

## 6. Поврзани Документи

Содржи расипан линк кон [непостоечки документ](./does-not-exist.md).

## 7. Пример за Употреба

```html
<div data-ln-broken="true"></div>
```
