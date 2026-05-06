/* ============================================
   ISYNQ — Auth Module
   ============================================ */

const IsynqAuth = {
  async hashPassword(password) {
    const encoder = new TextEncoder();
    const data = encoder.encode(password + 'isynq_salt_2026');
    const hash = await crypto.subtle.digest('SHA-256', data);
    return Array.from(new Uint8Array(hash)).map(b => b.toString(16).padStart(2, '0')).join('');
  },

  generateToken() {
    const payload = { id: crypto.randomUUID(), iat: Date.now(), exp: Date.now() + 7 * 24 * 60 * 60 * 1000 };
    return btoa(JSON.stringify(payload));
  },

  async register({ name, email, password }) {
    const users = IsynqStorage.get('users') || [];
    if (users.find(u => u.email === email.toLowerCase())) {
      throw new Error('An account with this email already exists');
    }
    const passwordHash = await this.hashPassword(password);
    const user = {
      id: crypto.randomUUID(), name, email: email.toLowerCase(), passwordHash,
      plan: 'free', creditsRemaining: 5, createdAt: new Date().toISOString(),
      lastLogin: new Date().toISOString(), avatar: name.charAt(0).toUpperCase()
    };
    users.push(user);
    IsynqStorage.set('users', users);
    const token = this.generateToken();
    const session = { token, userId: user.id, expiresAt: Date.now() + 7 * 24 * 60 * 60 * 1000 };
    IsynqStorage.set('session', session);
    IsynqStorage.set('current_user', { id: user.id, name: user.name, email: user.email, plan: user.plan, creditsRemaining: user.creditsRemaining, avatar: user.avatar });
    IsynqStorage.set('user_settings', { responseFormat: 'short', preferredLLM: 'openai', apiKey: '', darkMode: false });
    return user;
  },

  async login({ email, password }) {
    const users = IsynqStorage.get('users') || [];
    const user = users.find(u => u.email === email.toLowerCase());
    if (!user) throw new Error('No account found with this email');
    const passwordHash = await this.hashPassword(password);
    if (user.passwordHash !== passwordHash) throw new Error('Incorrect password');
    user.lastLogin = new Date().toISOString();
    IsynqStorage.set('users', users);
    const token = this.generateToken();
    IsynqStorage.set('session', { token, userId: user.id, expiresAt: Date.now() + 7 * 24 * 60 * 60 * 1000 });
    IsynqStorage.set('current_user', { id: user.id, name: user.name, email: user.email, plan: user.plan, creditsRemaining: user.creditsRemaining, avatar: user.avatar });
    return user;
  },

  socialLogin(provider) {
    const name = provider === 'google' ? 'Demo User' : 'GitHub User';
    const email = provider === 'google' ? 'demo@gmail.com' : 'demo@github.com';
    const users = IsynqStorage.get('users') || [];
    let user = users.find(u => u.email === email);
    if (!user) {
      user = { id: crypto.randomUUID(), name, email, passwordHash: '', plan: 'free', creditsRemaining: 5, createdAt: new Date().toISOString(), lastLogin: new Date().toISOString(), avatar: name.charAt(0), socialProvider: provider };
      users.push(user);
      IsynqStorage.set('users', users);
      IsynqStorage.set('user_settings', { responseFormat: 'short', preferredLLM: 'openai', apiKey: '', darkMode: false });
    }
    user.lastLogin = new Date().toISOString();
    IsynqStorage.set('users', users);
    const token = this.generateToken();
    IsynqStorage.set('session', { token, userId: user.id, expiresAt: Date.now() + 7 * 24 * 60 * 60 * 1000 });
    IsynqStorage.set('current_user', { id: user.id, name: user.name, email: user.email, plan: user.plan, creditsRemaining: user.creditsRemaining, avatar: user.avatar });
    return user;
  },

  isAuthenticated() {
    const session = IsynqStorage.get('session');
    if (!session) return false;
    if (Date.now() > session.expiresAt) { this.logout(); return false; }
    return true;
  },

  getCurrentUser() {
    if (!this.isAuthenticated()) return null;
    return IsynqStorage.get('current_user');
  },

  logout() {
    IsynqStorage.remove('session');
    IsynqStorage.remove('current_user');
  },

  requireAuth() {
    if (!this.isAuthenticated()) {
      window.location.href = '/isynq/signin.html';
      return false;
    }
    return true;
  }
};

window.IsynqAuth = IsynqAuth;
