# Deploying HouseChores (Coolify)

HouseChores is a Next.js app (standalone output) with a single SQLite file.
It builds to one Docker container; the database lives on a persistent volume.

## What matters most

**The SQLite DB must be on a persistent volume**, or every redeploy wipes all
points/history. The app reads `DATA_DIR` (default `/data` in the container) and
stores `housechores.db` there. Mount a volume at `/data`.

## Coolify steps

1. **New Resource → Application** → connect the GitHub repo `sronkar/HouseChores`,
   branch `main`.
2. **Build Pack: Dockerfile** (the repo's `Dockerfile` — Next standalone on
   `node:24-slim`).
3. **Persistent Storage** → add a volume:
   - Name: `housechores-data`
   - Mount path (destination): `/data`
4. **Network / Ports**: the container listens on **3000** (`EXPOSE 3000`).
   Set the exposed port to `3000`; Coolify's proxy terminates HTTPS in front.
5. **Domain**: set your subdomain, e.g. `chores.<your-domain>` (fits the
   wildcard-subdomain app-store setup).
6. **Deploy.** Coolify builds the image and starts `node server.js`.
7. **Auto-deploy**: enable the GitHub webhook so pushing to `main` redeploys.

No env vars are required (`DATA_DIR`, `PORT`, `HOSTNAME` are baked into the
Dockerfile). Everything else (kids, chores, PIN, AbaBank URL/token, ntfy topic)
is configured in-app under **Parent → Admin** and persists in the volume.

## First boot

The DB starts empty: tables are auto-created and the parent PIN defaults to
`1234` (change it in Admin). Then either:

- **Set up fresh** — add kids and chores in Admin, or
- **Bring your local data** — copy your Mac's `~/HouseChores/data/housechores.db`
  into the `/data` volume (stop the app, place the file, start it). Ask if you
  want help; it's a `docker cp` into the volume.

## Local development

```bash
npm install
npm run seed       # first time — sample kids + chores
npm run dev        # http://localhost:3939
```

## Notes

- `node:sqlite` is a Node builtin (needs Node ≥ 22.5; the image uses 24), so
  there is **no native module to compile** — builds are fast and portable.
- Health: the app serves `/` (200) once up; point any healthcheck there.
- ntfy push works directly from the deployed app (outbound HTTPS to ntfy.sh).
