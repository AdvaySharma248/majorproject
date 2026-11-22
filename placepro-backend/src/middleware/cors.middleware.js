function getCorsOrigin(requestOrigin, callback) {
  const configuredOrigins = (process.env.FRONTEND_URL || "http://localhost:3000")
    .split(",")
    .map((origin) => origin.trim())
    .filter(Boolean);

  if (!requestOrigin || configuredOrigins.includes(requestOrigin)) {
    return callback(null, true);
  }

  return callback(null, false);
}

module.exports = { getCorsOrigin };
