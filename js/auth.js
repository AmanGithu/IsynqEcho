/* ============================================
   ISYNQ — Auth Module
   ============================================ */

const IsynqAuth = {
  _persistSession(user, token) {
    const expiresAt = Date.now() + 7 * 24 * 60 * 60 * 1000;
    IsynqStorage.set('session', { token, userId: user.id, expiresAt });
    IsynqStorage.syncUserFromApi(user);
  },

  async completeAuthExchange(code) {
    IsynqLogger.debug('Completing auth exchange...');
    const data = await IsynqStorage.fetchAPI('/auth/exchange', {
      method: 'POST',
      body: JSON.stringify({ code })
    });
    const { user, token } = data;
    this._persistSession(user, token);
    IsynqLogger.info(`Auth exchange completed successfully for user: ${user.id}`);
    return user;
  },

  async register({ name, email, password }) {
    IsynqLogger.info(`Registering new user with email: ${email}`);
    const data = await IsynqStorage.fetchAPI('/auth/register', {
      method: 'POST',
      body: JSON.stringify({ name, email, password })
    });

    const { user, token } = data;
    this._persistSession(user, token);
    IsynqLogger.info(`Registration successful. Session persisted for user: ${user.id}`);

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
        IsynqLogger.debug('Default user settings synced to backend');
      } catch (err) {
        IsynqLogger.warn('Could not sync default settings:', err);
      }
    }

    return user;
  },

  async login({ email, password }) {
    IsynqLogger.info(`Logging in user: ${email}`);
    const data = await IsynqStorage.fetchAPI('/auth/login', {
      method: 'POST',
      body: JSON.stringify({ email, password })
    });

    const { user, token } = data;
    this._persistSession(user, token);
    IsynqLogger.info(`Login successful. Session persisted for user: ${user.id}`);
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
    IsynqLogger.info('Logging out user and clearing local session');
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
