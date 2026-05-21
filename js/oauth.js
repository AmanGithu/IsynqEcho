/* ============================================
   ISYNQ — OAuth redirect helpers
   ============================================ */

const IsynqOAuth = {
  apiRoot() {
    return IsynqStorage.API_BASE_URL.replace(/\/api$/, '');
  },

  buildReturnUrl(fallback = '/app/dashboard.html') {
    const params = new URLSearchParams(window.location.search);
    return params.get('returnUrl') || fallback;
  },

  startGoogle(returnUrl) {
    const target = encodeURIComponent(returnUrl || this.buildReturnUrl());
    window.location.href = `${this.apiRoot()}/api/auth/google?returnUrl=${target}`;
  },

  startGitHub(returnUrl) {
    const target = encodeURIComponent(returnUrl || this.buildReturnUrl());
    window.location.href = `${this.apiRoot()}/api/auth/github?returnUrl=${target}`;
  }
};

window.IsynqOAuth = IsynqOAuth;
