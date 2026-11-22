const { logger } = require("../utils/logger");

function errorHandler(err, req, res, _next) {
  const statusCode = Number.isInteger(err.statusCode) ? err.statusCode : 500;
  logger.error("request.failed", err, {
    requestId: req.requestId,
    method: req.method,
    path: req.originalUrl,
    statusCode,
  });

  res.status(statusCode).json({
    error: {
      code: err.code || "INTERNAL_SERVER_ERROR",
      message: statusCode < 500 && err.message ? err.message : "An unexpected error occurred",
      ...(statusCode < 500 && Array.isArray(err.details) ? { details: err.details } : {}),
    },
  });
}

module.exports = { errorHandler };
