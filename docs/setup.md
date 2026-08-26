# Setup

Superseded 2026-08-26 by the fleet paradigm — see `CLAUDE.md` (this repo) and
`data_acquisition/docs/migration_CLAUDE.md` Part 1/Part 3.

The instructions that used to live here pre-dated the migration and were wrong
in ways that would break a fresh deployment:

- They cloned the retired shared `utils` repo (`AvanteHS-RTT/utils`) — `utils/`
  has been tracked in THIS repo since commit `9cb071c`.
- They ran jobs through the deleted root-running `app` service and `npm ci`'d
  into the retired shared node_modules cache.

Bring-up on a new server: `data_acquisition/docs/migration_CLAUDE.md`
"Bringing up a migrated app on a new server".
