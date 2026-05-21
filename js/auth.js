/* ============================================
   ISYNQ — Auth Module
   ============================================ */

const IsynqAuth = {
  _persistSession(user, token) {
    const expiresAt = Date.now() + 7 * 24 * 60 * 60 * 1000;
    IsynqStorage.set('session', { token, userId: user.id, expiresAt });
    IsynqStorage.syncUserFromApi(user);
  },

  async register({ name, email, password }) {
    const data = await IsynqStorage.fetchAPI('/auth/register', {
      method: 'POST',
      body: JSON.stringify({ name, email, password })
    });

    const { user, token } = data;
    this._persistSession(user, token);

    const existingSettings = IsynqStorage.get('user_settings');
    if (!existingSettings) {
      const defaultSettings = {
        responseFormat: 'short',
        preferredLLM: 'openai',
        apiKey: '',
        darkMode: false
      };
      IsynqStorage.set('user_settings', defaultSettings);
      try {
        await IsynqStorage.patchUserMe({ settings: defaultSettings });
      } catch (err) {
        console.warn('Could not sync default settings:', err);
      }
    }

    return user;
  },

  async login({ email, password }) {
    const data = await IsynqStorage.fetchAPI('/auth/login', {
      method: 'POST',
      body: JSON.stringify({ email, password })
    });

    const { user, token } = data;
    this._persistSession(user, token);
    return user;
  },

  socialLogin(provider) {
    throw new Error(`${provider} sign-in is coming soon. Use email and password for now.`);
  },

  isAuthenticated() {
    const session = IsynqStorage.get('session');
    if (!session || !session.token) return false;

    if (Date.now() > session.expiresAt) {
      this.logout();
      return false;
    }
    return true;
  },

  async validateSession(options = {}) {
    const { soft = false } = options;
    if (!this.isAuthenticated()) return false;

    try {
      const data = await IsynqStorage.fetchAPI('/auth/me', {
        skipAuthRedirect: true
      });
      if (data?.user) {
        IsynqStorage.syncUserFromApi(data.user);
        return true;
      }
      if (!soft) this.logout();
      return false;
    } catch {
      if (!soft) this.logout();
      return false;
    }
  },

  getCurrentUser() {
    if (!this.isAuthenticated()) return null;
    return IsynqStorage.get('current_user');
  },

  logout() {
    IsynqStorage.remove('session');
    IsynqStorage.remove('current_user');
  },

  async requireAuth() {
    if (!this.isAuthenticated() || !(await this.validateSession())) {
      window.location.href = 'signin.html';
      return false;
    }
    return true;
  }
};

window.IsynqAuth = IsynqAuth;
