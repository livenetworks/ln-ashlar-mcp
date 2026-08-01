import express from "express";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import { z } from "zod";
import winston from "winston";
import "winston-daily-rotate-file";
import knowledgeRouter from "./tools/knowledge/index.js";
import path from "path";
import fs from "fs";
import { randomUUID } from "crypto";
import authMiddleware from "./middleware/auth.js";
import oauthRouter from "./routes/oauth.js";
import { SSEServerTransport } from "@modelcontextprotocol/sdk/server/sse.js";
import { isInitializeRequest } from "@modelcontextprotocol/sdk/types.js";
import { pathToFileURL } from 'url';

if (!process.env.DOCS_CORPUS_ROOTS && !process.env.ASHLAR_DOCS_REPO) {
  const defaultPath = path.resolve(import.meta.dirname, 'resources/ln-ashlar');
  if (fs.existsSync(path.join(defaultPath, 'docs-mcp'))) {
    process.env.DOCS_CORPUS_ROOTS = defaultPath;
  }
}

const app = express();
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Configure Winston logger
const logger = winston.createLogger({
  level: "info",
  format: winston.format.combine(
    winston.format.timestamp(),
    winston.format.json()
  ),
  transports: [
    new winston.transports.DailyRotateFile({
      dirname: "logs",
      filename: "mcp-%DATE%.log",
      datePattern: "YYYY-MM-DD",
      zippedArchive: true,
      maxSize: "20m",
      maxFiles: "14d"
    })
  ]
});

// Express request/response logging middleware
app.use((req, res, next) => {
  const start = Date.now();

  // Capture original res.json, res.send and res.redirect to log responses
  const originalJson = res.json;
  const originalSend = res.send;
  const originalRedirect = res.redirect;

  let responseBody = '';

  res.json = function (body) {
    let sanitized = body;
    if (body && typeof body === 'object') {
      sanitized = { ...body };
      if (sanitized.access_token) sanitized.access_token = '***';
      if (sanitized.code) sanitized.code = '***';
    }
    responseBody = JSON.stringify(sanitized);
    return originalJson.apply(res, arguments);
  };

  res.send = function (body) {
    if (typeof body === 'string') {
      responseBody = body;
    }
    return originalSend.apply(res, arguments);
  };

  res.redirect = function (url) {
    responseBody = `Redirect to ${url}`;
    return originalRedirect.apply(res, arguments);
  };

  res.on('finish', () => {
    const duration = Date.now() - start;

    // Sanitize request body & query parameters
    const sanitizeObj = (obj) => {
      if (!obj || typeof obj !== 'object') return obj;
      const sanitized = { ...obj };
      const keysToMask = ['token', 'authorization', 'client_secret', 'clientSecret', 'code'];
      for (const key of keysToMask) {
        if (key in sanitized) sanitized[key] = '***';
      }
      return sanitized;
    };

    const logData = {
      ip: req.headers['x-forwarded-for'] || req.ip || req.connection?.remoteAddress,
      method: req.method,
      url: req.originalUrl,
      query: sanitizeObj(req.query),
      body: sanitizeObj(req.body),
      status: res.statusCode,
      duration: `${duration}ms`,
      user: req.user ? req.user.username : 'anonymous'
    };

    if (res.statusCode >= 400) {
      logData.error = responseBody;
      logger.warn(logData);
    } else {
      logger.info(logData);
    }
  });

  next();
});

// OAuth authorization/token endpoints (unauthenticated, own login page + PKCE flow)
app.use(oauthRouter);

// Apply authentication middleware for MCP tools/queries
app.use(authMiddleware);

const registeredTools = [];
const toolsDir = path.resolve('tools');
try {
  const files = fs.readdirSync(toolsDir);
  for (const file of files) {
    if (file === 'knowledge' || !file.endsWith('.js')) continue;
    const toolPath = path.join(toolsDir, file);
    try {
      const module = await import(pathToFileURL(toolPath).href);
      const tool = module.name && module.definition && module.handler ? module : module.default;
      if (tool && tool.name && tool.definition && tool.handler) {
        registeredTools.push(tool);
        console.log(`Prepared tool ${tool.name} for registration`);
      } else {
        console.warn(`Tool file ${file} does not export required fields`);
      }
    } catch (e) {
      console.error(`Failed to load tool ${file}:`, e);
    }
  }
} catch (e) {
  console.error('Failed to read tools directory:', e);
}

// Factory function to instantiate a new McpServer instance per connection
const createMcpServer = () => {
  const server = new McpServer({
    name: "mcp-http-server",
    version: "1.0.0"
  });

  // Register all pre-loaded tools dynamically
  for (const tool of registeredTools) {
    server.registerTool(tool.name, tool.definition, tool.handler);
  }

  // Register ping tool
  server.registerTool(
    "ping",
    {
      title: "Ping",
      description: "Simple connectivity test",
      inputSchema: {
        message: z.string().optional()
      }
    },
    async ({ message }) => {
      return {
        content: [
          {
            type: "text",
            text: `PONG ${message ?? ""}`.trim()
          }
        ]
      };
    }
  );

  return server;
};



app.use('/knowledge', knowledgeRouter);

// Session storage for active transports, and the username each session belongs to
const transports = {};
const sessionUsers = {}; // sessionId -> username

const forbiddenSessionOwner = (res) => res.status(403).json({
  jsonrpc: '2.0',
  error: {
    code: -32000,
    message: 'Forbidden: session belongs to a different user'
  },
  id: null
});

//=============================================================================
// 1. STREAMABLE HTTP TRANSPORT (PROTOCOL VERSION 2025-11-25)
//=============================================================================
app.all(['/', '/mcp'], async (req, res) => {
  try {
    const sessionId = req.headers['mcp-session-id'];
    let transport;

    if (sessionId && transports[sessionId]) {
      const owner = sessionUsers[sessionId];
      if (owner && owner !== req.authUser) {
        return forbiddenSessionOwner(res);
      }

      const existingTransport = transports[sessionId];
      if (existingTransport instanceof StreamableHTTPServerTransport) {
        transport = existingTransport;
      } else {
        return res.status(400).json({
          jsonrpc: '2.0',
          error: {
            code: -32000,
            message: 'Bad Request: Session exists but uses a different transport protocol'
          },
          id: null
        });
      }
    } else if (!sessionId && req.method === 'POST' && isInitializeRequest(req.body)) {
      const initiatingUser = req.authUser;
      transport = new StreamableHTTPServerTransport({
        sessionIdGenerator: () => randomUUID(),
        onsessioninitialized: (sid) => {
          console.log(`StreamableHTTP session initialized: ${sid}`);
          transports[sid] = transport;
          sessionUsers[sid] = initiatingUser;
        }
      });
      transport.onclose = () => {
        const sid = transport.sessionId;
        if (sid && transports[sid]) {
          console.log(`Transport closed for session ${sid}, removing from transports map`);
          delete transports[sid];
          delete sessionUsers[sid];
        }
      };
      const serverInstance = createMcpServer();
      await serverInstance.connect(transport);
    } else {
      return res.status(400).json({
        jsonrpc: '2.0',
        error: {
          code: -32000,
          message: 'Bad Request: No valid session ID provided or invalid initialization'
        },
        id: null
      });
    }

    await transport.handleRequest(req, res, req.body);
  } catch (error) {
    console.error('Error handling MCP request on /mcp:', error);
    if (!res.headersSent) {
      res.status(500).json({
        jsonrpc: '2.0',
        error: {
          code: -32603,
          message: 'Internal server error'
        },
        id: null
      });
    }
  }
});

//=============================================================================
// 2. HTTP + SSE TRANSPORT (PROTOCOL VERSION 2024-11-05)
//=============================================================================
app.get('/sse', async (req, res) => {
  console.log('Received GET request to /sse (SSE transport)');
  const transport = new SSEServerTransport('/messages', res);
  transports[transport.sessionId] = transport;
  sessionUsers[transport.sessionId] = req.authUser;
  res.on('close', () => {
    console.log(`SSE connection closed for session ${transport.sessionId}`);
    delete transports[transport.sessionId];
    delete sessionUsers[transport.sessionId];
  });
  const serverInstance = createMcpServer();
  await serverInstance.connect(transport);
});

app.post('/messages', async (req, res) => {
  const sessionId = req.query.sessionId;
  const transport = transports[sessionId];
  if (transport && transport instanceof SSEServerTransport) {
    const owner = sessionUsers[sessionId];
    if (owner && owner !== req.authUser) {
      return res.status(403).send('Forbidden: session belongs to a different user');
    }
    await transport.handlePostMessage(req, res, req.body);
  } else {
    res.status(400).send('No transport found for sessionId');
  }
});

const HOST = "0.0.0.0";
const PORT = process.env.PORT || 8080;

app.listen(PORT, HOST, () => {
  console.log(`MCP HTTP listening on http://${HOST}:${PORT}`);
  console.log(`- Streamable HTTP: http://${HOST}:${PORT}/mcp`);
  console.log(`- SSE Endpoint: http://${HOST}:${PORT}/sse`);
});
