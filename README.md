# Pilot page — README (v0.3)

The closed pilot's web page (D-538): sign-in with Google (D-541; email links were dropped, step 0), the consent step, trips, notes, travelers, preferences, sharing a trip with the planner, and download or delete. A static site: `index.html`, `app.js`, `notice.html`, `style.css`, `config.js` and a vendored copy of supabase-js 2.45.4 (MIT, `vendor/`). No build step, no server of its own; it talks only to the pilot's Supabase project, where row-level security decides what each person can read (`supabase/`, `contracts.md` §31).

| File | What it is |
|---|---|
| `config.js` | **Daniel fills it in**: the project's URL and its publishable (anon) key, the pilot's name, his name and contact, and the notice version. Claude never writes a key here. Never the secret (service_role) key. |
| `index.html`, `app.js` | the page: Part A of `phase10/pilot-consent-notice.md` before sign-in, the app after |
| `notice.html` | Part B, the privacy notice |
| `tests/test_page.py` | 48 checks with Playwright against a stand-in client (`tests/mock_client.js`): consent before sign-in, the consents row first, nothing stored without agreement (agree in place, with download and delete still open), sign-in with Google only and no scopes beyond basic sign-in, a held agreement kept in the tab only and used only for this notice version within 15 minutes, one agreement and one render when sign-in events race, a secret key in config stopping the page, a Google account not on the list and a canceled sign-in each explained, never-kept refusals shown in plain words, sharing and the planner file and log, typed confirm on delete, text never run as HTML, phone width, and no key or token in the page's own files. Run: `python3 pilot-web/tests/test_page.py` |

**What the tests don't prove:** the real Google and Supabase sign-in (that a listed friend's Google sign-in attaches to the account he made, and an unlisted one is refused), and the page against the live database. Those are checked once he has filled `config.js`, with a test account of his own, before any friend signs in.

## To go live (his steps, in order)
0. **Google sign-in (his steps; he chose it on 9 Nov: "Switch to Google sign-in", D-541. Context, *Claude's*: Supabase's built-in email only reaches the project's own team, D-539).** From Supabase's "Login with Google" guide (read 9 Nov, T2):
   - Google Cloud Console → a new project → Google Auth Platform. **Audience:** External; leaving it in *Testing* is fine, because an app asking only for the basic scopes is exempt from the test-user list and the 7-day expiry (Google Cloud Console Help, support.google.com/cloud/answer/15549945, read 9 Nov, T2). **Branding:** the pilot's name and his support email. **Data Access:** add `openid` (email and profile are there by default). Add nothing else: other scopes can start Google's verification.
   - Clients → Create client → **Web application**. Authorized JavaScript origins: the Pages address (step 4). Authorized redirect URI: the callback URL shown on Supabase's Google provider page.
   - Supabase → Authentication → Sign In / Providers → Google: turn it on, paste the Client ID and Client Secret, save. **The client secret is his to paste there only, never into the chat or `config.js`.**
   - Google's consent screen will name the project's `….supabase.co` address, not the pilot, unless he adds a custom domain (a Supabase add-on; I haven't priced it).
1. Apply migration v0.1.3 to the project (consent first in the database; the download carries what delete removes; `notice.html` says so).
2. Approve the notice (`phase10/pilot-consent-notice.md`), and set `NOTICE_VERSION` to its label, e.g. `pilot-2026-11-v1`. A label starting `draft` keeps sign-up off.
3. Fill `config.js`: the URL and publishable key from Supabase → Project Settings → API; the pilot's name. His name and contact are filled in (approved for the public page, 9 Nov). `CLAUDE_PLAN` and `CHATS_TRAINING` are his to fill from his Claude settings.
4. Create a **public** GitHub repo holding only this folder, and turn on GitHub Pages for it. The page's code is public; no data or secret is in it. A project site at `<user>.github.io/<repo>` shares its browser storage (and so the sign-in session) with his other Pages sites on that address; a custom domain avoids that.
5. In Supabase → Authentication: turn **off** "Allow new users to sign up". Then add each friend under Users → Add user → Create new user, with **the email of the Google account they'll sign in with**, and "Auto Confirm User" ticked (the form asks for a password: use a long random one and don't keep it; I haven't checked this form on his project, T3). The account then keeps a hash of that unused password, and email-and-password sign-in stays possible unless the Email provider is turned off (not tested here, T3): check at step 7. With sign-ups off, Supabase attaches a Google sign-in to an existing user with the same verified email and refuses any other ("Signups not allowed for this instance"; Supabase Auth source, `internal/api/external.go` and its Google tests, commit `2550341`, read 9 Nov, T1 for the code; the hosted service may run a different version, so step 7 checks it). Under URL configuration, set the Site URL and an allowed redirect URL to the Pages address.
6. Upgrade the project to Pro before the first friend signs in (D-538).
7. Add his own Google account as a user and sign in with it; try every tab, download and delete. Then try a Google account he hasn't added and check it's turned away. Only then send the link to friends.

## Known limits (v0.3)
- Adding another person to a trip isn't on the page yet (the database supports it; the page would need a way to find the person's account).
- Planner output comes back to a trip only by Claude writing it through his account, or by him; the page shows what's there.
- The page holds the agreement in the tab (sessionStorage) for up to 15 minutes while Google signs the person in; if that runs out, or the tab is closed, they're asked to agree again after sign-in. Nothing ties the held agreement to an email any more, since the page no longer asks for one: in one tab, whoever ticks the boxes and whoever signs in are taken to be the same person.
- Supabase keeps what Google sends at sign-in (email, Google account ID, name, profile-picture link) in its sign-in records, outside the pilot's tables. The download adds them from the signed-in session as `sign_in`; closing the sign-in account removes them.
- After a failed Google sign-in the page clears the error from the address, so a reload doesn't show it again.
- If an owner removes someone from a trip, what that person wrote there is hidden from them, so their download and delete can't reach it (the owner's delete still removes it). Adding and removing people isn't on the page yet.
- The page's text mirrors the draft notice, brackets included; it must be updated to the approved wording when he approves it.
- A meta content-security policy can't stop the page being framed by another site; GitHub Pages sets no header for that.
