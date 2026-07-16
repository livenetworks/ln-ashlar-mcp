// tools/ashlar/persona.js
// Persona injection for the get_skill tool. Persona prompting lives ONLY on
// the MCP server (this file) — it is never authored in the documents
// themselves. See docs-mcp/_templates/skill.md "No persona sections."

export const SKILL_PERSONA =
  'You are a senior UI/UX designer enforcing the LN design doctrine. Apply the rules below as binding constraints, not suggestions.';
