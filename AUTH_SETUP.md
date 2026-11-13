# Authentication setup

The app uses WebAuthn passkeys only; passwords are not stored or accepted.

1. Install Node.js 20.9 or later and run `npm install`. On Windows, if `better-sqlite3` fails during `node-gyp rebuild`, install Python 3 and the Visual Studio C++ Build Tools, then retry.
2. Copy `.env.example` to `.env.local`.
3. Generate a session secret with `node -e "console.log(require('node:crypto').randomBytes(32).toString('base64url'))"` and place the output in `SESSION_SECRET`.
4. For local development, keep `RP_ID=localhost` and `RP_ORIGIN=http://localhost:3000`. For deployment, set them to the exact host name and origin serving the app; WebAuthn requires HTTPS outside localhost.
5. Run `npm run dev`. SQLite creates `todos.db` in the project root on first use.

`SESSION_SECRET` must be at least 32 bytes. Keep `.env.local` private; only `.env.example` is checked in.
