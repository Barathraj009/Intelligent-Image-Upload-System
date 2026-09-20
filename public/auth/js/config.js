/**
 * OTP Auth Module — Integration Config
 * ------------------------------------------------------------------
 * This is the ONE file a host application typically needs to edit when
 * dropping this module into a different project. Everything else in
 * frontend/ can be copied as-is.
 *
 * See ../../INTEGRATION.md for the full integration guide.
 */
window.OtpAuthConfig = {
  // Base URL of the backend's auth routes. Point this at wherever
  // backend/ is deployed.
  apiBaseUrl: '/api/auth',

  // Shown in the UI copy (brand name next to the logo, e.g. "Sign in to {appName}").
  appName: 'Intelligent Image Upload System',

  // Number of digits in the OTP. Must match the backend's OTP_LENGTH.
  otpLength: 6,

  // Optional: path/URL to a logo image. Falls back to a generated
  // monogram (using the first letter of appName) if left empty.
  logoUrl: '',

  // Called once the user successfully verifies their OTP.
  // `session` = { email, token, verifiedAt }
  // Override this from the host application to redirect into its own
  // dashboard / set its own app-level auth state instead of the demo
  // "Continue to Application" screen.
  onAuthSuccess: null,

  // If onAuthSuccess is NOT set, the module's `Continue to application →`
  // button navigates here after verification. This is the post-login
  // destination a host app configures instead of editing this file.
  //
  // NOTE: for the standalone demo, leave this empty (''). When it is empty
  // AND showDemoDashboard is true, the module shows its built-in "Login
  // successful" dashboard instead of navigating away. Set a real URL when
  // you point this at an actual host app.
  postLoginUrl: '/app',

  // If true, the module renders its own built-in "Authentication
  // Complete" demo dashboard when onAuthSuccess is not overridden.
  // Set to false once wired into a real host app.
  showDemoDashboard: false,
};
