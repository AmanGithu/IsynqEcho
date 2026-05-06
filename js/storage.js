/* ============================================
   ISYNQ — Storage Module
   ============================================ */

const IsynqStorage = {
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
    const db = await this.openDB();
    return new Promise((resolve, reject) => {
      const tx = db.transaction('meetings', 'readwrite');
      tx.objectStore('meetings').put({ ...meeting, id: meeting.id || crypto.randomUUID() });
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
  },

  async getMeetings() {
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
