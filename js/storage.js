/* ============================================
   ISYNQ — Storage Module
   ============================================ */

const IsynqStorage = {
  API_BASE_URL: 'http://localhost:5000/api',

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

    try {
      const response = await fetch(`${this.API_BASE_URL}${endpoint}`, {
        ...options,
        headers
      });

      if (response.status === 401) {
        // Token expired or invalid
        this.remove('session');
        this.remove('current_user');
        if (!window.location.pathname.includes('signin.html')) {
          window.location.href = '/signin.html';
        }
        throw new Error('Session expired');
      }

      const data = await response.json();
      if (!response.ok) throw new Error(data.message || 'API Error');
      return data;
    } catch (err) {
      console.error('Fetch error:', err);
      throw err;
    }
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
    const db = await this.openDB();
    return new Promise((resolve, reject) => {
      const tx = db.transaction('documents', 'readwrite');
      tx.objectStore('documents').put({ ...doc, id: doc.id || crypto.randomUUID(), uploadedAt: new Date().toISOString() });
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
  },

  async getDocuments() {
    const db = await this.openDB();
    return new Promise((resolve, reject) => {
      const tx = db.transaction('documents', 'readonly');
      const req = tx.objectStore('documents').getAll();
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    });
  },

  async deleteDocument(id) {
    const db = await this.openDB();
    return new Promise((resolve, reject) => {
      const tx = db.transaction('documents', 'readwrite');
      tx.objectStore('documents').delete(id);
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
  },

  async saveMeeting(meeting) {
    // 1. Save to local IndexedDB first (Offline-first)
    const db = await this.openDB();
    const localId = meeting.id || crypto.randomUUID();
    const meetingWithId = { ...meeting, id: localId };
    
    await new Promise((resolve, reject) => {
      const tx = db.transaction('meetings', 'readwrite');
      tx.objectStore('meetings').put(meetingWithId);
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });

    // 2. Try to sync with backend if authenticated
    const session = this.get('session');
    if (session?.token) {
      try {
        await this.fetchAPI('/sessions', {
          method: 'POST',
          body: JSON.stringify({
            id: localId,
            type: meeting.type || 'general',
            title: meeting.title,
            duration: meeting.duration,
            date: meeting.date || new Date().toISOString()
          })
        });
      } catch (err) {
        console.warn('Backend sync failed, will remain local only for now:', err);
      }
    }
  },

  async getMeetings() {
    // Try backend first
    const session = this.get('session');
    if (session?.token) {
      try {
        let meetings = await this.fetchAPI('/sessions');
        // Map backend startTime to frontend date
        meetings = meetings.map(m => ({
          ...m,
          date: m.date || m.startTime || new Date().toISOString()
        }));
        
        // Cache in local IndexedDB
        const db = await this.openDB();
        const tx = db.transaction('meetings', 'readwrite');
        const store = tx.objectStore('meetings');
        meetings.forEach(m => store.put(m));
        return meetings.sort((a, b) => new Date(b.date) - new Date(a.date));
      } catch (err) {
        console.warn('Backend fetch failed, using local data:', err);
      }
    }

    // Fallback to local IndexedDB
    const db = await this.openDB();
    return new Promise((resolve, reject) => {
      const tx = db.transaction('meetings', 'readonly');
      const req = tx.objectStore('meetings').getAll();
      req.onsuccess = () => resolve(req.result.sort((a, b) => new Date(b.date) - new Date(a.date)));
      req.onerror = () => reject(req.error);
    });
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
