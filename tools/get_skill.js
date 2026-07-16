import { z } from "zod";
import { ensureIndex, notConfiguredMessage } from "./ashlar/corpus.js";
import { closest } from "./ashlar/similar.js";
import { renderAmbiguous } from "./ashlar/resolve.js";
import { SKILL_PERSONA } from "./ashlar/persona.js";

export const name = "get_skill";

export const definition = {
  title: "Get Skill",
  description:
    "Serve a design-decision skill document (classification 'skill', skills/ folder only): " +
    "prescriptive UI/UX rules with a server-injected senior-designer persona (the persona is " +
    "never authored in the document itself). Skills are keyed by (name, context) — 'context' " +
    "is derived from the subfolder the skill lives in (app|web|wordpress), never frontmatter; " +
    "defaults to 'app'. Optional 'domain' disambiguates a name that exists in multiple corpus " +
    "roots.",
  inputSchema: {
    name: z.string().describe("Skill slug, e.g. 'ui-visual-language'"),
    context: z
      .enum(["app", "web", "wordpress"])
      .optional()
      .describe("Skill context subfolder; defaults to 'app'."),
    domain: z
      .enum(["frontend", "backend", "process"])
      .optional()
      .describe("Disambiguate a name that exists in multiple corpus roots")
  }
};

export const handler = async ({ name: skillName, context, domain }) => {
  const index = await ensureIndex();
  if (!index) {
    return { content: [{ type: "text", text: notConfiguredMessage() }] };
  }

  const effectiveContext = context || "app";

  const keys = index.byName.get(skillName) || [];
  let candidates = keys.map((k) => index.docs.get(k)).filter((d) => d && d.folder === "skills" && d.context === effectiveContext);
  if (domain) candidates = candidates.filter((d) => d.domain === domain);

  if (candidates.length === 0) {
    const skillNames = Array.from(index.docs.values())
      .filter((d) => d.folder === "skills" && d.context === effectiveContext)
      .map((d) => d.name);
    const suggestions = closest(skillName, skillNames);
    const suffix = suggestions.length ? ` Closest matches: ${suggestions.join(", ")}` : "";
    return { content: [{ type: "text", text: `Not found: "${skillName}".${suffix}` }] };
  }

  if (candidates.length > 1) {
    return { content: [{ type: "text", text: renderAmbiguous(skillName, candidates) }] };
  }

  const doc = candidates[0];
  return { content: [{ type: "text", text: `${SKILL_PERSONA}\n\n${doc.body.trim()}` }] };
};
