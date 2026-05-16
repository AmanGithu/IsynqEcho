/* ============================================
   ISYNQ — Auth Module
   ============================================ */

const IsynqAuth = {
  async register({ name, email, password }) {
    const data = await IsynqStorage.fetchAPI('/auth/register', {
      method: 'POST',
      body: JSON.stringify({ name, email, password })
    });

    const { user, token } = data;
    const expiresAt = Date.now() + 7 * 24 * 60 * 60 * 1000; // 7 days

    IsynqStorage.set('session', { token, userId: user.id, expiresAt });
    IsynqStorage.set('current_user', { 
      id: user.id, 
      name: user.name, 
      email: user.email, 
      plan: user.plan || 'free', 
      creditsRemaining: user.creditsRemaining || 5, 
      avatar: user.avatar 
    });
    
    // Default settings
    IsynqStorage.set('user_settings', { 
      responseFormat: 'short', 
      preferredLLM: 'openai', 
      apiKey: '', 
      darkMode: false 
    });

    return user;
  },

  async login({ email, password }) {
    const data = await IsynqStorage.fetchAPI('/auth/login', {
      method: 'POST',
      body: JSON.stringify({ email, password })
    });

    const { user, token } = data;
    const expiresAt = Date.now() + 7 * 24 * 60 * 60 * 1000;

    IsynqStorage.set('session', { token, userId: user.id, expiresAt });
    IsynqStorage.set('current_user', { 
      id: user.id, 
      name: user.name, 
      email: user.email, 
      plan: user.plan, 
      creditsRemaining: user.creditsRemaining, 
      avatar: user.avatar 
    });

    return user;
  },

  socialLogin(provider) {
    console.warn(`Social login for ${provider} is not yet implemented in backend. Using mock logic.`);
    // Keep mock for now or redirect to backend if implemented
    return null; 
  },

  isAuthenticated() {
    const session = IsynqStorage.get('session');
    if (!session || !session.token) return false;
    
    // Local expiry check (basic)
    if (Date.now() > session.expiresAt) {
      this.logout();
      return false;
    }
    return true;
  },

  getCurrentUser() {
    if (!this.isAuthenticated()) return null;
    return IsynqStorage.get('current_user');
  },

  logout() {
    IsynqStorage.remove('session');
    IsynqStorage.remove('current_user');
    // Optional: window.location.href = '/signin.html';
  },

  requireAuth() {
    if (!this.isAuthenticated()) {
      window.location.href = '/signin.html';
      return false;
    }
    return true;
  }
};

window.IsynqAuth = IsynqAuth;
