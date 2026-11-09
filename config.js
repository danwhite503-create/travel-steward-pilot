// Pilot page settings. Daniel fills these in; Claude never writes a key here.
// The publishable (anon) key is meant to be public: every row is protected by
// row-level security in the database. Never put the secret (service_role) key here.
window.PILOT_CONFIG = {
  SUPABASE_URL: "https://seaxfyebgvmzroaxtgmv.supabase.co", // the project address (public by design)
  SUPABASE_PUBLISHABLE_KEY: "sb_publishable_pWCS0k7QwbsJ6l9MxyjMBw_CWmGzSsr",  // the "anon" / publishable key (Project Settings → API)
  PILOT_NAME: "Travel Steward",   // his pick, 9 Nov (Build Map r39)
  OPERATOR_NAME: "Daniel White",
  CONTACT: "danwhite503@gmail.com", // approved by Daniel for the public page, 9 Nov 2026
  CLAUDE_PLAN: "Max",               // read from his Claude billing page by Claude, 9 Nov
  CHATS_TRAINING: "aren't",          // training turned off by Claude at his word, 9 Nov (checked after reload)
  // A label starting "draft" shows the draft banner and refuses consent.
  // Set the approved label (e.g. "pilot-2026-11-v1") once the notice is approved.
  NOTICE_VERSION: "draft-v0.3",
  NOTICE_URL: "notice.html"
};
