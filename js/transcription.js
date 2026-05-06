/* ============================================
   ISYNQ — Real-Time Transcription Service
   Uses Web Speech API for speech-to-text
   ============================================ */

const TranscriptionService = {
  recognition: null,
  isListening: false,
  transcript: [],
  currentInterim: '',
  onResultCallback: null,
  onQuestionCallback: null,
  onStatusCallback: null,
  questionPatterns: [
    /^(what|how|why|when|where|who|which|can you|could you|tell me|describe|explain|walk me|give me|have you|do you|did you|are you|is there|would you)/i,
    /\?$/,
    /^(so|and|but|now)\s+(what|how|why|tell|can|could|walk|describe|explain)/i,
  ],
  silenceTimer: null,
  lastSpeechTime: 0,

  initialize() {
    const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SpeechRecognition) {
      console.error('Speech Recognition not supported');
      if (this.onStatusCallback) this.onStatusCallback('unsupported');
      return false;
    }

    this.recognition = new SpeechRecognition();
    this.recognition.continuous = true;
    this.recognition.interimResults = true;
    this.recognition.lang = 'en-US';
    this.recognition.maxAlternatives = 1;

    this.recognition.onstart = () => {
      this.isListening = true;
      if (this.onStatusCallback) this.onStatusCallback('listening');
    };

    this.recognition.onresult = (event) => {
      this.lastSpeechTime = Date.now();
      let interimTranscript = '';
      let finalTranscript = '';

      for (let i = event.resultIndex; i < event.results.length; i++) {
        const result = event.results[i];
        if (result.isFinal) {
          finalTranscript += result[0].transcript;
        } else {
          interimTranscript += result[0].transcript;
        }
      }

      this.currentInterim = interimTranscript;

      if (finalTranscript.trim()) {
        const entry = {
          text: finalTranscript.trim(),
          timestamp: Date.now(),
          speaker: this.detectSpeaker(finalTranscript),
          isQuestion: this.isQuestion(finalTranscript.trim()),
          confidence: event.results[event.resultIndex]?.[0]?.confidence || 0
        };

        this.transcript.push(entry);

        if (this.onResultCallback) {
          this.onResultCallback(entry, false);
        }

        if (entry.isQuestion && this.onQuestionCallback) {
          this.onQuestionCallback(entry);
        }
      } else if (interimTranscript.trim() && this.onResultCallback) {
        this.onResultCallback({ text: interimTranscript.trim(), speaker: 'unknown', isQuestion: false }, true);
      }

      // Reset silence detection
      this.resetSilenceTimer();
    };

    this.recognition.onerror = (event) => {
      console.error('Speech recognition error:', event.error);
      if (event.error === 'not-allowed') {
        if (this.onStatusCallback) this.onStatusCallback('denied');
      } else if (event.error === 'no-speech') {
        // Auto-restart on no-speech
        if (this.isListening) this.restartRecognition();
      } else if (event.error !== 'aborted') {
        if (this.isListening) this.restartRecognition();
      }
    };

    this.recognition.onend = () => {
      if (this.isListening) {
        // Auto-restart if still supposed to be listening
        setTimeout(() => {
          if (this.isListening) {
            try { this.recognition.start(); } catch (e) { console.log('Restart failed:', e); }
          }
        }, 100);
      } else {
        if (this.onStatusCallback) this.onStatusCallback('stopped');
      }
    };

    return true;
  },

  start() {
    if (!this.recognition) {
      if (!this.initialize()) return false;
    }
    try {
      this.isListening = true;
      this.recognition.start();
      this.lastSpeechTime = Date.now();
      this.resetSilenceTimer();
      return true;
    } catch (e) {
      console.error('Failed to start recognition:', e);
      return false;
    }
  },

  stop() {
    this.isListening = false;
    if (this.silenceTimer) clearTimeout(this.silenceTimer);
    if (this.recognition) {
      try { this.recognition.stop(); } catch (e) {}
    }
  },

  restartRecognition() {
    try {
      this.recognition.stop();
    } catch (e) {}
    setTimeout(() => {
      if (this.isListening) {
        try { this.recognition.start(); } catch (e) {}
      }
    }, 300);
  },

  resetSilenceTimer() {
    if (this.silenceTimer) clearTimeout(this.silenceTimer);
    this.silenceTimer = setTimeout(() => {
      if (this.isListening && this.onStatusCallback) {
        this.onStatusCallback('silence');
      }
    }, 5000);
  },

  isQuestion(text) {
    const cleaned = text.trim();
    for (const pattern of this.questionPatterns) {
      if (pattern.test(cleaned)) return true;
    }
    // Check for sentences ending in rising intonation patterns
    if (cleaned.endsWith('?')) return true;
    // Common interview question starters
    const starters = ['tell me about', 'walk me through', 'can you', 'could you', 'describe a time', 'give an example', 'what would you', 'how would you', 'why do you', 'why did you', 'what is your', 'what are your'];
    const lower = cleaned.toLowerCase();
    return starters.some(s => lower.startsWith(s));
  },

  detectSpeaker(text) {
    // Simple heuristic: questions are likely from interviewer
    if (this.isQuestion(text)) return 'interviewer';
    return 'you';
  },

  onResult(callback) { this.onResultCallback = callback; },
  onQuestionDetected(callback) { this.onQuestionCallback = callback; },
  onStatusChange(callback) { this.onStatusCallback = callback; },

  getFullTranscript() {
    return this.transcript.map(t => `[${t.speaker}]: ${t.text}`).join('\n');
  },

  getRecentContext(count = 10) {
    return this.transcript.slice(-count).map(t => `[${t.speaker}]: ${t.text}`).join('\n');
  },

  clearTranscript() {
    this.transcript = [];
    this.currentInterim = '';
  },

  isSupported() {
    return !!(window.SpeechRecognition || window.webkitSpeechRecognition);
  }
};

window.TranscriptionService = TranscriptionService;
