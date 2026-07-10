export const name = "healthcheck";
export const definition = {
  title: "Health Check",
  description: "Returns server health status",
  inputSchema: {}
};
export const handler = async () => ({
  content: [{ type: "text", text: "OK" }]
});
