/**
 * OtpAuthModule
 * ------------------------------------------------------------------
 * Mounts the full email -> OTP -> success flow into a container element.
 * This file has no framework dependency (no React/Vue/etc.) so it can be
 * dropped into any project by including this script + styles.css and
 * calling OtpAuthModule.mount('#some-container', window.OtpAuthConfig).
 */
const OtpAuthModule = (function () {
  let root = null;
  let cfg = {};
  let state = {
    email: '',
    maskedEmail: '',
    expiresInSeconds: 300,
    resendCooldownSeconds: 45,
    step: 1, // 1 = email, 2 = otp, 3 = success
  };
  let otpInputHandle = null;
  let cooldownTimer = null;
  let expiryTimer = null;

  // ---------- helpers ----------
  function el(html) {
    const t = document.createElement('template');
    t.innerHTML = html.trim();
    return t.content.firstElementChild;
  }

  function formatTime(totalSeconds) {
    const m = Math.floor(totalSeconds / 60);
    const s = totalSeconds % 60;
    return `${m}:${String(s).padStart(2, '0')}`;
  }

  function initials(name) {
    return (name || 'A').trim().charAt(0).toUpperCase();
  }

  function setProgress(step) {
    const bar = root.querySelector('.otp-progress__fill');
    if (bar) bar.style.width = `${(step / 3) * 100}%`;
  }

  function switchView(viewName) {
    root.querySelectorAll('.otp-view').forEach((v) => v.classList.remove('otp-view--active'));
    const next = root.querySelector(`.otp-view[data-view="${viewName}"]`);
    if (next) {
      // restart the fade-in animation
      next.classList.remove('otp-view--active');
      // eslint-disable-next-line no-unused-expressions
      next.offsetWidth;
      next.classList.add('otp-view--active');
    }
  }

  function clearTimers() {
    if (cooldownTimer) clearInterval(cooldownTimer);
    if (expiryTimer) clearInterval(expiryTimer);
  }

  // ---------- shell ----------
  function renderShell() {
    root.innerHTML = '';
    const shell = el(`
      <div class="otp-shell">
        <div class="otp-brand">
          <div class="otp-brand__mark">${
            cfg.logoUrl
              ? `<img src="${cfg.logoUrl}" alt="${cfg.appName} logo" />`
              : initials(cfg.appName)
          }</div>
          <span class="otp-brand__name">${cfg.appName}</span>
        </div>
        <div class="otp-card">
          <div class="otp-progress"><div class="otp-progress__fill"></div></div>
          <div class="otp-card__body">
            <div class="otp-view" data-view="email"></div>
            <div class="otp-view" data-view="otp"></div>
            <div class="otp-view" data-view="success"></div>
          </div>
        </div>
        <p class="otp-footnote">Secured with one-time email verification</p>
      </div>
    `);
    root.appendChild(shell);
  }

  // ---------- view: email ----------
  function renderEmailView() {
    const container = root.querySelector('.otp-view[data-view="email"]');
    container.innerHTML = `
      <h1 class="otp-heading">Sign in</h1>
      <p class="otp-subtext">Enter your Gmail address and we'll email you a one-time verification code.</p>
      <form class="otp-form" data-form="email" novalidate>
        <label class="otp-label" for="otp-email-input">Email address</label>
        <input
          id="otp-email-input"
          class="otp-input-text"
          type="email"
          name="email"
          placeholder="you@gmail.com"
          autocomplete="email"
          required
        />
        <div class="otp-error" data-error role="alert" aria-live="polite"></div>
        <button class="otp-btn otp-btn--primary" type="submit" data-submit>
          <span data-label>Send verification code</span>
          <span class="otp-spinner" data-spinner hidden></span>
        </button>
      </form>
    `;

    const form = container.querySelector('[data-form="email"]');
    const input = container.querySelector('#otp-email-input');
    const errorBox = container.querySelector('[data-error]');
    const submitBtn = container.querySelector('[data-submit]');
    const label = container.querySelector('[data-label]');
    const spinner = container.querySelector('[data-spinner]');

    function setLoading(loading) {
      submitBtn.disabled = loading;
      spinner.hidden = !loading;
      label.textContent = loading ? 'Sending…' : 'Send verification code';
    }

    form.addEventListener('submit', async (e) => {
      e.preventDefault();
      errorBox.textContent = '';
      const email = input.value.trim();

      if (!email) {
        errorBox.textContent = 'Please enter your email address.';
        return;
      }

      setLoading(true);
      try {
        const result = await OtpAuthApi.sendOtp(email);
        state.email = email;
        state.maskedEmail = result.maskedEmail;
        state.expiresInSeconds = result.expiresInSeconds;
        state.resendCooldownSeconds = result.resendCooldownSeconds;
        state.step = 2;
        renderOtpView();
        setProgress(2);
        switchView('otp');
      } catch (err) {
        errorBox.textContent = err.message;
      } finally {
        setLoading(false);
      }
    });
  }

  // ---------- view: otp ----------
  function renderOtpView() {
    const container = root.querySelector('.otp-view[data-view="otp"]');
    container.innerHTML = `
      <h1 class="otp-heading">Verify your email</h1>
      <p class="otp-subtext">
        We've sent a verification code to your Gmail address.
      </p>
      <p class="otp-masked-email">${state.maskedEmail}
        <button class="otp-link" type="button" data-change-email>Change email</button>
      </p>

      <div class="otp-boxes" data-otp-boxes></div>
      <div class="otp-error" data-error role="alert" aria-live="polite"></div>

      <button class="otp-btn otp-btn--primary" type="button" data-verify>
        <span data-label>Verify code</span>
        <span class="otp-spinner" data-spinner hidden></span>
      </button>

      <div class="otp-meta-row">
        <span class="otp-expiry" data-expiry></span>
        <button class="otp-link" type="button" data-resend disabled>Resend code</button>
      </div>
    `;

    const boxesEl = container.querySelector('[data-otp-boxes]');
    const errorBox = container.querySelector('[data-error]');
    const verifyBtn = container.querySelector('[data-verify]');
    const label = container.querySelector('[data-label]');
    const spinner = container.querySelector('[data-spinner]');
    const resendBtn = container.querySelector('[data-resend]');
    const expiryEl = container.querySelector('[data-expiry]');
    const changeEmailBtn = container.querySelector('[data-change-email]');

    function setLoading(loading) {
      verifyBtn.disabled = loading;
      spinner.hidden = !loading;
      label.textContent = loading ? 'Verifying…' : 'Verify code';
      otpInputHandle && otpInputHandle.disable(loading);
    }

    otpInputHandle = createOtpInput(boxesEl, {
      length: cfg.otpLength || 6,
      onChange: () => {
        errorBox.textContent = '';
        otpInputHandle.setError(false);
      },
      onComplete: (value) => submitOtp(value),
    });
    otpInputHandle.focusFirst();

    async function submitOtp(value) {
      const code = value || otpInputHandle.getValue();
      const expectedLength = cfg.otpLength || 6;
      if (code.length < expectedLength) {
        errorBox.textContent = `Please enter the ${expectedLength}-digit code.`;
        return;
      }
      errorBox.textContent = '';
      setLoading(true);
      try {
        const result = await OtpAuthApi.verifyOtp(state.email, code);
        state.step = 3;
        clearTimers();
        renderSuccessView(result);
        setProgress(3);
        switchView('success');
      } catch (err) {
        otpInputHandle.setError(true);
        errorBox.textContent = err.message;
        if (err.code === 'OTP_EXPIRED' || err.code === 'TOO_MANY_ATTEMPTS') {
          verifyBtn.disabled = true;
        }
      } finally {
        setLoading(false);
      }
    }

    verifyBtn.addEventListener('click', () => submitOtp());

    changeEmailBtn.addEventListener('click', () => {
      clearTimers();
      state.step = 1;
      setProgress(1);
      // Reset the email field so the user can enter a different address.
      const emailInput = root.querySelector('#otp-email-input');
      if (emailInput && !emailInput.value.trim()) {
        emailInput.value = state.email;
      }
      switchView('email');
    });

    resendBtn.addEventListener('click', async () => {
      resendBtn.disabled = true;
      errorBox.textContent = '';
      try {
        const result = await OtpAuthApi.resendOtp(state.email);
        state.expiresInSeconds = result.expiresInSeconds;
        state.resendCooldownSeconds = result.resendCooldownSeconds;
        otpInputHandle.clear();
        otpInputHandle.setError(false);
        startTimers();
      } catch (err) {
        errorBox.textContent = err.message;
        resendBtn.disabled = false;
      }
    });

    function startTimers() {
      clearTimers();
      let cooldown = state.resendCooldownSeconds;
      let expiry = state.expiresInSeconds;

      resendBtn.disabled = true;
      resendBtn.textContent = `Resend code (${cooldown}s)`;
      expiryEl.textContent = `Code expires in ${formatTime(expiry)}`;

      cooldownTimer = setInterval(() => {
        cooldown -= 1;
        if (cooldown <= 0) {
          clearInterval(cooldownTimer);
          resendBtn.disabled = false;
          resendBtn.textContent = 'Resend code';
        } else {
          resendBtn.textContent = `Resend code (${cooldown}s)`;
        }
      }, 1000);

      expiryTimer = setInterval(() => {
        expiry -= 1;
        if (expiry <= 0) {
          clearInterval(expiryTimer);
          expiryEl.textContent = 'Code expired';
          errorBox.textContent = 'Your code has expired. Please request a new one.';
          verifyBtn.disabled = true;
        } else {
          expiryEl.textContent = `Code expires in ${formatTime(expiry)}`;
        }
      }, 1000);
    }

    startTimers();
  }

  // ---------- view: success ----------
  function renderSuccessView(result) {
    const container = root.querySelector('.otp-view[data-view="success"]');
    const timestamp = new Date(result.verifiedAt || Date.now()).toLocaleString();

    container.innerHTML = `
      <div class="otp-success-icon" aria-hidden="true">
        <svg viewBox="0 0 52 52" class="otp-checkmark">
          <circle class="otp-checkmark__circle" cx="26" cy="26" r="24" fill="none"/>
          <path class="otp-checkmark__check" fill="none" d="M14 27l7 7 17-17"/>
        </svg>
      </div>
      <h1 class="otp-heading otp-heading--center">Email verified successfully</h1>
      <p class="otp-subtext otp-subtext--center">${
        result.isNewUser ? 'Welcome aboard! Your account has been created.' : 'Welcome back! You\'re signed in again.'
      }</p>

      <div class="otp-summary">
        <div class="otp-summary__row">
          <span>Verified email</span>
          <strong>${result.email}</strong>
        </div>
        <div class="otp-summary__row">
          <span>Verified at</span>
          <strong>${timestamp}</strong>
        </div>
        <div class="otp-summary__row">
          <span>Status</span>
          <strong class="otp-status-pill">Verified</strong>
        </div>
      </div>

      <p class="otp-subtext otp-subtext--center">
        Your identity has been verified. You're ready to explore the application.
      </p>

      <button class="otp-btn otp-btn--primary" type="button" data-continue>
        Continue to application →
      </button>
    `;

    container.querySelector('[data-continue]').addEventListener('click', () => {
      const session = { email: result.email, token: result.token, verifiedAt: result.verifiedAt };
      if (typeof cfg.onAuthSuccess === 'function') {
        cfg.onAuthSuccess(session);
      } else if (cfg.postLoginUrl) {
        window.location.href = cfg.postLoginUrl;
      } else if (cfg.showDemoDashboard) {
        renderDemoDashboard(session);
      }
    });
  }

  // ---------- demo dashboard (standalone mode only) ----------
  function renderDemoDashboard(session) {
    root.innerHTML = `
      <div class="otp-shell">
        <div class="otp-card otp-card--dashboard">
          <div class="otp-card__body">
            <div class="otp-dashboard-badge">✓ Authentication complete</div>
            <h1 class="otp-heading">Email verified successfully</h1>
            <div class="otp-summary">
              <div class="otp-summary__row"><span>Verified email</span><strong>${session.email}</strong></div>
              <div class="otp-summary__row"><span>Login timestamp</span><strong>${new Date(
                session.verifiedAt
              ).toLocaleString()}</strong></div>
              <div class="otp-summary__row"><span>Authentication status</span><strong class="otp-status-pill">Verified</strong></div>
            </div>
            <p class="otp-subtext otp-subtext--center">
              This demo dashboard stands in for your real application. Replace it by setting
              <code>OtpAuthConfig.onAuthSuccess</code> to redirect into your own app once this
              module is integrated.
            </p>
            <button class="otp-btn otp-btn--secondary" type="button" data-restart>Start over</button>
          </div>
        </div>
      </div>
    `;
    root.querySelector('[data-restart]').addEventListener('click', () => mount(cfg.__selector, cfg));
  }

  // ---------- public API ----------
  function mount(selector, userConfig) {
    root = typeof selector === 'string' ? document.querySelector(selector) : selector;
    if (!root) {
      console.error(`OtpAuthModule.mount: no element found for selector "${selector}"`);
      return;
    }
    cfg = Object.assign({ __selector: selector }, window.OtpAuthConfig, userConfig);
    state = {
      email: '',
      maskedEmail: '',
      expiresInSeconds: 300,
      resendCooldownSeconds: 45,
      step: 1,
    };

    renderShell();

    // Only the first view is rendered at mount; the OTP and success views
    // are rendered lazily when the user actually reaches them (avoiding
    // stray DOM, and stray countdown timers, for screens not yet shown).
    renderEmailView();
    setProgress(1);
    switchView('email');
  }

  return { mount };
})();

// CSP-safe auto-mount for the standalone demo page.
// index.html's #otp-auth-root carries the `data-otp-automount` attribute, so
// no inline <script> is needed (Helmet's default CSP, script-src 'self',
// blocks inline scripts). Host applications that embed this module either
// call OtpAuthModule.mount(element, config) themselves or add the attribute
// to their own container to opt into auto-mounting.
(function autoMount() {
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', autoMount);
    return;
  }
  const mountTarget = document.querySelector('#otp-auth-root[data-otp-automount]');
  if (mountTarget && window.OtpAuthConfig) {
    OtpAuthModule.mount(mountTarget, window.OtpAuthConfig);
  }
})();
