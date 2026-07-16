---
name: fake-skill-context
classification: skill
status: stable
domain: frontend
context: app
summary: Negative fixture — a skill in skills/app/ that still declares a forbidden context frontmatter key.
tags: [fake, fixture, skill, negative]
---

## Summary

This fixture lives correctly under `skills/app/` but also declares a
`context: app` frontmatter key, which is forbidden now that context is
folder-derived. It must still be indexed (folder-derived context wins), with
a validate_docs/lint finding for the frontmatter key.
