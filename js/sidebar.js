/* IsynqSidebar — shared sidebar shell injected into every app/ page.
   Keeping nav structure in one place avoids the per-page link drift
   we hit when Audio Check / Account were added to 8 files by hand. */
const IsynqSidebar = {
  NAV_ITEMS: [
    { key: 'dashboard', label: 'Dashboard', href: 'dashboard.html', icon: '🏠' },
    { key: 'assistants', label: 'Assistants', href: 'assistants.html', icon: '🧩' },
    { key: 'resumes', label: 'Resumes', href: 'resumes.html', icon: '🧾' },
    { key: 'sessions', label: 'Sessions', href: 'sessions.html', icon: '🕒' },
    { key: 'documents', label: 'Documents', href: 'documents.html', icon: '📁' }
  ],

  ACCOUNT_SUBITEMS: [
    { key: 'profile', label: 'Profile' },
    { key: 'credits', label: 'Credits' },
    { key: 'transactions', label: 'Transactions' },
    { key: 'history', label: 'Credit History' },
    { key: 'security', label: 'Security' }
  ],

  render(activeKey, activeAccountTab) {
    const user = (typeof IsynqAuth !== 'undefined' && IsynqAuth.getCurrentUser) ? IsynqAuth.getCurrentUser() : null;
    const root = document.getElementById('sidebar-root');
    if (!root) return;

    const isAccountActive = activeKey === 'account';
    const initials = user?.name ? user.name.trim().charAt(0).toUpperCase() : '?';

    root.innerHTML = `
      <button class="sidebar-mobile-toggle" onclick="IsynqSidebar.toggleMobile()" aria-label="Menu">☰</button>
      <aside class="app-sidebar" id="app-sidebar">
        <a href="dashboard.html" class="sidebar-logo">
          <div class="logo-icon">I</div><span>Isynq</span>
        </a>

        <nav class="sidebar-nav-section">
          ${this.NAV_ITEMS.map(item => `
            <a href="${item.href}" class="${item.key === activeKey ? 'active' : ''}">
              <span class="icon">${item.icon}</span>${item.label}
            </a>
          `).join('')}
        </nav>

        <div class="sidebar-divider"></div>
        <div class="sidebar-section-label">More</div>

        <nav class="sidebar-nav-section">
          <button class="sidebar-nav-toggle ${isAccountActive ? 'active' : ''}" onclick="IsynqSidebar.toggleAccountMenu()">
            <span class="icon">👤</span>Account
            <span class="sidebar-toggle-chevron ${isAccountActive ? 'open' : ''}" id="account-chevron">▾</span>
          </button>
          <div class="sidebar-submenu ${isAccountActive ? 'open' : ''}" id="account-submenu">
            ${this.ACCOUNT_SUBITEMS.map(sub => `
              <a href="account.html?tab=${sub.key}" class="${isAccountActive && activeAccountTab === sub.key ? 'active' : ''}">${sub.label}</a>
            `).join('')}
          </div>

          ${user?.role === 'superadmin' ? `
          <a href="admin.html" class="${activeKey === 'admin' ? 'active' : ''}">
            <span class="icon">🛡️</span>Admin
          </a>
          ` : ''}

          <a href="../index.html#desktop-app">
            <span class="icon">⭳</span>Go Invisible
          </a>
          <a href="#" onclick="IsynqSidebar.comingSoon('Refer & Earn');return false;">
            <span class="icon">🎁</span>Refer &amp; Earn<span class="sidebar-new-badge">NEW</span>
          </a>
          <a href="audio-check.html" class="${activeKey === 'audio-check' ? 'active' : ''}">
            <span class="icon">🎤</span>Audio Check
          </a>
          <a href="#" onclick="IsynqSidebar.comingSoon('Invisibility Check');return false;">
            <span class="icon">🕵️</span>Invisibility Check
          </a>
          <a href="#" onclick="IsynqSidebar.comingSoon('Help center');return false;">
            <span class="icon">❓</span>Help
          </a>
        </nav>

        <div class="sidebar-spacer"></div>

        <div class="sidebar-user-card">
          <div class="sidebar-avatar">${initials}</div>
          <div class="sidebar-user-info">
            <div class="sidebar-user-name">${user?.name || 'Account'}</div>
            <div class="sidebar-user-email">${user?.email || ''}</div>
          </div>
          <button class="sidebar-kebab" onclick="IsynqSidebar.toggleKebab(event)">⋮</button>
          <div class="sidebar-kebab-menu" id="sidebar-kebab-menu">
            <button onclick="IsynqSidebar.logout()">Sign Out</button>
          </div>
        </div>
      </aside>
    `;

    document.addEventListener('click', (e) => {
      const menu = document.getElementById('sidebar-kebab-menu');
      if (menu && menu.classList.contains('open') && !e.target.closest('.sidebar-user-card')) {
        menu.classList.remove('open');
      }
    });
  },

  toggleAccountMenu() {
    document.getElementById('account-submenu')?.classList.toggle('open');
    document.getElementById('account-chevron')?.classList.toggle('open');
  },

  toggleKebab(e) {
    e.stopPropagation();
    document.getElementById('sidebar-kebab-menu')?.classList.toggle('open');
  },

  toggleMobile() {
    document.getElementById('app-sidebar')?.classList.toggle('open');
  },

  comingSoon(name) {
    alert(`${name} is coming soon.`);
  },

  logout() {
    IsynqAuth.logout();
    window.location.href = '../index.html';
  }
};
