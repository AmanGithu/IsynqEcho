/* ============================================
   ISYNQ — LLM Integration Engine
   ============================================ */

const LLMEngine = {
  provider: 'openai',
  apiKey: '',
  model: '',
  contextDocs: '',
  conversationHistory: [],
  maxContextTokens: 6000,

  initialize(config = {}) {
    this.provider = config.provider || IsynqStorage.get('user_settings')?.preferredLLM || 'openai';
    this.apiKey = config.apiKey || IsynqStorage.get('user_settings')?.apiKey || '';
    this.model = config.model || (this.provider === 'openai' ? 'gpt-4o-mini' : 'gemini-2.0-flash');
    this.conversationHistory = [];
    this.contextDocs = '';
  },

  setProvider(provider, apiKey, model) {
    this.provider = provider;
    this.apiKey = apiKey;
    this.model = model || (provider === 'openai' ? 'gpt-4o-mini' : provider === 'ollama' ? 'llama3' : 'gemini-2.0-flash');
    const settings = IsynqStorage.get('user_settings') || {};
    settings.preferredLLM = provider;
    settings.apiKey = apiKey;
    IsynqStorage.set('user_settings', settings);
  },

  setContext(documents) {
    const parts = [];
    if (documents.resume) parts.push(`--- Resume/CV ---\n${documents.resume}`);
    if (documents.jobDescription) parts.push(`--- Job Description ---\n${documents.jobDescription}`);
    if (documents.notes) parts.push(`--- Additional Notes ---\n${documents.notes}`);
    if (documents.custom) parts.push(`--- Custom Context ---\n${documents.custom}`);
    this.contextDocs = parts.join('\n\n');
  },

  addToHistory(role, content) {
    this.conversationHistory.push({ role, content, timestamp: Date.now() });
    // Keep sliding window of last 20 exchanges
    if (this.conversationHistory.length > 40) {
      this.conversationHistory = this.conversationHistory.slice(-40);
    }
  },

  buildSystemPrompt(format) {
    const formatInstructions = {
      short: 'Respond in 2-3 concise sentences. Be direct and confident. No filler words.',
      star: 'Use the STAR format:\n**Situation:** Brief context\n**Task:** What was required\n**Action:** What you did (use "I" statements)\n**Result:** Quantifiable outcome\n\nKeep each section to 1-2 sentences.',
      detailed: 'Provide a thorough, well-structured answer with clear explanations. Use paragraphs. Be comprehensive but stay relevant.',
      coding: 'Provide the solution with clean, working code. Explain your approach briefly, then give the code with comments.'
    };

    return `You are Isynq, a real-time AI meeting copilot. You help users answer questions confidently during live meetings, interviews, and calls.

RULES:
- Give answers the user can speak out loud naturally
- Reference the user's background/documents when relevant
- Be confident and assertive in tone
- Never say "I think" or "maybe" — be definitive
- If it's a technical question, be precise
- If screen context is provided, incorporate what's visible on screen
- Never mention that you are an AI assistant

FORMAT: ${formatInstructions[format] || formatInstructions.short}

${this.contextDocs ? `USER'S BACKGROUND:\n${this.contextDocs}` : ''}`;
  },

  buildMessages(question, format, screenContext) {
    const messages = [{ role: 'system', content: this.buildSystemPrompt(format) }];

    // Add conversation history for context
    const recentHistory = this.conversationHistory.slice(-10);
    for (const entry of recentHistory) {
      messages.push({ role: entry.role === 'interviewer' ? 'user' : 'assistant', content: entry.content });
    }

    // Current question with screen context
    let userMessage = `Question asked: "${question}"`;
    if (screenContext) {
      userMessage += `\n\nScreen context: ${screenContext}`;
    }
    userMessage += '\n\nProvide the best answer the user should say:';
    messages.push({ role: 'user', content: userMessage });

    return messages;
  },

  async sendQuery(question, format = 'short', screenContext = null) {
    if (!this.apiKey && this.provider !== 'ollama') {
      return { answer: '⚠️ Please configure your API key in Settings to get AI-powered responses.', error: true };
    }

    const messages = this.buildMessages(question, format, screenContext);

    try {
      if (this.provider === 'openai') {
        return await this.callOpenAI(messages);
      } else if (this.provider === 'ollama') {
        return await this.callOllama(messages);
      } else {
        return await this.callGemini(messages);
      }
    } catch (error) {
      console.error('LLM Error:', error);
      return { answer: `⚠️ Error: ${error.message}. Check your API key/URL and try again.`, error: true };
    }
  },

  async callOpenAI(messages) {
    const response = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${this.apiKey}` },
      body: JSON.stringify({ model: this.model, messages, temperature: 0.7, max_tokens: 800 })
    });

    if (!response.ok) {
      const err = await response.json().catch(() => ({}));
      throw new Error(err.error?.message || `OpenAI API error: ${response.status}`);
    }

    const data = await response.json();
    return { answer: data.choices[0].message.content, tokens: data.usage?.total_tokens || 0 };
  },

  async callGemini(messages) {
    // Convert OpenAI-style messages to Gemini format
    const systemInstruction = messages.find(m => m.role === 'system')?.content || '';
    const contents = messages.filter(m => m.role !== 'system').map(m => ({
      role: m.role === 'assistant' ? 'model' : 'user',
      parts: [{ text: m.content }]
    }));

    const response = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/${this.model}:generateContent?key=${this.apiKey}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          system_instruction: { parts: [{ text: systemInstruction }] },
          contents,
          generationConfig: { temperature: 0.7, maxOutputTokens: 800 }
        })
      }
    );

    if (!response.ok) {
      const err = await response.json().catch(() => ({}));
      throw new Error(err.error?.message || `Gemini API error: ${response.status}`);
    }

    const data = await response.json();
    const text = data.candidates?.[0]?.content?.parts?.[0]?.text || 'No response generated.';
    return { answer: text, tokens: 0 };
  },

  async callOllama(messages) {
    const baseUrl = this.apiKey || 'http://localhost:11434';
    const model = this.model || 'llama3';
    
    const ollamaMessages = messages.map(m => ({
      role: m.role,
      content: m.content
    }));

    const response = await fetch(`${baseUrl}/api/chat`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ model: model, messages: ollamaMessages, stream: false })
    });

    if (!response.ok) {
      throw new Error(`Ollama error: ${response.status}. Make sure Ollama is running and CORS is enabled.`);
    }

    const data = await response.json();
    return { answer: data.message?.content || 'No response generated.', tokens: data.eval_count || 0 };
  },

  // Streaming support for OpenAI
  async streamQuery(question, format, screenContext, onChunk) {
    if (!this.apiKey) {
      onChunk('⚠️ Please configure your API key in Settings.');
      return;
    }

    const messages = this.buildMessages(question, format, screenContext);

    if (this.provider === 'openai') {
      const response = await fetch('https://api.openai.com/v1/chat/completions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${this.apiKey}` },
        body: JSON.stringify({ model: this.model, messages, temperature: 0.7, max_tokens: 800, stream: true })
      });

      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let fullText = '';

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        const chunk = decoder.decode(value);
        const lines = chunk.split('\n').filter(l => l.startsWith('data: '));
        for (const line of lines) {
          const data = line.slice(6);
          if (data === '[DONE]') continue;
          try {
            const parsed = JSON.parse(data);
            const token = parsed.choices[0]?.delta?.content || '';
            fullText += token;
            onChunk(fullText);
          } catch {}
        }
      }
      return fullText;
    } else {
      // Gemini doesn't stream the same way, so use regular call
      const result = await this.sendQuery(question, format, screenContext);
      onChunk(result.answer);
      return result.answer;
    }
  },

  clearHistory() {
    this.conversationHistory = [];
  }
};

window.LLMEngine = LLMEngine;
