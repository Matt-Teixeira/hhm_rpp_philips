## Run a job

Use the runtime image through the `app` service:

```sh
docker compose run --rm app_tools bash -lc "npm run philips_ct"
```

RUN ON FIRST DEPLOY TO NUKE AND UPDATE node_moduels CACHE: fresh install before running the job

```sh
docker compose run --rm app_tools bash -lc "npm ci --omit=dev && npm run philips_ct"
```