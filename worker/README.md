# Worker

This folder is the Cloudflare Worker. Deploy, local dev, tests, and the security notes are in the [repository README](../README.md).

```bash
npm install
npm test
npm run typecheck
npx wrangler dev
npx wrangler deploy --dry-run
npx wrangler deploy
```

No Worker secrets or variables are required. Deploy from GitHub is described in the repository README. Do not put an Arkkies password in a file here.
