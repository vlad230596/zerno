# Zerno deployment

Zerno is a static single-page application. There is no backend and no database:
the browser talks to the ZenMoney API directly, and the server only serves the
bundle. That makes deployment a matter of replacing one immutable container.

## Two stands, one hostname

| Stand | Origin | Follows | Compose project | Directory |
| --- | --- | --- | --- | --- |
| Production | `https://<host>:8443` | git tags | `zerno` | `/opt/zerno` |
| Development | `https://<host>:8444` | `master` | `zerno-dev` | `/opt/zerno-dev` |

Port 443 is unavailable on the target host, so both stands use 8443 and 8444,
which the shared Caddy already publishes. Neither port is exclusive to Zerno,
and it does not need to be: Caddy selects the site by TLS SNI, so hostnames
share a port without colliding. Adding the stands needed no new port, no
firewall change and no container restart — one Caddyfile edit and a reload.

The certificate needs no special handling. Caddy obtains it over HTTP-01 on port
80, which it already publishes, and the same certificate serves both ports.

The real hostname lives in the `PRODUCTION_URL` and `DEV_URL` repository
variables and in each stand's `.env`; it is deliberately not written into this
repository.

## Isolation

Zerno shares only the Caddy ingress with the other applications on the host. It
owns:

- Compose projects `zerno` and `zerno-dev`;
- directories `/opt/zerno` and `/opt/zerno-dev`;
- the external Docker network `zerno-ingress`, joined by Caddy, with aliases
  `zerno-web` and `zerno-dev-web`;
- immutable `zerno-web` GHCR images, deployed by digest;
- deploy user `zerno-deploy` and two restricted sudo commands;
- locks `/run/lock/zerno-deploy.lock` and `/run/lock/zerno-dev-deploy.lock`.

Production and development have separate root-owned deploy scripts on purpose.
`zerno-dev-deploy` accepts only `dev-<commit>` versions and only touches
`/opt/zerno-dev`, so a leaked development credential cannot publish a release.

## ZenMoney keys: one per origin

ZenMoney binds `redirect_uri` to a consumer key, and Vite inlines the key into
the bundle at build time. Every origin therefore needs its own registration on
[developers.zenmoney.ru](http://developers.zenmoney.ru):

| Origin | Used by |
| --- | --- |
| `http://localhost:3000` | local `pnpm run dev` (upstream keys in `.env.development`) |
| `https://<host>:8444` | `ZENMONEY_DEV_CLIENT_ID` / `_SECRET` |
| `https://<host>:8443` | `ZENMONEY_CLIENT_ID` / `_SECRET` |

The consumer secret ends up inside the published bundle — this is inherent to an
application without a backend, and it is why these values are kept out of git
but are not treated as recoverable secrets. See `docs/fork-changes.md`.

## Server files

```text
/opt/zerno/compose.prod.yaml
/opt/zerno/.env                      root:root 0600
/opt/zerno/.release.env              written by the deploy script
/opt/zerno-dev/compose.dev.yaml
/opt/zerno-dev/.env                  root:root 0600
/opt/zerno-dev/.release.env          written by the deploy script
/usr/local/sbin/zerno-deploy         root:root 0755
/usr/local/sbin/zerno-dev-deploy     root:root 0755
/etc/sudoers.d/zerno-deploy          from deploy/zerno-deploy.sudoers, 0440
```

`.env` follows `deploy/zerno.env.example` and `deploy/zerno-dev.env.example`.
`APP_ORIGIN` is the complete HTTPS origin and is what the deploy script curls to
verify a release. `IMAGE_OWNER` is the GHCR namespace allowed to supply the
image: the deploy scripts pin it rather than accepting any namespace, so an
image named `zerno-web` from somewhere else cannot be pulled and run as root.

## First-time setup

1. Point the chosen hostname at the server.
2. Create the shared network: `docker network create zerno-ingress`.
3. Create the `zerno-deploy` user, install both scripts and the sudoers file,
   and add the deploy public key to `~zerno-deploy/.ssh/authorized_keys`.
4. Create both directories with their compose file and `.env`.
5. Connect the Caddy service to `zerno-ingress` — `docker network connect` on
   the running container, plus the same network in its compose file so the
   attachment survives a recreate — and append both site blocks from
   `deploy/Caddyfile.zerno.example` and `deploy/Caddyfile.zerno-dev.example`.
   Back up the Caddyfile and the compose file first, run `caddy validate`, then
   `caddy reload`. Check the other sites on that Caddy afterwards.
6. Register the two ZenMoney applications and store the keys as Actions secrets.

Nothing publishes a host port: Caddy reaches the containers over
`zerno-ingress`.

## Repository configuration

| Name | Type | Notes |
| --- | --- | --- |
| `VPS_HOST` | secret | |
| `VPS_USER` | secret | |
| `VPS_SSH_PRIVATE_KEY` | secret | |
| `VPS_SSH_KNOWN_HOSTS` | secret | |
| `ZENMONEY_CLIENT_ID` | secret | production |
| `ZENMONEY_CLIENT_SECRET` | secret | production |
| `ZENMONEY_DEV_CLIENT_ID` | secret | development |
| `ZENMONEY_DEV_CLIENT_SECRET` | secret | development |
| `VPS_PORT` | variable | defaults to `22` |
| `PRODUCTION_URL` | variable | required, the production origin |
| `DEV_URL` | variable | required, the development origin |

Environments: `development`, `production`, and `release-approval` with the owner
as a required reviewer.

## Flow

A push to `master` runs `CI` — typecheck, unit tests, and a bundle build with
placeholder credentials. A successful run on `master` triggers
`Deploy master to development`, which rebuilds with the development key, pushes
`zerno-web:dev-<sha>` to GHCR, attests it, and calls `zerno-dev-deploy` over
SSH. Development builds carry source maps; releases do not.

A release is started manually: run `Release Zerno` from `master` and enter a new
`X.Y.Z`. The workflow reruns every check against that exact commit, then waits in
the protected `release-approval` environment. Only approval creates the annotated
tag. It then builds with the production key, publishes and attests the image, and
calls `zerno-deploy`.

Both deploy scripts verify the image's version label before switching, then check
the public origin: `/version.json` must report the expected version and `/` must
return the Zerno application shell. A failed check fails the deployment.

## Rollback

Each deployment keeps the previous image reference in `.release.env.previous`.
To roll back, copy it over `.release.env` and run

```bash
docker compose -p zerno --env-file .env --env-file .release.env \
  -f compose.prod.yaml up -d --no-build --wait
```

There is no database, so a rollback is complete — nothing survives it that would
need migrating back.

## Not configured yet

- **Access control.** Neither stand authenticates visitors. Anyone signing in
  sees only their own ZenMoney data, but the bundle itself carries the consumer
  secret, so the stands should not stay reachable by strangers indefinitely. A
  `basic_auth` block is stubbed out in the development Caddyfile; Cloudflare
  Access or a WireGuard-only stand are the stronger options.
- **`og:url` and `og:image`** in `index.html` are still unset.
