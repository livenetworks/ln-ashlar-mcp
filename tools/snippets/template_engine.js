import fs from "fs";
import path from "path";

const SRC_DIR = path.resolve("tools/snippets/_src");

/**
 * Вчитува чист HTML темплејт од tools/snippets/_src директориумот
 * @param {string} relativePath - релативна патека (на пр. 'base/page-shell.html')
 * @returns {string} содржината на HTML фајлот
 */
export function loadTemplate(relativePath) {
  const filePath = path.join(SRC_DIR, relativePath);
  if (!fs.existsSync(filePath)) {
    throw new Error(`Темплејт фајлот не постои: ${filePath}`);
  }
  return fs.readFileSync(filePath, "utf-8");
}

/**
 * Претвора водечки спејсови во TABS (\t) за цел коден блок
 * @param {string} code - Влезен HTML/код
 * @returns {string} Код исклучиво со TAB индентација
 */
export function indentWithTabs(code) {
  if (!code) return "";
  return code
    .split("\n")
    .map((line) => {
      // Претвори ги водечките 2 или 4 спејсови во TAB (\t)
      return line.replace(/^([ ]+)/, (spaces) => {
        const indentLevel = Math.ceil(spaces.length / 2);
        return "\t".repeat(indentLevel);
      });
    })
    .join("\n");
}

/**
 * Комплетно render-ирање на темплејт со променливи и слотови (со задолжителна TAB индентација)
 * @param {string} templateStr - HTML стрингот на темплејтот
 * @param {Record<string, string>} data - променливи за {{key}} замена
 * @param {Record<string, string>} slots - слотови за <!-- KEY_SLOT --> или <!-- SLOT:key --> замена
 * @returns {string} финалниот обработен HTML со TAB индентација
 */
export function compileTemplate(templateStr, data = {}, slots = {}) {
  let result = templateStr;

  // 1. Замена на слотови
  for (const [slotName, slotValue] of Object.entries(slots)) {
    const slotPattern1 = `<!-- ${slotName.toUpperCase()}_SLOT -->`;
    const slotPattern2 = `<!-- SLOT:${slotName} -->`;
    result = result.replaceAll(slotPattern1, slotValue ?? "");
    result = result.replaceAll(slotPattern2, slotValue ?? "");
  }

  // Избриши неограничени слотови (ако останале неисполнети)
  result = result.replace(/<!-- [A-Z0-9_]+_SLOT -->/g, "");
  result = result.replace(/<!-- SLOT:[a-zA-Z0-9_]+ -->/g, "");

  // 2. Замена на {{key}} променливи
  for (const [key, value] of Object.entries(data)) {
    const varPattern = new RegExp(`\\{\\{\\s*${key}\\s*\\}\\}`, "g");
    result = result.replace(varPattern, value ?? "");
  }

  // Избриши ги неопределените {{vars}}
  result = result.replace(/\{\{\s*[a-zA-Z0-9_]+\s*\}\}/g, "");

  // 3. Задолжително претворање на сите водечки спејсови во TABS (\t)
  return indentWithTabs(result);
}
