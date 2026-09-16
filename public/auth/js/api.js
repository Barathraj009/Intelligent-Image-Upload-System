/**
 * Thin wrapper around fetch() for the OTP auth API.
 * Centralizes error normalization so UI code never has to think about
 * HTTP status codes or JSON parsing directly.
 */
const OtpAuthApi = (function () {
  function baseUrl() {
    return (window.OtpAuthConfig && window.OtpAuthConfig.apiBaseUrl) || '/api/auth';
  }

  async function request(path, body) {
    return doFetch(path, body ? { method: 'POST', body } : {});
  }

  async function doFetch(path, { method = 'POST', body } = {}) {
    let response;
    try {
      const init = {
        method,
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
      };
      if (body) init.body = JSON.stringify(body);
      response = await fetch(`${baseUrl()}${path}`, init);
    } catch (networkErr) {
      const err = new Error('We couldn\'t reach the server. Check your connection and try again.');
      err.code = 'NETWORK_ERROR';
      throw err;
    }

    let data = null;
    try {
      data = await response.json();
    } catch (parseErr) {
      const err = new Error('Something went wrong. Please try again.');
      err.code = 'SERVER_ERROR';
      throw err;
    }

    if (!response.ok || !data.success) {
      const err = new Error(data.message || 'Something went wrong. Please try again.');
      err.code = data.error || 'UNKNOWN_ERROR';
      err.meta = data;
      throw err;
    }

    return data;
  }

  return {
    sendOtp: (email) => request('/send-otp', { email }),
    resendOtp: (email) => request('/resend-otp', { email }),
    verifyOtp: (email, otp) => request('/verify-otp', { email, otp }),
    logout: () => request('/logout', {}),
    me: () => doFetch('/me', { method: 'GET' }),
    session: () => doFetch('/session', { method: 'GET' }),
  };
})();
