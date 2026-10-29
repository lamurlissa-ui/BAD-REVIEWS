/* Public runtime configuration. Never put Cloudflare secrets in this file. */
'use strict';
window.BAD_REVIEWS_CONFIG = Object.freeze({
  // Filled after the credential Worker is deployed, for example:
  // turnCredentialsUrl: 'https://bad-reviews-turn.example.workers.dev/turn-credentials',
  turnCredentialsUrl: '',
});
