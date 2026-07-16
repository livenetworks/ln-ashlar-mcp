---
name: fake-skill
classification: skill
status: stable
domain: backend
summary: Second-root fake skill under skills/web/, same name as root 1's app-context skill, used for cross-context + cross-root lookup tests.
tags: [fake, fixture, skill, web, federation]
---

## Summary

This is root 2's `fake-skill`, living under `skills/web/` — deliberately the
SAME name as root 1's `skills/app/fake-skill.md`, used to prove
(name, context) skill keying resolves the correct one per root/context.

---

- **Rule (fixture only, web context, root 2):** used only to exercise
  cross-context + cross-root skill lookup in tests.
