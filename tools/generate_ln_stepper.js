import { z } from "zod";
import { loadTemplate, compileTemplate, escapeHtml } from "./snippets/template_engine.js";
import { attr } from "./snippets/builders.js";
import { ATTR } from "./snippets/attributes.generated.js";
import { htmlResult } from "./snippets/mcp.js";
import { ROUTER_FIRST_HINT } from "./ashlar/instructions.js";

export const name = "generate_ln_stepper";

export const definition = {
	title: "Generate ln-ashlar Stepper",
	description:
		ROUTER_FIRST_HINT +
		"Генерира чекор-по-чекор индикатор. Ги следи селекторите од scss/config/mixins/_stepper.scss: " +
		"<ol data-ln-stepper> со <li data-ln-step='complete'|'current'> и > [data-ln-step-label]. " +
		"Редниот број го рендерира CSS counter — не се пишува во markup-от.",
	inputSchema: {
		id: z.string().describe("Уникатен ID за stepper елементот"),
		steps: z
			.array(
				z.object({
					label: z.string().describe("Наслов на чекорот"),
					status: z
						.enum(["complete", "current", "pending"])
						.default("pending")
						.describe("Состојба. 'pending' намерно не емитува атрибут — тоа е default стилот.")
				})
			)
			.describe("Листа на чекори по редослед")
	}
};

export const handler = async ({ id, steps = [] }) => {
	const compiled = steps.map((step) => {
		const status = step.status ?? "pending";
		const stepAttr = status === "pending" ? "" : attr(ATTR.step, status);
		const current = status === "current" ? ' aria-current="step"' : "";
		return `\t<li${stepAttr}${current}>\n\t\t<span ${ATTR.stepLabel}>${escapeHtml(step.label)}</span>\n\t</li>`;
	});

	return htmlResult(
		compileTemplate(loadTemplate("components/stepper.html"), { id }, { steps: compiled.join("\n") })
	);
};
