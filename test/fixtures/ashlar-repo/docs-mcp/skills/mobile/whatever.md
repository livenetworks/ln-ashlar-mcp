---
name: whatever
classification: skill
status: stable
domain: frontend
summary: Negative fixture — a skill living under an unknown context subfolder (mobile/).
tags: [fake, fixture, skill, negative]
---

## Summary

This fixture lives under `skills/mobile/`, an unknown context subfolder
(only `app|web|wordpress` are recognized). It must be skipped from the index
and reported as a validate_docs/lint finding, without crashing.
