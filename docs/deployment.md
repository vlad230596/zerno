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
the bundle at build time, so every origin needs its own key pair.

Registration is not self-service. `developers.zenmoney.ru` no longer exists; the
current route is a moderated form linked from the
[ZenMoney API wiki](https://github.com/zenmoney/ZenPlugins/wiki/ZenMoney-API),
which asks for a project name, a contact email and one callback URL. The keys
arrive by email, and the operators state they only register real projects that
implement OAuth 2.0. One submission covers one callback URL, so each stand needs
its own — and it helps if the URL already serves the application when the
request is reviewed.

| Origin | Used by |
| --- | --- |
| `http://localhost:3000` | local `pnpm run dev` (upstream keys in `.env.development`) |
| `https://<host>:8444` | `ZENMONEY_DEV_CLIENT_ID` / `_SECRET` |
| `https://<host>:8443` | `ZENMONEY_CLIENT_ID` / `_SECRET` |

The consumer secret ends up inside the published bundle — this is inherent to an
application without a backend, and it is why these values are kept out of git
but are not treated as recoverable secrets. See [fork-changes.md](./fork-changes.md).

## Server files

```text
/opt/zerno/compose.prod.yaml
/opt/zerno/.env                      root:root 0600
/opt/zerno/.release.env              written by the deploy script
/opt/zerno-dev/compose.dev.yaml
/opt/zerno-dev/.env                  root:root 0600
/opt/zerno-dev/.release.env          written by the deploy script
docker volume zerno-dev_push-data    push endpoints and the VAPID key
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
| `DEV_PUSH` | variable | `true` passes the push image to `zerno-dev-deploy`; see [Push alarm clock](#push-alarm-clock-development-stand-only-for-now) |

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

## Push alarm clock (development stand only, for now)

The evening notification needs something to wake the phone at a fixed time;
see [notifications.md](./features/notifications.md#доставка-что-не-работало-и-что-сделано).
That is `zerno-push` (`deploy/push`, `deploy/Dockerfile.push`): a dependency-free
Node service that sends an **empty** Web Push at `PUSH_TIMES` in
`PUSH_TIME_ZONE` (defaults `20:00,20:15,20:30`, `Europe/Moscow`). It stores only push
endpoints and its own VAPID key, generated on first start, in the `push-data`
volume. No ZenMoney token ever reaches it: the service worker computes the
notification text itself.

Why three pushes: the pushes arrive every evening, but the phone often wakes
with no network yet (the VPN asleep in Doze), and the worker's request then
fails. So the later pushes are retries. After a successful report that evening
the worker only re-shows it silently; after a failure it tries again. Every push
is `Urgency: high`, `TTL` one hour and carries `Topic: evening-check`: if the
phone is unreachable and several are queued at the push service, the topic makes
it keep only the newest, so the phone gets one push rather than a burst.

The default lives in the image (`DEFAULT_TIMES` in `deploy/push/lib.mjs`);
`compose.dev.yaml` passes `PUSH_TIMES` through empty unless `.env` sets it. So
changing the default takes a new push image (a deployment with `DEV_PUSH=true`),
and an `.env` value or an older installed compose file that hard-codes `20:00`
overrides it.

It is reached through the web container: nginx proxies `/push/` to the service
on the project's private network, so Caddy and the CSP need no change. A stand
without the service answers 502 there and otherwise works as before.

`Deploy master to development` always builds and attests the image, but passes
it to the server only when the repository variable `DEV_PUSH` is `true`: the
deploy script learnt an optional fourth argument, and an older installed copy
rejects it. With the argument, the script also checks the push image's version
label, starts the `push` compose profile, and verifies that
`$APP_ORIGIN/push/key` answers through the web container.

**Current state (29.09.2026):** done on the development stand. The new script
and compose file are installed (the previous copies are kept next to them as
`*.bak-20260929`), `DEV_PUSH=true` is set, `zerno-dev-push-1` runs next to
`zerno-dev-web-1`, and one phone is subscribed. Production is untouched:
`zerno-deploy`, `compose.prod.yaml` and `release.yml` know nothing about the
service yet.

The one-time steps, for reference and for production later, in this order:

1. Install the new `deploy/zerno-dev-deploy` as `/usr/local/sbin/zerno-dev-deploy`
   (root:root 0755) and the new `deploy/compose.dev.yaml` into `/opt/zerno-dev`.
   Optionally set `PUSH_TIMES` / `PUSH_TIME_ZONE` in `/opt/zerno-dev/.env`.
2. Set the repository variable `DEV_PUSH=true` and rerun the deployment. The
   script now also checks that `$APP_ORIGIN/push/key` answers.
3. In the application: switch the background check off and on, which subscribes
   this browser. To fire once without waiting for the evening:
   `docker exec zerno-dev-push-1 node server.mjs send`.

Keep the `push-data` volume: a new VAPID key orphans every subscription until
each browser opens the application again and re-subscribes. The service logs,
in `docker logs zerno-dev-push-1`, its schedule at start, then for every send a
line with the slot and the local send time to the second, and one line per
subscription with its push service's answer and how long it took (`201` is
delivered to FCM, `404`/`410` drop the subscription):

```
… scheduled 2026-10-04 20:15: sending to 1 at 20:15:12 Europe/Moscow
… scheduled 2026-10-04 20:15: #1 fcm.googleapis.com …a1b2c3 → 201 in 180 ms
```

The schedule is polled every 20 seconds, so a send lands up to 20 s after its
slot. A notification that shows minutes later than the logged send time (once
20:05:28 for a 20:00 push) was held up by the push service or Doze, not here.

Locally: `DATA_DIR=.push-data PORT=8787 node deploy/push/server.mjs` next to
`vite preview` (a build, because the worker exists only there); both Vite
servers proxy `/push` to port 8787.

## Not configured yet

- **Access control.** Neither stand authenticates visitors. Anyone signing in
  sees only their own ZenMoney data, but the bundle itself carries the consumer
  secret, so the stands should not stay reachable by strangers indefinitely. A
  `basic_auth` block is stubbed out in the development Caddyfile; Cloudflare
  Access or a WireGuard-only stand are the stronger options.
- **`og:url` and `og:image`** in `index.html` are still unset.
