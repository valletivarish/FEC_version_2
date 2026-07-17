// Populated at deploy time when the static assets are pushed to S3, so the
// dashboard can reach the API Gateway endpoint even though it is no longer
// served from the same origin. Left blank for local/dev use, where the
// FastAPI app serves both the API and these static files from one origin.
window.RUNTIME_CONFIG = {
  apiBase: "__API_BASE__",
};
