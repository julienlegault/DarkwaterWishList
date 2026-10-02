# Darkwater Wish List

A wish list application for Darkwater Games. Users will be able to track
trading cards they want, and receive an email notification when Darkwater's
inventory (via SortSwift) has the card in stock.

This repository is split into two independent projects:

```
backend/   Laravel API (PHP, SQLite)
frontend/  React + TypeScript app (Vite)
```

## Status

This PR establishes the application foundation only: a working Laravel API,
a working React/TypeScript frontend, a documented API boundary between them,
and basic health-check functionality with automated tests on both sides.
Authentication, card data, wish lists, and SortSwift integration are not yet
implemented.

## Local development

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
Run. The container serves the frontend at `/`, the API at `/api/*`, and applies
database migrations when it starts.

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

2. Enable Cloud Run, Artifact Registry, IAM Credentials, and Security Token
   Service, create the Docker repository, and create the deploy service account:

   ```sh
   gcloud config set project "$PROJECT_ID"
   gcloud services enable run.googleapis.com artifactregistry.googleapis.com \
     iamcredentials.googleapis.com sts.googleapis.com
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

   The workflow uses short-lived GitHub OIDC credentials; do not create or store
   a service-account JSON key.

The first successful workflow run creates the service. In the Cloud Run service
configuration, set `APP_KEY` to a newly generated Laravel key (run
`php artisan key:generate --show` in `backend/`), and configure `APP_URL`,
`GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`, and `GOOGLE_REDIRECT_URI` for the
service's HTTPS URL. Register the callback URL
`https://YOUR_SERVICE_URL/auth/google/callback` in the Google OAuth client.
Set `FRONTEND_URL` to the service URL and `SANCTUM_STATEFUL_DOMAINS` to its
hostname without the scheme. Keep OAuth credentials in Secret Manager rather
than source control.

**Data storage:** the local app defaults to SQLite. Cloud Run's local filesystem
is ephemeral, so its SQLite database and card catalog can be lost when an
instance is replaced, and data is not shared between instances. This setup is
for initial testing only. For durable testing, provision Cloud SQL for MySQL,
attach it to the Cloud Run service, grant the runtime service account
`roles/cloudsql.client`, and set `DB_CONNECTION=mysql`, `DB_DATABASE`,
`DB_USERNAME`, `DB_PASSWORD`, and `DB_SOCKET=/cloudsql/INSTANCE_CONNECTION_NAME`
in the service configuration. The startup migration command will then apply
migrations to that database. Load the Scryfall catalog after deploying before
trying card search; the catalog is not bundled with the application.
