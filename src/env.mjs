import dotenv from 'dotenv';

/*
Resolve the env file relative to this module rather than the working directory.
`npm start`, `npm run dev` and the Docker CMD all run from the repo root, so the bare
`dotenv/config` import looked for ./.env and silently found nothing - the real file is src/.env
(which is what .gitignore and .dockerignore both list).
*/
dotenv.config({ path: new URL('.env', import.meta.url), quiet: true });
