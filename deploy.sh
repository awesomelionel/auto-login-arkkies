#!/usr/bin/env bash
# Deploy to Cloud Run. Credentials come from .env at deploy time, so they are
# never baked into the image (.env is in .dockerignore) or committed here.
set -euo pipefail

PROJECT="${PROJECT:-$(gcloud config get-value project)}"
# gcloud config often holds the project *number*, which Cloud Run rejects.
if [[ "$PROJECT" =~ ^[0-9]+$ ]]; then
  PROJECT="$(gcloud projects describe "$PROJECT" --format='value(projectId)')"
fi
REGION="${REGION:-asia-east1}"
SERVICE="${SERVICE:-auto-login-arkkies}"

set -a; source .env; set +a

gcloud run deploy "$SERVICE" \
  --source . \
  --project "$PROJECT" \
  --region "$REGION" \
  --memory 2Gi \
  --cpu 2 \
  --timeout 300 \
  --set-env-vars "EMAIL=$EMAIL,PASSWORD=$PASSWORD" \
  --no-allow-unauthenticated
