// tools/knowledge/index.js
import express from 'express';
import winston from 'winston';
import 'winston-daily-rotate-file';
import { search, rebuildIndex, docCount } from './search.js';
import { notConfiguredMessage } from '../ashlar/corpus.js';

const router = express.Router();

// Winston logger for knowledge base operations (reload events)
const logger = winston.createLogger({
  level: 'info',
  format: winston.format.combine(
    winston.format.timestamp(),
    winston.format.json()
  ),
  transports: [
    new winston.transports.DailyRotateFile({
      dirname: 'logs',
      filename: 'mcp-%DATE%.log',
      datePattern: 'YYYY-MM-DD',
      zippedArchive: true,
      maxSize: '20m',
      maxFiles: '14d'
    })
  ]
});

// GET /knowledge/search?q=term
router.get('/search', (req, res) => {
  const query = req.query.q;
  if (!query) {
    return res.status(400).json({ error: 'Missing query parameter q' });
  }
  if (docCount() === 0) {
    return res.status(503).json({ error: 'not_configured', error_description: notConfiguredMessage() });
  }
  const results = search(query);
  res.json({ query, results });
});

// POST /knowledge/reload - re-read markdown docs from disk and rebuild the search index
router.post('/reload', (req, res) => {
  try {
    const count = rebuildIndex();
    logger.info({ event: 'knowledge_reload', docs: count, user: req.user ? req.user.username : 'unknown' });
    res.json({ reloaded: true, docs: count });
  } catch (e) {
    logger.warn({ event: 'knowledge_reload_failed', error: e.message });
    res.status(500).json({ error: 'server_error', error_description: 'Failed to reload knowledge index.' });
  }
});

export default router;
