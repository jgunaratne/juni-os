import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import { VertexAI } from '@google-cloud/vertexai';

/* ── Config ────────────────────────────────────────────────── */

const PORT = process.env.PORT || 3001;
const DEFAULT_PROJECT = process.env.GCP_PROJECT_ID || '';
const DEFAULT_LOCATION = process.env.GCP_LOCATION || 'us-central1';

/* ── Vertex AI Client Cache ────────────────────────────────── */

const clientCache = new Map();

function getVertexClient(project, location) {
  const key = `${project}::${location}`;
  if (!clientCache.has(key)) {
    clientCache.set(key, new VertexAI({ project, location }));
  }
  return clientCache.get(key);
}

/* ── Express App ───────────────────────────────────────────── */

const app = express();
app.use(cors({ origin: true }));
app.use(express.json({ limit: '20mb' }));

/* ── Health Check ──────────────────────────────────────────── */

app.get('/api/health', (_req, res) => {
  res.json({
    status: 'ok',
    project: DEFAULT_PROJECT || '(not set — provide via UI)',
    location: DEFAULT_LOCATION,
  });
});

/* ── Chat Endpoint ─────────────────────────────────────────── */

app.post('/api/gemini/chat', async (req, res) => {
  try {
    const {
      model = 'gemini-2.5-flash',
      messages = [],
      project,
      location,
    } = req.body;

    const resolvedProject = project || DEFAULT_PROJECT;
    const resolvedLocation = location || DEFAULT_LOCATION;

    if (!resolvedProject) {
      return res.status(400).json({ error: 'GCP project ID is required. Set it in the Control Panel or server .env.' });
    }

    if (!Array.isArray(messages) || messages.length === 0) {
      return res.status(400).json({ error: 'messages array is required' });
    }

    const contents = messages.map((m) => ({
      role: m.role === 'model' ? 'model' : 'user',
      parts: [{ text: m.text }],
    }));

    const vertexAI = getVertexClient(resolvedProject, resolvedLocation);
    const generativeModel = vertexAI.getGenerativeModel({
      model,
      generationConfig: {
        temperature: 0.7,
        maxOutputTokens: 4096,
      },
    });

    const result = await generativeModel.generateContent({ contents });
    const response = result.response;
    const text =
      response?.candidates?.[0]?.content?.parts?.[0]?.text ??
      'No response generated.';

    res.json({ reply: text });
  } catch (err) {
    console.error('Chat error:', err);
    const message = err instanceof Error ? err.message : 'Internal server error';
    res.status(500).json({ error: message });
  }
});

/* ── Image Generation Endpoint ─────────────────────────────── */

app.post('/api/gemini/image', async (req, res) => {
  try {
    const { prompt, imageData, project, location } = req.body;

    const resolvedProject = project || DEFAULT_PROJECT;
    const resolvedLocation = location || DEFAULT_LOCATION;

    if (!resolvedProject) {
      return res.status(400).json({ error: 'GCP project ID is required. Set it in the Control Panel or server .env.' });
    }

    if (!prompt) {
      return res.status(400).json({ error: 'prompt is required' });
    }

    const model = 'gemini-2.5-flash-image';

    const vertexAI = getVertexClient(resolvedProject, resolvedLocation);
    const generativeModel = vertexAI.getGenerativeModel({
      model,
      generationConfig: {
        responseModalities: ['TEXT', 'IMAGE'],
      },
    });

    // Build parts: optional image + text prompt
    const parts = [];
    let hasImage = false;

    if (imageData && typeof imageData === 'string') {
      const commaIdx = imageData.indexOf(',');
      if (commaIdx !== -1) {
        const header = imageData.substring(0, commaIdx); // e.g. "data:image/png;base64"
        const base64Data = imageData.substring(commaIdx + 1);
        const mimeMatch = header.match(/data:(image\/[a-zA-Z0-9+.-]+)/);
        if (mimeMatch && base64Data.length > 0) {
          console.log(`  ✓ Image received: ${mimeMatch[1]}, ~${Math.round(base64Data.length / 1024)}KB base64`);
          parts.push({
            inlineData: { mimeType: mimeMatch[1], data: base64Data },
          });
          hasImage = true;
        } else {
          console.log(`  ✗ Image data URL malformed — header: "${header.substring(0, 50)}"`);
        }
      } else {
        console.log(`  ✗ imageData present but no comma found (length: ${imageData.length})`);
      }
    } else {
      console.log('  (no image data provided — text-only generation)');
    }

    // When an image is provided, frame the prompt as an edit instruction
    const effectivePrompt = hasImage
      ? `I have provided an image. Please modify and return it based on this instruction: ${prompt}. Use the provided image as the starting point and base for generating the output image.`
      : prompt;

    console.log(`  Prompt (${hasImage ? 'edit' : 'generate'}): "${effectivePrompt.substring(0, 100)}..."`);

    parts.push({ text: effectivePrompt });

    console.log(`  → Sending ${parts.length} parts to Vertex AI:`, parts.map((p, i) =>
      p.inlineData ? `part[${i}]: inlineData (${p.inlineData.mimeType}, ${Math.round(p.inlineData.data.length / 1024)}KB)`
        : `part[${i}]: text (${p.text.substring(0, 60)}...)`
    ));

    const result = await generativeModel.generateContent({
      contents: [{ role: 'user', parts }],
    });

    const response = result.response;
    const responseParts = response?.candidates?.[0]?.content?.parts ?? [];

    let text = '';
    let imageUrl = null;

    for (const part of responseParts) {
      if (part.text) {
        text += part.text;
      }
      if (part.inlineData) {
        const { mimeType, data } = part.inlineData;
        imageUrl = `data:${mimeType};base64,${data}`;
      }
    }

    if (!imageUrl && !text) {
      text = 'No image was generated. Try a different prompt.';
    }

    res.json({ text, imageUrl });
  } catch (err) {
    console.error('Image generation error:', err);
    const message = err instanceof Error ? err.message : 'Internal server error';
    res.status(500).json({ error: message });
  }
});

/* ── Stock Chart Proxy ─────────────────────────────────────── */

app.get('/api/stocks/chart', async (req, res) => {
  try {
    const { symbol, range = '5d', interval = '1d' } = req.query;
    if (!symbol) {
      return res.status(400).json({ error: 'symbol query parameter is required' });
    }

    const url = `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(symbol)}?range=${range}&interval=${interval}&includePrePost=false`;
    const upstream = await fetch(url, {
      headers: { 'User-Agent': 'Mozilla/5.0' },
      signal: AbortSignal.timeout(8000),
    });

    if (!upstream.ok) {
      return res.status(upstream.status).json({ error: `Yahoo Finance returned ${upstream.status}` });
    }

    const data = await upstream.json();
    res.json(data);
  } catch (err) {
    console.error('Stock chart proxy error:', err);
    res.status(502).json({ error: 'Failed to fetch stock data' });
  }
});

/* ── News RSS Feed Proxy ──────────────────────────────────── */

app.get('/api/news/feed', async (req, res) => {
  try {
    const { url } = req.query;
    if (!url) {
      return res.status(400).json({ error: 'url query parameter is required' });
    }

    const upstream = await fetch(url, {
      headers: { 'User-Agent': 'Mozilla/5.0' },
      signal: AbortSignal.timeout(8000),
    });

    if (!upstream.ok) {
      return res.status(upstream.status).json({ error: `Feed returned ${upstream.status}` });
    }

    const text = await upstream.text();
    res.set('Content-Type', 'application/xml; charset=utf-8');
    res.send(text);
  } catch (err) {
    console.error('News feed proxy error:', err);
    res.status(502).json({ error: 'Failed to fetch news feed' });
  }
});

/* ── Start ─────────────────────────────────────────────────── */

app.listen(PORT, () => {
  console.log(`✦  JuniOS Vertex AI server running on http://localhost:${PORT}`);
  console.log(`   Default project: ${DEFAULT_PROJECT || '(not set)'} | Location: ${DEFAULT_LOCATION}`);
});
