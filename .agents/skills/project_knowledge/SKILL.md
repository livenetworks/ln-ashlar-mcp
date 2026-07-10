---
name: project_knowledge
description: "Expose project-specific knowledge files to agents within this workspace. Allows agents to read files from the `knowledge/<project>` directories."
---

This skill provides a tool `read_knowledge` that takes two arguments:
- `project`: Name of the knowledge subdirectory (e.g., `ln-ashlar` or `ln-starter`).
- `relative_path`: Path to the file inside that project's knowledge folder.

The tool returns the file contents as a UTF‑8 string.

**Implementation notes**
- The actual logic is implemented in the accompanying Python script `scripts/read_knowledge.py`.
- The script reads the file under `${WORKSPACE_ROOT}/knowledge/${project}/${relative_path}` and prints its contents to stdout. Errors are reported as a JSON object with an `error` field.
