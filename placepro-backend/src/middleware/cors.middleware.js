function configuredOrigins() {
  return (process.env.FRONTEND_URL || "http://localhost:3000")
    .split(",")
    .map((origin) => origin.trim())
    .filter(Boolean);
}

function isAllowedOrigin(requestOrigin) {
  return !requestOrigin || configuredOrigins().includes(requestOrigin);
}

function getCorsOrigin(requestOrigin, callback) {
  if (isAllowedOrigin(requestOrigin)) {
    return callback(null, true);
  }

  return callback(null, false);
}

function requireAllowedOrigin(req, res, next) {
  if (isAllowedOrigin(req.get("origin"))) return next();
  return res.status(403).json({
    error: { code: "ORIGIN_NOT_ALLOWED", message: "Request origin is not allowed" },
  });
}

module.exports = { getCorsOrigin, isAllowedOrigin, requireAllowedOrigin };
