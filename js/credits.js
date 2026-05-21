/* ============================================
   ISYNQ — Credits Manager
   ============================================ */

const CreditsManager = {
  sessionStart: null,
  billingInterval: null,
  elapsedSeconds: 0,
  onUpdateCallback: null,
  onDepletedCallback: null,

  getCredits() {
    const user = IsynqStorage.get('current_user');
    return user ? user.creditsRemaining : 0;
  },

  setCredits(minutes) {
    const user = IsynqStorage.get('current_user');
    if (user) {
      user.creditsRemaining = Math.max(0, minutes);
      IsynqStorage.set('current_user', user);
      IsynqStorage.syncCreditsToBackend(user.creditsRemaining);
    }
  },

  startBilling() {
    this.sessionStart = Date.now();
    this.elapsedSeconds = 0;
    this.billingInterval = setInterval(() => {
      this.elapsedSeconds++;
      if (this.elapsedSeconds % 60 === 0) {
        const current = this.getCredits();
        if (current <= 0) {
          this.stopBilling();
          if (this.onDepletedCallback) this.onDepletedCallback();
          return;
        }
        this.setCredits(current - 1);
      }
      if (this.onUpdateCallback) {
        this.onUpdateCallback({
          elapsed: this.elapsedSeconds,
          remaining: this.getCredits(),
          formatted: this.formatTime(this.getCredits() * 60 - (this.elapsedSeconds % 60))
        });
      }
    }, 1000);
  },

  stopBilling() {
    if (this.billingInterval) {
      clearInterval(this.billingInterval);
      this.billingInterval = null;
    }
    const duration = this.elapsedSeconds;
    this.elapsedSeconds = 0;
    return { duration, minutesUsed: Math.ceil(duration / 60) };
  },

  formatTime(totalSeconds) {
    if (totalSeconds < 0) totalSeconds = 0;
    const m = Math.floor(totalSeconds / 60);
    const s = totalSeconds % 60;
    return `${m}:${s.toString().padStart(2, '0')}`;
  },

  getElapsedFormatted() {
    return this.formatTime(this.elapsedSeconds);
  },

  checkCredits() {
    return this.getCredits() > 0;
  },

  onUpdate(cb) { this.onUpdateCallback = cb; },
  onDepleted(cb) { this.onDepletedCallback = cb; }
};

window.CreditsManager = CreditsManager;
