/* ============================================
   ISYNQ — Storage Module
   ============================================ */

const IsynqStorage = {
  API_BASE_URL: 'http://localhost:5000/api',

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
      console.error('Fetch error:', err);
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
      avatar: user.avatar
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
        console.warn('Backend document sync failed, saving locally:', err);
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
        console.warn('Backend documents fetch failed, using local:', err);
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
        console.warn('Backend document delete failed:', err);
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

  async startMeeting(type = 'general') {
    const session = this.get('session');
    if (!session?.token) return null;

    try {
      const backendSession = await this.fetchAPI('/sessions/start', {
        method: 'POST',
        body: JSON.stringify({ type })
      });
      return backendSession;
    } catch (err) {
      console.warn('Backend session start failed:', err);
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
        const durationSeconds = meeting.duration
          ? (typeof meeting.duration === 'number' && meeting.duration < 10000
              ? meeting.duration * 60
              : meeting.duration)
          : undefined;

        await this.fetchAPI(`/sessions/${backendSessionId}/end`, {
          method: 'POST',
          body: JSON.stringify({
            duration: durationSeconds,
            questionsAnswered: meeting.questionsAnswered ?? 0
          })
        });
        meetingWithId.backendSessionId = backendSessionId;
      }
    } catch (err) {
      console.warn('Backend session sync failed, will remain local only:', err);
    }

    return meetingWithId;
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
        console.warn('Backend fetch failed, using local data:', err);
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
    if (session?.token) {
      try {
        await this.patchUserMe({ settings });
      } catch (err) {
        console.warn('Failed to sync settings to backend:', err);
      }
    }
  },

  async syncCreditsToBackend(creditsRemaining) {
    const session = this.get('session');
    if (!session?.token) return;
    try {
      await this.patchUserMe({ creditsRemaining });
    } catch (err) {
      console.warn('Failed to sync credits to backend:', err);
    }
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
