# Review runner

A reviewer on a workstation lacks what CI has: the database, the command-line tools the tests shell out
to. The suite then passes with hundreds of skips, and a skipped test is not evidence. Give every reviewer
one command that runs a checkout's tests the way CI does.

## Shape

`review-test.sh <checkout dir> [command ...]`

- **Image:** build CI's own test image from the repository's Dockerfile (the one the CI workflow uses),
  once, under a local tag. It already contains the tools the tests need.
- **Services:** start what the CI job declares as services (for example Postgres with the same user,
  password and database) on a private Docker network, with the data directory on tmpfs. Name the
  containers and the network after the script's process id and remove them in an `EXIT` trap, so parallel
  reviews do not collide and nothing is left behind.
- **Checkout:** mount the reviewer's worktree; run as the host user so no root-owned files appear in it.
- **Dependencies:** keep the virtualenv in a Docker volume keyed by a hash of the lockfile, never in the
  checkout. Two branches with different dependencies then never share an environment. Sync it under a
  `flock` on that key; run the tests without the lock.
- **Environment:** set the variables the CI job sets (database URL by service name), and fail at once if a
  required tool is missing inside the container.

## Example (Python with uv, Postgres)

A pattern, not a drop-in script. Replace the three project-specific values: `CI_IMAGE_DIR` (the directory
of the Dockerfile the CI workflow builds), `PROJECT_DIR` (where the lockfile and the tests live inside
the checkout) and the service settings, which must equal the CI job's.

```bash
#!/usr/bin/env bash
set -euo pipefail
checkout="$(realpath "$1")"; shift
[[ $# -gt 0 ]] || set -- uv run pytest -q -rs
CI_IMAGE_DIR="${CI_IMAGE_DIR:?directory of the CI test image Dockerfile}"
PROJECT_DIR="${PROJECT_DIR:-.}"

image="review-ci:local"
docker image inspect "$image" >/dev/null 2>&1 \
  || docker build -q -t "$image" "$CI_IMAGE_DIR" >/dev/null

run="review-$$"
trap 'docker rm -f "$run-postgres" >/dev/null 2>&1; docker network rm "$run" >/dev/null 2>&1' EXIT
docker network create "$run" >/dev/null
docker run -d --rm --name "$run-postgres" --network "$run" --network-alias postgres \
  -e POSTGRES_USER=app -e POSTGRES_PASSWORD=app -e POSTGRES_DB=app \
  --tmpfs /var/lib/postgresql postgres:18-alpine >/dev/null
for _ in $(seq 1 60); do docker exec "$run-postgres" pg_isready -U app -q && break; sleep 1; done

key="$(sha256sum "$checkout/$PROJECT_DIR/uv.lock" | cut -c1-12)"
volume="review-venv-$key"
common=(--user "$(id -u):$(id -g)" -e HOME=/tmp/home -e UV_PROJECT_ENVIRONMENT=/venv/env
  -e UV_CACHE_DIR=/venv/cache -e UV_LINK_MODE=copy -v "$checkout:/work"
  -v "$(command -v uv):/usr/local/bin/uv:ro" --mount "type=volume,src=$volume,dst=/venv" -w "/work/$PROJECT_DIR")
(
  flock 9
  if ! docker volume inspect "$volume" >/dev/null 2>&1; then
    docker volume create "$volume" >/dev/null
    docker run --rm -v "$volume:/venv" postgres:18-alpine chown "$(id -u):$(id -g)" /venv
  fi
  docker run --rm "${common[@]}" "$image" bash -ec 'mkdir -p "$HOME"; uv sync --frozen >/dev/null'
) 9>"/tmp/review-$key.lock"

docker run --rm --network "$run" \
  -e DATABASE_URL=postgresql+psycopg://app:app@postgres:5432/app -e UV_NO_SYNC=1 -e UV_FROZEN=1 \
  "${common[@]}" "$image" bash -ec 'mkdir -p "$HOME"; exec "$@"' review "$@"
```

## Check it before trusting it

Run it once on the main branch with the tests that skipped locally. It is ready when the only skips left
are ones CI also has. Compare the pass count with CI's for the same commit.

Keep the script outside version control or in an ignored directory unless the owner wants it in the
repository.
