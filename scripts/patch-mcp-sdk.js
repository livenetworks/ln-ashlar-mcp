import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const filesToPatch = [
  path.resolve(__dirname, '../node_modules/@modelcontextprotocol/sdk/dist/esm/server/webStandardStreamableHttp.js'),
  path.resolve(__dirname, '../node_modules/@modelcontextprotocol/sdk/dist/cjs/server/webStandardStreamableHttp.js')
];

for (const filePath of filesToPatch) {
  if (!fs.existsSync(filePath)) continue;
  let content = fs.readFileSync(filePath, 'utf-8');
  if (content.includes(': ping\\n\\n')) {
    console.log(`[patch-mcp-sdk] Already patched: ${path.basename(filePath)}`);
    continue;
  }

  const target = `start: controller => {
                streamController = controller;
            },`;

  const replacement = `start: controller => {
                streamController = controller;
                controller.enqueue(encoder.encode(': ping\\n\\n'));
                pingInterval = setInterval(() => {
                    try {
                        controller.enqueue(encoder.encode(': ping\\n\\n'));
                    } catch {
                        clearInterval(pingInterval);
                    }
                }, 15000);
            },`;

  if (content.includes(target)) {
    content = content.replace('let streamController;', 'let streamController;\n        let pingInterval;');
    content = content.replace(target, replacement);
    content = content.replace('cancel: () => {', 'cancel: () => {\n                if (pingInterval) clearInterval(pingInterval);');
    content = content.replace('cleanup: () => {', 'cleanup: () => {\n                if (pingInterval) clearInterval(pingInterval);');
    content = content.replace("Connection: 'keep-alive'", "Connection: 'keep-alive',\n            'X-Accel-Buffering': 'no'");
    fs.writeFileSync(filePath, content, 'utf-8');
    console.log(`[patch-mcp-sdk] Successfully patched: ${path.basename(filePath)}`);
  } else {
    console.warn(`[patch-mcp-sdk] Target pattern not found in: ${path.basename(filePath)}`);
  }
}
