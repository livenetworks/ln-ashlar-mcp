---
name: fake-skill-outlink
classification: skill
status: stable
domain: frontend
summary: Negative fixture — a skill with a forbidden outward link outside its context subfolder.
tags: [fake, fixture, skill, negative]
---

## Summary

This fixture lives correctly under `skills/app/` but links outward to a
component doc, which is forbidden for skills (only `./<sibling>.md` links
within the same context subfolder are allowed): [ln-toggle](../components/ln-toggle.md).
