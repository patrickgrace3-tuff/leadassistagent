// Copy this file to `config.local.js` (same folder) and fill in your token.
//
//     cp config.example.js config.local.js
//
// config.local.js is gitignored, so your personal token is never committed or
// pushed to GitHub. Each teammate keeps their own. After editing it, reload the
// extension at chrome://extensions.

export default {
  // Passport token from the ConversionIA Identity Server, sent as the
  // X-Conversion-Identity-Token header on every request. Create one at:
  // https://admin.conversionext.com/admin/resources/service-accounts
  // (service account → super-admin role → "Create Personal Access Token").
  identityToken: "",

  // Optional: uncomment to override the API base URL for this machine.
  // apiBaseUrl: "https://leadassist.ai/api/v1",
};
