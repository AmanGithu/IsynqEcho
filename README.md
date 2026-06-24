# IsynqEcho

Static HTML/CSS/vanilla-JS web app for Isynq — dashboard, assistant management, session history, and account/billing. No build step, no framework.

## Running

```bash
python -m http.server 8000
```

Requires `isynq-backend` running at `http://localhost:5000` (see `isynq-backend/README.md`). The app calls the API via `IsynqStorage.fetchAPI` in `js/storage.js`.

## Structure

- `app/` — pages: `dashboard.html`, `assistants.html`, `sessions.html`, `session-detail.html`, `documents.html`, `audio-check.html`, `account.html`, `settings.html`, `echo.html`
- `js/` — shared modules, loaded as plain globals (no imports): `storage.js` (API client + logger), `auth.js` (session/OAuth), `sidebar.js` (shared nav shell), `credits.js`, `llm-engine.js`, `transcription.js`, `main.js`, `oauth.js`
- `css/` — shared styles, including `dashboard.css`

See [CLAUDE.md](./CLAUDE.md) for the script-include convention, the cache-busting rule, and how to add a new page. See [DESIGN.md](./DESIGN.md) for the visual/brand system.
