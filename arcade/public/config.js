// Deployment config — served at /config.js. The server generates this from
// its BASE_PATH env (default ""). Locally it's an empty base; behind a
// reverse proxy at a subpath (e.g. /OxArcade) the server writes the prefix
// here so every absolute URL the frontend builds lands inside it.
window.OX_CONFIG = { basePath: "" };
