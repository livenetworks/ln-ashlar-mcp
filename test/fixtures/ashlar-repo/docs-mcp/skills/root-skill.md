---
name: root-skill
classification: skill
status: stable
domain: frontend
summary: Negative fixture — a skill file placed directly under skills/, not in a context subfolder.
tags: [fake, fixture, skill, negative]
---

## Summary

This fixture is intentionally misplaced directly under `skills/` (no
`app|web|wordpress` context subfolder) to exercise the "skill file must live
in a context subfolder" validate_docs/lint finding. It must be skipped from
the index without crashing.
