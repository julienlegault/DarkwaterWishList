# Darkwater Wish List

A wish list application for Darkwater Games. Users will be able to track
trading cards they want, and receive an email notification when Darkwater's
inventory (via SortSwift) has the card in stock.

This repository is split into two independent projects:

```
backend/   Laravel API (PHP, SQLite locally, MySQL on Cloud Run)
frontend/  React + TypeScript app (Vite)
```

## Status

Users can sign in, manage multiple wish lists, and add cards from the Scryfall
catalog. Each list has a stored notification preference, but SortSwift
integration and email notification delivery are not yet implemented.

## Local development

### Dev container

Open the repository in a Dev Container (for example, in VS Code). The container
uses PHP 8.5, Composer 2, and Node.js 22. On creation it installs dependencies,
initializes missing environment files and the SQLite database, and runs
migrations. Laravel and Vite start automatically whenever the container starts;
before starting them, the container downloads and imports the Scryfall card
catalog. Their forwarded ports are 8000 and 5173 respectively. Existing `.env`
files and application keys are preserved. Server logs are in
`/tmp/darkwater-laravel.log` and `/tmp/darkwater-vite.log`.

#### Codespace email login

When running in a GitHub Codespace, you can login by simply entering an email
address instead of requiring Google OAuth setup. Click "Sign in with Email" and
enter any email address to create or access your account. This email login is
only available in GitHub Codespace environments and will not appear when running
the application locally on your machine (where you'll need to use Google OAuth
or set `VITE_CODESPACE_LOGIN=true` in your frontend `.env` if you want to test
the email login locally).

The browser uses the forwarded Vite URL; Vite proxies authentication and API
requests to Laravel within the container. Restart the development servers after
changing their configuration.

### Manual setup

Run the backend and frontend in separate terminals.

### Backend (Laravel)

```bash
cd backend
composer install
cp .env.example .env
php artisan key:generate
touch database/database.sqlite
php artisan migrate
php artisan serve
```

The API is served at `http://127.0.0.1:8000` with endpoints under `/api/*`.
See [`backend/README.md`](backend/README.md) for details.

### Frontend (React + TypeScript)

```bash
cd frontend
npm install
cp .env.example .env
npm run dev
```

The app is served at `http://localhost:5173` and proxies `/api/*` requests to
the backend during development. See
[`frontend/README.md`](frontend/README.md) for details.

## Tests

```bash
# Backend
cd backend && php artisan test

# Frontend
cd frontend && npm run test
```

## Configuration and secrets

Neither project commits its `.env` file. Copy the provided `.env.example`
files and adjust values locally; secrets must never be committed to source
control.

## Deploy to Google Cloud Run

The `Deploy to Google Cloud Run` workflow runs on every push to `main` (and can
also be started manually from the Actions tab). It runs the frontend and backend
tests, builds a container containing both applications, and deploys it to Cloud
Run. The container serves the frontend at `/` and the API at `/api/*`.
Cloud SQL stores wish lists, sessions, and a single shared catalog. A separate
Cloud Run job applies migrations before deployment, and another job refreshes
the catalog daily via Cloud Scheduler. Web instances do not download the catalog.
These managed resources incur ongoing charges.

### One-time Google Cloud setup

1. Create or select a Google Cloud project and enable billing. Set these shell
   variables in Cloud Shell, replacing the sample values:

   ```sh
   PROJECT_ID="your-project-id"
   REGION="us-central1"
   REPOSITORY="wishlist"
   GITHUB_REPOSITORY="OWNER/REPO"
   POOL="github"
   PROVIDER="github"
   DEPLOYER="github-deployer"
   PROJECT_NUMBER="$(gcloud projects describe "$PROJECT_ID" --format='value(projectNumber)')"
   ```

2. Enable Cloud Run, Cloud SQL, Cloud Scheduler, Secret Manager, Artifact Registry, IAM Credentials, and Security Token
   Service, create the Docker repository, and create the deploy service account:

   ```sh
   gcloud config set project "$PROJECT_ID"
   gcloud services enable run.googleapis.com sqladmin.googleapis.com \
     cloudscheduler.googleapis.com secretmanager.googleapis.com \
     artifactregistry.googleapis.com iamcredentials.googleapis.com sts.googleapis.com
   gcloud artifacts repositories create "$REPOSITORY" \
     --repository-format=docker --location="$REGION"
   gcloud iam service-accounts create "$DEPLOYER"
   DEPLOYER_EMAIL="${DEPLOYER}@${PROJECT_ID}.iam.gserviceaccount.com"
   for ROLE in roles/run.admin roles/artifactregistry.writer roles/iam.serviceAccountUser; do
     gcloud projects add-iam-policy-binding "$PROJECT_ID" \
       --member="serviceAccount:${DEPLOYER_EMAIL}" --role="$ROLE"
   done
   ```

3. Create the GitHub OIDC provider, restricted to pushes on this repository's
   `main` branch, and allow that repository to use the deployer account:

   ```sh
   gcloud iam workload-identity-pools create "$POOL" \
     --location=global --display-name="GitHub Actions"
   gcloud iam workload-identity-pools providers create-oidc "$PROVIDER" \
     --location=global --workload-identity-pool="$POOL" \
     --display-name="GitHub Actions" \
     --issuer-uri="https://token.actions.githubusercontent.com" \
     --attribute-mapping="google.subject=assertion.sub,attribute.repository=assertion.repository,attribute.ref=assertion.ref" \
     --attribute-condition="assertion.repository == '${GITHUB_REPOSITORY}' && assertion.ref == 'refs/heads/main'"
   gcloud iam service-accounts add-iam-policy-binding "$DEPLOYER_EMAIL" \
     --role=roles/iam.workloadIdentityUser \
     --member="principalSet://iam.googleapis.com/projects/${PROJECT_NUMBER}/locations/global/workloadIdentityPools/${POOL}/attribute.repository/${GITHUB_REPOSITORY}"
   ```

4. In repository **Settings → Secrets and variables → Actions → Variables**,
   add:

   | Variable | Value |
   | --- | --- |
   | `GCP_PROJECT_ID` | Google Cloud project ID |
   | `GCP_REGION` | Region used for Artifact Registry and Cloud Run |
   | `GCP_ARTIFACT_REGISTRY_REPOSITORY` | Artifact Registry repository name |
   | `CLOUD_RUN_SERVICE_NAME` | Cloud Run service name |
   | `GCP_WORKLOAD_IDENTITY_PROVIDER` | `projects/PROJECT_NUMBER/locations/global/workloadIdentityPools/POOL/providers/PROVIDER` |
   | `GCP_DEPLOY_SERVICE_ACCOUNT` | Deployer service account email |
   | `GCP_RUNTIME_SERVICE_ACCOUNT` | Cloud Run runtime service account email |
   | `GCP_CLOUD_SQL_INSTANCE` | Cloud SQL connection name, `PROJECT:REGION:INSTANCE` |
   | `GCP_DB_DATABASE` | MySQL database name |
   | `GCP_DB_USERNAME` | MySQL application user |
   | `GCP_DB_PASSWORD_SECRET` | Secret Manager secret name for the database password |
   | `GCP_APP_KEY_SECRET` | Secret Manager secret name for the Laravel application key |

   The workflow uses short-lived GitHub OIDC credentials; do not create or store
   a service-account JSON key.

### Configure shared storage before deployment

1. Provision a Cloud SQL for MySQL 8 instance in the same project and region,
   with public IP enabled for the Cloud SQL connector. Create an application
   database and user. Enable automated backups and point-in-time recovery,
   configure a storage limit/alerts, and test restores. Size the instance and
   its connection limit for the Cloud Run instance count and the import job.
   The initial import and each replacement require additional free database
   storage for the transaction; monitor disk usage.
2. Create a dedicated runtime service account. Grant it `roles/cloudsql.client`
   on the project and `roles/secretmanager.secretAccessor` on the two secrets
   below. Grant the
   deployer `roles/iam.serviceAccountUser` on the runtime account. Store the
   MySQL password and a stable Laravel key (generate with
   `php artisan key:generate --show` in `backend/`) in Secret Manager, and set
   the GitHub variables above. Do not rotate `APP_KEY` on each deploy.
   If the existing service already sets `APP_KEY` or `DB_PASSWORD` as plain
   environment variables, remove those entries before deploying them as secret
   references. Remove any `DB_URL`, `SESSION_CONNECTION`, or cache connection
   override that points to a different database.
3. Run the deployment workflow. It creates/updates the migration and catalog
   jobs, runs migrations once, then deploys the service with the database socket,
   shared database sessions, and secrets. A migration failure stops deployment.
   The image refuses to start the web server without `DB_CONNECTION=mysql`.
   The workflow overwrites these database settings and job configurations on
   every deploy; change the GitHub variables rather than editing them in Cloud Run.
4. Populate the fresh catalog once and check that the execution succeeds:

   ```sh
   SERVICE="your-cloud-run-service"
   gcloud run jobs execute "${SERVICE}-catalog" --project "$PROJECT_ID" \
     --region "$REGION" --wait
   ```

   Search will be empty until this initial import completes. This cutover starts
   with a **fresh** Cloud SQL database: it does not copy data from existing
   ephemeral SQLite instances. If existing lists matter, export and migrate
   them before switching traffic.

5. Create a dedicated scheduler service account and grant it
   `roles/run.invoker` on the catalog job. Create a Cloud Scheduler HTTP job
   that calls the Cloud Run Admin API with an OAuth token (not OIDC):

   ```sh
   SCHEDULER_SA="wishlist-scheduler@${PROJECT_ID}.iam.gserviceaccount.com"
   gcloud iam service-accounts create wishlist-scheduler
   gcloud run jobs add-iam-policy-binding "${SERVICE}-catalog" \
     --project "$PROJECT_ID" --region "$REGION" \
     --member "serviceAccount:${SCHEDULER_SA}" --role roles/run.invoker
   gcloud scheduler jobs create http "${SERVICE}-catalog-daily" \
     --project "$PROJECT_ID" --location "$REGION" \
     --schedule "0 4 * * *" --time-zone "Etc/UTC" --http-method POST \
     --uri "https://run.googleapis.com/v2/projects/${PROJECT_ID}/locations/${REGION}/jobs/${SERVICE}-catalog:run" \
     --oauth-service-account-email "$SCHEDULER_SA"
   ```

   The identity creating the scheduler job must have `iam.serviceAccounts.actAs`
   on the scheduler service account. Cloud Scheduler reports whether the API
   accepted the execution, not whether the import succeeded. Monitor Cloud Run
   job execution failures and alert on missed/failed refreshes. The job has a
   one-hour timeout and no automatic retries; rerun it manually after fixing
   failures. Concurrent imports fail rather than overlap.

In the Cloud Run service configuration, configure `APP_URL`,
`GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`, and `GOOGLE_REDIRECT_URI` for the
service's HTTPS URL. Register the callback URL
`https://YOUR_SERVICE_URL/auth/google/callback` in the Google OAuth client.
Set `FRONTEND_URL` to the service URL and `SANCTUM_STATEFUL_DOMAINS` to its
hostname without the scheme. Keep OAuth credentials in Secret Manager rather
than source control.

Cloud SQL persists data across Cloud Run instances and revisions, but it is not
a substitute for tested backups. The catalog is not bundled with the image.
