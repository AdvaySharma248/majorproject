const express = require("express");
const cors = require("cors");
const cookieParser = require("cookie-parser");
const { errorHandler } = require("../../middleware/error.middleware");
const { getCorsOrigin, requireAllowedOrigin } = require("../../middleware/cors.middleware");
const { requestLogger } = require("../../middleware/request-logger.middleware");

function createServiceApp(router, { name = "service" } = {}) {
  const app = express();

  app.use(
    cors({
      origin: getCorsOrigin,
      credentials: true,
    })
  );
  app.use(requireAllowedOrigin);
  app.use(express.json({ limit: "5mb" }));
  app.use(cookieParser());
  app.use(requestLogger(name));
  app.use("/api/v1", router);
  app.use(errorHandler);

  return app;
}

module.exports = { createServiceApp };
