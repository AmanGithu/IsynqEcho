/* ============================================
   ISYNQ — Credits Manager
   ============================================ */

const CreditsManager = {
  sessionStart: null,
  billingInterval: null,
  elapsedSeconds: 0,
  remainingSeconds: 0,
  sessionLocked: false,
  onUpdateCallback: null,
  onDepletedCallback: null,

  getCredits() {
    const user = IsynqStorage.get('current_user');
    return user ? user.creditsRemaining : 0;
  },

  setCredits(minutes, syncToBackend = true) {
    const user = IsynqStorage.get('current_user');
    if (user) {
      user.creditsRemaining = Math.max(0, minutes);
      IsynqStorage.set('current_user', user);
      if (syncToBackend) {
        IsynqStorage.syncCreditsToBackend(user.creditsRemaining);
      }
    }
  },

  applyUserFromServer(user) {
    if (!user) return;
    IsynqStorage.syncUserFromApi(user);
    if (this.billingInterval) {
      const used = this.elapsedSeconds;
      this.remainingSeconds = Math.max(0, this.getCredits() * 60 - used);
      this._notifyUpdate();
    }
  },

  isSessionLocked() {
    return this.sessionLocked;
  },

  canUseSession() {
    if (this.sessionLocked) return false;
    if (this.billingInterval) return this.remainingSeconds > 0;
    return this.getCredits() > 0;
  },

  isBillingActive() {
    return !!this.billingInterval;
  },

  lockSession() {
    if (this.sessionLocked) return;
    this.sessionLocked = true;
    this.remainingSeconds = 0;
    if (this.billingInterval) {
      clearInterval(this.billingInterval);
      this.billingInterval = null;
    }
    this._notifyUpdate();
    if (this.onDepletedCallback) this.onDepletedCallback();
  },

  startBilling() {
    if (this.billingInterval) return;
    if (this.getCredits() <= 0) {
      this.lockSession();
      return false;
    }

    this.sessionLocked = false;
    this.sessionStart = Date.now();
    this.elapsedSeconds = 0;
    this.remainingSeconds = this.getCredits() * 60;

    this.billingInterval = setInterval(() => {
      this.elapsedSeconds++;
      this.remainingSeconds = Math.max(0, this.remainingSeconds - 1);

      this._notifyUpdate();

      if (this.remainingSeconds <= 0) {
        this.lockSession();
      }
    }, 1000);

    this._notifyUpdate();
    return true;
  },

  stopBilling() {
    if (this.billingInterval) {
      clearInterval(this.billingInterval);
      this.billingInterval = null;
    }
    const duration = this.elapsedSeconds;
    return { duration, minutesUsed: Math.ceil(duration / 60) };
  },

  _notifyUpdate() {
    if (this.onUpdateCallback) {
      this.onUpdateCallback({
        elapsed: this.elapsedSeconds,
        remaining: this.remainingSeconds,
        formatted: this.formatTime(this.remainingSeconds)
      });
    }
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
    return this.canUseSession();
  },

  onUpdate(cb) { this.onUpdateCallback = cb; },
  onDepleted(cb) { this.onDepletedCallback = cb; }
};

window.CreditsManager = CreditsManager;
