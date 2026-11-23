import express from "express";
import path from "path";
import { createServer as createViteServer } from "vite";
import { GoogleGenAI, Modality } from "@google/genai";

async function startServer() {
  const app = express();
  const PORT = 3000;
  
  app.use(express.json());

  // Gemini Setup
  const getAIClient = () => {
    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) return null;
    return new GoogleGenAI({
      apiKey,
      httpOptions: {
        headers: {
          'User-Agent': 'aistudio-build'
        }
      }
    });
  };

  // Health check endpoint
  app.get("/api/health", (_req, res) => {
    res.json({ ok: true, aiConfigured: Boolean(process.env.GEMINI_API_KEY) });
  });

  // Music Generation API
  app.post("/api/generate-music", async (req, res) => {
    const { prompt, model } = req.body || {};
    const ai = getAIClient();
    if (!ai) {
      return res.status(503).json({ error: "AI music generation is not configured on the server." });
    }
    if (!prompt || typeof prompt !== 'string') {
      return res.status(400).json({ error: "A valid prompt is required." });
    }

    try {
      const response = await ai.models.generateContentStream({
        model: model || "gemini-4-hydrogen",
        contents: prompt,
      });

      let audioBase64 = "";

      for await (const chunk of response) {
        const parts = chunk.candidates?.[0]?.content?.parts;
        if (!parts) continue;

        for (const part of parts) {
          if (part.inlineData?.data) {
            audioBase64 += part.inlineData.data;
          }
        }
      }

      res.json({ audioBase64 });
    } catch (error: any) {
      console.error("Music API Error:", error);
      if (error.status === 429) {
        res.status(429).json({ error: "Music generation quota exceeded. Please try again later." });
      } else {
        res.status(500).json({ error: "Failed to generate music" });
      }
    }
  });

  // AI Coach Chat API
  app.post("/api/chat", async (req, res) => {
    const { messages, systemInstruction } = req.body || {};
    const ai = getAIClient();

    if (!ai) {
      return res.status(503).json({
        error: "GEMINI_API_KEY not configured",
        fallbackRecommended: true
      });
    }

    if (!Array.isArray(messages) || messages.length === 0) {
      return res.status(400).json({ error: "Messages array is required." });
    }

    try {
      const response = await ai.models.generateContent({
        model: "gemini-4-hydrogen",
        contents: messages.map((m: any) => ({
          role: m.role === 'assistant' ? 'model' : 'user',
          parts: [{ text: String(m.content || '') }]
        })),
        config: {
          systemInstruction: typeof systemInstruction === 'string' ? systemInstruction : undefined,
          temperature: 0.7,
        }
      });

      res.json({ text: response.text || "I'm here to support your journey. What would you like to focus on next?" });
    } catch (error: any) {
      console.error("AI Coach API Error:", error);
      if (error.status === 429) {
        res.status(429).json({ error: "AI rate limit reached. Please wait a moment and try again." });
      } else {
        res.status(500).json({ error: "Failed to connect to AI Coach." });
      }
    }
  });

  // Vite middleware for development
  if (process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), 'dist');
    app.use(express.static(distPath));
    app.get('*', (req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`Server running on http://localhost:${PORT}`);
  });
}

startServer();
