import { z } from "zod";
import { loadTemplate, compileTemplate } from "./snippets/template_engine.js";

export const name = "generate_ln_stepper";

export const definition = {
	title: "Generate ln-ashlar Stepper",
	description:
		"Генерира ln-ashlar Stepper за чекор-по-чекор процеси од темплејтот во tools/snippets/_src/components/stepper.html.",
	inputSchema: {
		id: z.string().describe("Уникатен ID за stepper елементот"),
		steps: z
			.array(
				z.object({
					number: z.number().describe("Реден број на чекорот"),
					title: z.string().describe("Наслов на чекорот"),
					description: z.string().optional().describe("Краток опис"),
					status: z.enum(["completed", "active", "pending"]).default("pending")
				})
			)
			.describe("Листа на чекори")
	}
};

export const handler = async ({ id, steps = [] }) => {
	const tpl = loadTemplate("components/stepper.html");

	const compiledSteps = steps.map((step) => {
		const statusClass = `ln-step-${step.status}`;
		const isCurrent = step.status === "active" ? ' aria-current="step"' : "";
		const descHtml = step.description ? `\n\t\t\t<span class="ln-step-desc">${step.description}</span>` : "";

		return `\t<li class="ln-step ${statusClass}"${isCurrent}>
		<span class="ln-step-number">${step.number}</span>
		<div class="ln-step-content">
			<span class="ln-step-title">${step.title}</span>${descHtml}
		</div>
	</li>`;
	});

	const htmlOutput = compileTemplate(
		tpl,
		{ id },
		{ steps: compiledSteps.join("\n") }
	);

	return {
		content: [
			{
				type: "text",
				text: `\`\`\`html\n${htmlOutput}\n\`\`\``
			}
		]
	};
};
