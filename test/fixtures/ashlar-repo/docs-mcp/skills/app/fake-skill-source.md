---
name: fake-skill-source
classification: skill
status: stable
domain: frontend
summary: Negative fixture — a skill declaring a forbidden source frontmatter key.
source: js/ln-fake/src/ln-fake.js
tags: [fake, fixture, skill, negative]
---

## Summary

This fixture lives correctly under `skills/app/` but declares a `source:`
key, which is forbidden for skills (standalone, no code source). It must
still be indexed, with a validate_docs/lint finding for the frontmatter key.
