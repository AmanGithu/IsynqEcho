/* ============================================
   ISYNQ — Storage & Logger Module
   ============================================ */

const IsynqLogger = {
  level: localStorage.getItem('LOG_LEVEL') || 'info',
  levels: { debug: 0, info: 1, warn: 2, error: 3 },

  _shouldLog(level) {
    const current = this.levels[this.level.toLowerCase()] !== undefined ? this.levels[this.level.toLowerCase()] : 1;
    const target = this.levels[level.toLowerCase()] !== undefined ? this.levels[level.toLowerCase()] : 1;
    return target >= current;
  },

  _format(level, msg) {
    const time = new Date().toLocaleTimeString();
    return `[${time}] [${level.toUpperCase()}] ${msg}`;
  },

  log(level, msg, details) {
    if (!this._shouldLog(level)) return;
    const formatted = this._format(level, msg);
    const styles = {
      debug: 'color: #7f8c8d; font-weight: normal;',
      info: 'color: #3498db; font-weight: bold;',
      warn: 'color: #f39c12; font-weight: bold;',
      error: 'color: #e74c3c; font-weight: bold;'
    };

    if (details !== undefined && details !== null) {
      console.log(`%c${formatted}`, styles[level] || '', details);
    } else {
      console.log(`%c${formatted}`, styles[level] || '');
    }
  },

  debug(msg, details) { this.log('debug', msg, details); },
  info(msg, details) { this.log('info', msg, details); },
  warn(msg, details) { this.log('warn', msg, details); },
  error(msg, details) { this.log('error', msg, details); }
};

window.IsynqLogger = IsynqLogger;

const IsynqStorage = {
  API_BASE_URL:
    (typeof window !== 'undefined' && window.ISYNQ_CONFIG?.API_BASE_URL) ||
    'http://localhost:5000/api',

  apiUnreachableMessage() {
    return `Cannot reach API at ${this.API_BASE_URL.replace(/\/api$/, '')} — start the backend.`;
  },

  wrapFetchError(err) {
    if (err instanceof TypeError || err.message === 'Failed to fetch') {
      return new Error(this.apiUnreachableMessage());
    }
    return err;
  },

  // API helper
  async fetchAPI(endpoint, options = {}) {
    const session = this.get('session');
    const headers = {
      'Content-Type': 'application/json',
      ...options.headers
    };

    if (session?.token) {
      headers['Authorization'] = `Bearer ${session.token}`;
    }

    let response;
    try {
      response = await fetch(`${this.API_BASE_URL}${endpoint}`, {
        ...options,
        headers
      });
    } catch (err) {
      IsynqLogger.error('Fetch error:', err);
      throw this.wrapFetchError(err);
    }

    if (response.status === 401 || response.status === 403) {
      this.remove('session');
      this.remove('current_user');
      const path = window.location.pathname;
      const isAuthPage = path.includes('signin.html') ||
        path.includes('signup.html') ||
        path.includes('desktop-authorize.html');
      if (!options.skipAuthRedirect && !isAuthPage) {
        window.location.href = 'signin.html';
      }
      throw new Error('Session expired');
    }

    if (response.status === 204) {
      return null;
    }

    let data;
    try {
      data = await response.json();
    } catch {
      if (!response.ok) throw new Error('API Error');
      return null;
    }

    if (!response.ok) throw new Error(data.message || 'API Error');
    return data;
  },

  syncUserFromApi(user) {
    if (!user) return;
    IsynqStorage.set('current_user', {
      id: user.id,
      name: user.name,
      email: user.email,
      plan: user.plan || 'free',
      creditsRemaining: user.creditsRemaining ?? 5,
      avatar: user.avatar,
      role: user.role || 'user'
    });
    if (user.settings && typeof user.settings === 'object') {
      const local = IsynqStorage.get('user_settings') || {};
      IsynqStorage.set('user_settings', { ...local, ...user.settings });
    }
  },

  async patchUserMe(body) {
    const data = await this.fetchAPI('/users/me', {
      method: 'PATCH',
      body: JSON.stringify(body)
    });
    if (data?.user) this.syncUserFromApi(data.user);
    return data;
  },

  // localStorage helpers
  get(key) {
    try {
      const val = localStorage.getItem(`isynq_${key}`);
      return val ? JSON.parse(val) : null;
    } catch { return null; }
  },

  set(key, value) {
    localStorage.setItem(`isynq_${key}`, JSON.stringify(value));
  },

  remove(key) {
    localStorage.removeItem(`isynq_${key}`);
  },

  // IndexedDB for documents and meetings
  dbName: 'isynq_db',
  dbVersion: 1,

  openDB() {
    return new Promise((resolve, reject) => {
      const req = indexedDB.open(this.dbName, this.dbVersion);
      req.onupgradeneeded = (e) => {
        const db = e.target.result;
        if (!db.objectStoreNames.contains('documents')) {
          db.createObjectStore('documents', { keyPath: 'id' });
        }
        if (!db.objectStoreNames.contains('meetings')) {
          const meetingStore = db.createObjectStore('meetings', { keyPath: 'id' });
          meetingStore.createIndex('date', 'date');
        }
        if (!db.objectStoreNames.contains('responses')) {
          const respStore = db.createObjectStore('responses', { keyPath: 'id' });
          respStore.createIndex('meetingId', 'meetingId');
        }
      };
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    });
  },

  async addDocument(doc) {
    const session = this.get('session');
    if (session?.token) {
      try {
        const created = await this.fetchAPI('/context-docs', {
          method: 'POST',
          body: JSON.stringify({
            type: doc.type || 'notes',
            content: doc.content || doc.text || '',
            fileName: doc.fileName || doc.name
          })
        });
        const db = await this.openDB();
        await new Promise((resolve, reject) => {
          const tx = db.transaction('documents', 'readwrite');
          tx.objectStore('documents').put({
            ...doc,
            id: created.id,
            backendId: created.id,
            uploadedAt: new Date().toISOString()
          });
          tx.oncomplete = () => resolve();
          tx.onerror = () => reject(tx.error);
        });
        return;
      } catch (err) {
        IsynqLogger.warn('Backend document sync failed, saving locally:', err);
      }
    }

    const db = await this.openDB();
    return new Promise((resolve, reject) => {
      const tx = db.transaction('documents', 'readwrite');
      tx.objectStore('documents').put({
        ...doc,
        id: doc.id || crypto.randomUUID(),
        uploadedAt: new Date().toISOString()
      });
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
  },

  async getDocuments() {
    const session = this.get('session');
    if (session?.token) {
      try {
        const docs = await this.fetchAPI('/context-docs');
        const db = await this.openDB();
        const tx = db.transaction('documents', 'readwrite');
        const store = tx.objectStore('documents');
        docs.forEach(d => store.put({
          id: d.id,
          backendId: d.id,
          type: d.type,
          content: d.content,
          text: d.content,
          fileName: d.fileName,
          name: d.fileName,
          uploadedAt: d.createdAt
        }));
        return docs.map(d => ({
          id: d.id,
          type: d.type,
          content: d.content,
          text: d.content,
          fileName: d.fileName,
          name: d.fileName,
          uploadedAt: d.createdAt
        }));
      } catch (err) {
        IsynqLogger.warn('Backend documents fetch failed, using local:', err);
      }
    }

    const db = await this.openDB();
    return new Promise((resolve, reject) => {
      const tx = db.transaction('documents', 'readonly');
      const req = tx.objectStore('documents').getAll();
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    });
  },

  async deleteDocument(id) {
    const session = this.get('session');
    if (session?.token) {
      try {
        await this.fetchAPI(`/context-docs/${id}`, { method: 'DELETE' });
      } catch (err) {
        IsynqLogger.warn('Backend document delete failed:', err);
      }
    }

    const db = await this.openDB();
    return new Promise((resolve, reject) => {
      const tx = db.transaction('documents', 'readwrite');
      tx.objectStore('documents').delete(id);
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
  },

  // Assistants
  async getAssistants() {
    try {
      return await this.fetchAPI('/assistants');
    } catch (err) {
      IsynqLogger.warn('Failed to fetch assistants:', err);
      return [];
    }
  },

  async createAssistant({ name, type, instructions, color }) {
    return this.fetchAPI('/assistants', {
      method: 'POST',
      body: JSON.stringify({ name, type, instructions, color })
    });
  },

  async updateAssistant(id, { name, type, instructions, color }) {
    return this.fetchAPI(`/assistants/${id}`, {
      method: 'PATCH',
      body: JSON.stringify({ name, type, instructions, color })
    });
  },

  async deleteAssistant(id) {
    return this.fetchAPI(`/assistants/${id}`, { method: 'DELETE' });
  },

  // Admin (superadmin only — backend enforces via requireSuperAdmin middleware)
  async getAdminConfig() {
    return this.fetchAPI('/admin/config');
  },

  async updateAdminConfig(patch) {
    return this.fetchAPI('/admin/config', {
      method: 'PATCH',
      body: JSON.stringify(patch)
    });
  },

  async getAdminUsers({ search, page, pageSize } = {}) {
    const params = new URLSearchParams();
    if (search) params.set('search', search);
    if (page) params.set('page', page);
    if (pageSize) params.set('pageSize', pageSize);
    const qs = params.toString();
    return this.fetchAPI(`/admin/users${qs ? `?${qs}` : ''}`);
  },

  async updateAdminUser(id, patch) {
    return this.fetchAPI(`/admin/users/${id}`, {
      method: 'PATCH',
      body: JSON.stringify(patch)
    });
  },

  async adjustUserCredits(id, delta, reason) {
    return this.fetchAPI(`/admin/users/${id}/credits`, {
      method: 'POST',
      body: JSON.stringify({ delta, reason })
    });
  },

  async getAdminBillingOverview({ page, pageSize } = {}) {
    const params = new URLSearchParams();
    if (page) params.set('page', page);
    if (pageSize) params.set('pageSize', pageSize);
    const qs = params.toString();
    return this.fetchAPI(`/admin/billing/overview${qs ? `?${qs}` : ''}`);
  },

  async getAdminOverview() {
    return this.fetchAPI('/admin/overview');
  },

  async getAdminAiErrors() {
    return this.fetchAPI('/admin/ai-errors');
  },

  async getAdminAuditLogs({ page, pageSize } = {}) {
    const params = new URLSearchParams();
    if (page) params.set('page', page);
    if (pageSize) params.set('pageSize', pageSize);
    const qs = params.toString();
    return this.fetchAPI(`/admin/audit-logs${qs ? `?${qs}` : ''}`);
  },

  async testAdminProviderKey(provider, apiKey) {
    return this.fetchAPI('/admin/test-key', {
      method: 'POST',
      body: JSON.stringify({ provider, apiKey: apiKey || undefined })
    });
  },

  // Account / Billing
  async updateProfile({ firstName, lastName }) {
    return this.fetchAPI('/users/me', {
      method: 'PATCH',
      body: JSON.stringify({ firstName, lastName })
    });
  },

  async changePassword({ currentPassword, newPassword }) {
    return this.fetchAPI('/users/me/password', {
      method: 'POST',
      body: JSON.stringify({ currentPassword, newPassword })
    });
  },

  async purchaseCredits(hours) {
    return this.fetchAPI('/billing/purchase', {
      method: 'POST',
      body: JSON.stringify({ hours })
    });
  },

  async getTransactions() {
    try {
      const res = await this.fetchAPI('/billing/transactions');
      return res.transactions || [];
    } catch (err) {
      IsynqLogger.warn('Failed to fetch transactions:', err);
      return [];
    }
  },

  async getCreditHistory() {
    try {
      const res = await this.fetchAPI('/billing/credit-history');
      return res.entries || [];
    } catch (err) {
      IsynqLogger.warn('Failed to fetch credit history:', err);
      return [];
    }
  },

  ECHO_FINALIZE_PENDING_KEY: 'echo_finalize_pending',
  ECHO_BILLING_STATE_KEY: 'echo_billing_state',

  setEchoBillingState(state) {
    try {
      sessionStorage.setItem(this.ECHO_BILLING_STATE_KEY, JSON.stringify(state));
    } catch (e) {
      IsynqLogger.warn('Could not persist echo billing state:', e);
    }
  },

  getEchoBillingState() {
    try {
      const raw = sessionStorage.getItem(this.ECHO_BILLING_STATE_KEY);
      return raw ? JSON.parse(raw) : null;
    } catch {
      return null;
    }
  },

  clearEchoBillingState() {
    try {
      sessionStorage.removeItem(this.ECHO_BILLING_STATE_KEY);
    } catch {
      /* ignore */
    }
  },

  setEchoFinalizePending(payload) {
    try {
      sessionStorage.setItem(this.ECHO_FINALIZE_PENDING_KEY, JSON.stringify(payload));
    } catch (e) {
      IsynqLogger.warn('Could not persist echo finalize state:', e);
    }
  },

  getEchoFinalizePending() {
    try {
      const raw = sessionStorage.getItem(this.ECHO_FINALIZE_PENDING_KEY);
      return raw ? JSON.parse(raw) : null;
    } catch {
      return null;
    }
  },

  clearEchoFinalizePending() {
    try {
      sessionStorage.removeItem(this.ECHO_FINALIZE_PENDING_KEY);
    } catch {
      /* ignore */
    }
  },

  async addTranscriptEntry(backendSessionId, { speaker, text, isQuestion, response }) {
    if (!backendSessionId) return null;
    try {
      return await this.fetchAPI(`/sessions/${backendSessionId}/transcript`, {
        method: 'POST',
        body: JSON.stringify({ speaker, text, isQuestion, response })
      });
    } catch (err) {
      IsynqLogger.warn('Failed to persist transcript entry:', err);
      return null;
    }
  },

  async getSessions() {
    try {
      return await this.fetchAPI('/sessions/history');
    } catch (err) {
      IsynqLogger.warn('Failed to fetch sessions:', err);
      return [];
    }
  },

  async getSessionDetail(sessionId) {
    return this.fetchAPI(`/sessions/${sessionId}`);
  },

  async endBackendSession(backendSessionId, durationSeconds, questionsAnswered = 0) {
    const authSession = this.get('session');
    if (!authSession?.token || !backendSessionId) return null;

    const endResult = await this.fetchAPI(`/sessions/${backendSessionId}/end`, {
      method: 'POST',
      body: JSON.stringify({
        duration: durationSeconds,
        questionsAnswered
      })
    });
    if (endResult?.user) this.syncUserFromApi(endResult.user);
    return endResult;
  },

  async startMeeting(type = 'general', assistantId = null) {
    const session = this.get('session');
    if (!session?.token) return null;

    try {
      const backendSession = await this.fetchAPI('/sessions/start', {
        method: 'POST',
        body: JSON.stringify({ type, assistantId, platform: 'web' })
      });
      return backendSession;
    } catch (err) {
      IsynqLogger.warn('Backend session start failed:', err);
      return null;
    }
  },

  async saveMeeting(meeting) {
    const db = await this.openDB();
    const localId = meeting.id || crypto.randomUUID();
    const meetingWithId = { ...meeting, id: localId };

    await new Promise((resolve, reject) => {
      const tx = db.transaction('meetings', 'readwrite');
      tx.objectStore('meetings').put(meetingWithId);
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });

    const authSession = this.get('session');
    if (!authSession?.token) return meetingWithId;

    try {
      let backendSessionId = meeting.backendSessionId;

      if (!backendSessionId) {
        const started = await this.fetchAPI('/sessions/start', {
          method: 'POST',
          body: JSON.stringify({ type: meeting.type || 'general' })
        });
        backendSessionId = started.id;
      }

      if (backendSessionId) {
        const durationSeconds = meeting.duration;

        const endResult = await this.fetchAPI(`/sessions/${backendSessionId}/end`, {
          method: 'POST',
          body: JSON.stringify({
            duration: durationSeconds,
            questionsAnswered: meeting.questionsAnswered ?? 0
          })
        });
        meetingWithId.backendSessionId = backendSessionId;
        if (endResult?.user) {
          this.syncUserFromApi(endResult.user);
        }
        return { meeting: meetingWithId, user: endResult?.user };
      }
    } catch (err) {
      IsynqLogger.warn('Backend session sync failed, will remain local only:', err);
    }

    return { meeting: meetingWithId };
  },

  async getMeetings() {
    const session = this.get('session');
    if (session?.token) {
      try {
        let meetings = await this.fetchAPI('/sessions/history');
        meetings = meetings.map(m => ({
          ...m,
          date: m.date || m.startTime || new Date().toISOString()
        }));

        const db = await this.openDB();
        const tx = db.transaction('meetings', 'readwrite');
        const store = tx.objectStore('meetings');
        meetings.forEach(m => store.put(m));
        return meetings.sort((a, b) => new Date(b.date) - new Date(a.date));
      } catch (err) {
        IsynqLogger.warn('Backend fetch failed, using local data:', err);
      }
    }

    const db = await this.openDB();
    return new Promise((resolve, reject) => {
      const tx = db.transaction('meetings', 'readonly');
      const req = tx.objectStore('meetings').getAll();
      req.onsuccess = () => resolve(req.result.sort((a, b) => new Date(b.date) - new Date(a.date)));
      req.onerror = () => reject(req.error);
    });
  },

  async saveUserSettings(settings) {
    this.set('user_settings', settings);
    const session = this.get('session');
    if (!session?.token) {
      return { synced: false };
    }
    try {
      await this.patchUserMe({ settings });
      return { synced: true };
    } catch (err) {
      IsynqLogger.warn('Failed to sync settings to backend:', err);
      return { synced: false };
    }
  },

  async syncCreditsToBackend(creditsRemaining) {
    const session = this.get('session');
    if (!session?.token) return;
    try {
      await this.patchUserMe({ creditsRemaining });
    } catch (err) {
      IsynqLogger.warn('Failed to sync credits to backend:', err);
    }
  },

  // Resumes
  async getResumes() {
    try {
      return await this.fetchAPI('/resumes');
    } catch (err) {
      IsynqLogger.warn('Failed to fetch resumes:', err);
      return [];
    }
  },

  async getResume(id) {
    return this.fetchAPI(`/resumes/${id}`);
  },

  async createResume() {
    return this.fetchAPI('/resumes', { method: 'POST' });
  },

  async updateResume(id, patch) {
    return this.fetchAPI(`/resumes/${id}`, { method: 'PATCH', body: JSON.stringify(patch) });
  },

  async renameResume(id, title) {
    return this.fetchAPI(`/resumes/${id}/rename`, { method: 'PATCH', body: JSON.stringify({ title }) });
  },

  async deleteResume(id) {
    return this.fetchAPI(`/resumes/${id}`, { method: 'DELETE' });
  },

  async duplicateResume(id) {
    return this.fetchAPI(`/resumes/${id}/duplicate`, { method: 'POST' });
  },

  async importResumeFile(file, source) {
    const fileBase64 = await this._fileToBase64(file);
    return this.fetchAPI('/resumes/import', {
      method: 'POST',
      body: JSON.stringify({ fileBase64, fileName: file.name, mimeType: file.type, source })
    });
  },

  _fileToBase64(file) {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(String(reader.result).split(',')[1] || '');
      reader.onerror = () => reject(reader.error);
      reader.readAsDataURL(file);
    });
  },

  async getReadiness(resumeId) {
    return this.fetchAPI(`/resumes/${resumeId}/readiness`);
  },

  async matchAgainstJd(resumeId, jd) {
    return this.fetchAPI(`/resumes/${resumeId}/match`, { method: 'POST', body: JSON.stringify({ jd }) });
  },

  async getTailorContext(resumeId) {
    return this.fetchAPI(`/resumes/${resumeId}/tailor-context`);
  },

  async runTailor(resumeId, jd, intensity) {
    return this.fetchAPI(`/resumes/${resumeId}/tailor`, { method: 'POST', body: JSON.stringify({ jd, intensity }) });
  },

  async applyTailoredVersion(resumeId, payload) {
    return this.fetchAPI(`/resumes/${resumeId}/tailor/apply`, { method: 'POST', body: JSON.stringify(payload) });
  },

  async getResumeVersion(resumeId, versionId) {
    return this.fetchAPI(`/resumes/${resumeId}/versions/${versionId}`);
  },

  async updateResumeVersion(resumeId, versionId, patch) {
    return this.fetchAPI(`/resumes/${resumeId}/versions/${versionId}`, { method: 'PATCH', body: JSON.stringify(patch) });
  },

  async duplicateResumeVersion(resumeId, versionId) {
    return this.fetchAPI(`/resumes/${resumeId}/versions/${versionId}/duplicate`, { method: 'POST' });
  },

  async deleteResumeVersion(resumeId, versionId) {
    return this.fetchAPI(`/resumes/${resumeId}/versions/${versionId}`, { method: 'DELETE' });
  },

  async rewriteBullet(resumeId, bullet, tone) {
    return this.fetchAPI(`/resumes/${resumeId}/ai/rewrite-bullet`, { method: 'POST', body: JSON.stringify({ bullet, tone }) });
  },

  async generateSummary(resumeId, resume, jd) {
    return this.fetchAPI(`/resumes/${resumeId}/ai/generate-summary`, { method: 'POST', body: JSON.stringify({ resume, jd }) });
  },

  async getCoverLetter(resumeId) {
    return this.fetchAPI(`/resumes/${resumeId}/cover-letter`);
  },

  async generateCoverLetter(resumeId, input) {
    return this.fetchAPI(`/resumes/${resumeId}/cover-letter/generate`, { method: 'POST', body: JSON.stringify(input) });
  },

  async saveCoverLetter(resumeId, rec) {
    return this.fetchAPI(`/resumes/${resumeId}/cover-letter`, { method: 'PUT', body: JSON.stringify(rec) });
  },

  async getInterviewPrep(resumeId) {
    return this.fetchAPI(`/resumes/${resumeId}/interview-prep`);
  },

  async generateInterviewPrep(resumeId, input) {
    return this.fetchAPI(`/resumes/${resumeId}/interview-prep/generate`, { method: 'POST', body: JSON.stringify(input) });
  },

  /** Downloads a binary export (DOCX) endpoint via an authenticated fetch,
      since fetchAPI() assumes a JSON body. */
  async downloadFile(endpoint, fallbackName) {
    const session = this.get('session');
    const headers = {};
    if (session?.token) headers['Authorization'] = `Bearer ${session.token}`;
    let response;
    try {
      response = await fetch(`${this.API_BASE_URL}${endpoint}`, { headers });
    } catch (err) {
      throw this.wrapFetchError(err);
    }
    if (!response.ok) {
      let message = 'Export failed';
      try { message = (await response.json()).message || message; } catch { /* not JSON */ }
      throw new Error(message);
    }
    const blob = await response.blob();
    const disposition = response.headers.get('Content-Disposition') || '';
    const match = disposition.match(/filename="([^"]+)"/);
    const fileName = match ? match[1] : fallbackName;
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = fileName;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
  },

  async clearAllData() {
    const db = await this.openDB();
    const stores = ['documents', 'meetings', 'responses'];
    for (const store of stores) {
      const tx = db.transaction(store, 'readwrite');
      tx.objectStore(store).clear();
    }
    const keys = Object.keys(localStorage).filter(k => k.startsWith('isynq_'));
    keys.forEach(k => localStorage.removeItem(k));
  }
};

window.IsynqStorage = IsynqStorage;
