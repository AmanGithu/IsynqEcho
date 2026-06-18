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
    const settings = IsynqStorage.get('user_settings') || {};
    this.provider = config.provider || settings.preferredLLM || 'openai';
    this.apiKey = config.apiKey ?? settings.apiKey ?? '';
    const defaultModel =
      this.provider === 'openai' ? 'gpt-4o-mini' :
      this.provider === 'gemini' ? 'gemini-2.0-flash' :
      'llama3';
    this.model = config.model || settings.model || defaultModel;
    this.conversationHistory = [];
    this.contextDocs = '';
  },

  isConfigured() {
    if (this.provider === 'ollama') return true;
    return !!(this.apiKey && String(this.apiKey).trim());
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
    const messages = this.buildMessages(question, format, screenContext);
    IsynqLogger.info(`Sending query to backend AI: "${question.substring(0, 60)}..." (format: ${format})`);

    try {
      // Use IsynqStorage.fetchAPI to route through backend
      const data = await IsynqStorage.fetchAPI('/ai/query', {
        method: 'POST',
        body: JSON.stringify({
          provider: this.provider,
          model: this.model,
          messages,
          apiKey: this.apiKey // Optional: client-provided key
        })
      });

      IsynqLogger.info('Query completed successfully');
      return { 
        answer: data.answer, 
        tokens: data.usage?.total_tokens || 0 
      };
    } catch (error) {
      IsynqLogger.error('LLM Engine Error (via Backend):', error);
      return { 
        answer: `⚠️ Error: ${error.message}. Check your backend connection or API settings.`, 
        error: true 
      };
    }
  },

  // Streaming support (Placeholder for backend streaming)
  async streamQuery(question, format, screenContext, onChunk) {
    // For now, redirect to non-streaming backend call as the simple backend doesn't support SSE yet
    const result = await this.sendQuery(question, format, screenContext);
    onChunk(result.answer);
    return result.answer;
  },

  clearHistory() {
    this.conversationHistory = [];
  }
};

window.LLMEngine = LLMEngine;
