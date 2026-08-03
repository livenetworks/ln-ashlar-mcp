# fake-repo — Component Router

> **Purpose:** pick the right component. Nothing else.
> This file contains **no markup**. Do not write HTML from it.

**Routing rule — always:**
1. Pick the component from the tables below.
2. `get_markup` → canonical HTML. Never invent it.

FIXTURE-ROUTER-ROOT-ONE

## Overlays

| Component | Use for | Don't use for |
|---|---|---|
| `ln-fake` | Fixture overlay behaviour | Anything real |

## Golden Rules

1. State lives in `data-ln-*` attributes, never JS variables.
