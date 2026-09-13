export const name = "healthcheck";
export const definition = {
  title: "Health Check",
  description: "Returns server health status",
  inputSchema: {}
};
import { getRagState } from "./ashlar/rag/search.js";

export const handler = async () => ({
  content: [{ type: "text", text: `OK (RAG: ${getRagState()})` }]
});
