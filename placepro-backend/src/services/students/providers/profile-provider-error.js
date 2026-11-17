class ProfileProviderError extends Error {
  constructor(message, { code = "PROFILE_PROVIDER_ERROR", statusCode = 502 } = {}) {
    super(message);
    this.name = "ProfileProviderError";
    this.code = code;
    this.statusCode = statusCode;
  }
}

async function requestJson(url, { headers = {}, method = "GET", body, responseType = "json" } = {}) {
  let response;
  try {
    response = await fetch(url, {
      method, body,
      headers: {
        Accept: "application/json",
        "User-Agent": "PlacePro-Profile-Intelligence",
        ...headers,
      },
      signal: AbortSignal.timeout(10000),
    });
  } catch (error) {
    throw new ProfileProviderError("The profile provider could not be reached", {
      code: error.name === "TimeoutError" ? "PROFILE_PROVIDER_TIMEOUT" : "PROFILE_PROVIDER_UNAVAILABLE",
    });
  }

  if (!response.ok) {
    if (response.status === 401) {
      throw new ProfileProviderError("The profile provider rejected the request", {
        code: "PROFILE_PROVIDER_UNAUTHORIZED",
        statusCode: 503,
      });
    }
    if (response.status === 403 && response.headers.get("x-ratelimit-remaining") === "0") {
      throw new ProfileProviderError("GitHub's API rate limit was reached", {
        code: "PROFILE_PROVIDER_RATE_LIMITED",
        statusCode: 503,
      });
    }
    if (response.status === 404) {
      throw new ProfileProviderError("The provider profile was not found", {
        code: "PROFILE_NOT_FOUND",
        statusCode: 404,
      });
    }

    throw new ProfileProviderError("The profile provider rejected the request", {
      code: [403, 429].includes(response.status) ? "PROFILE_PROVIDER_RATE_LIMITED" : "PROFILE_PROVIDER_ERROR",
      statusCode: [403, 429].includes(response.status) ? 503 : 502,
    });
  }

  try {
    return responseType === "text" ? await response.text() : await response.json();
  } catch {
    throw new ProfileProviderError("The profile provider returned an invalid response", {
      code: "PROFILE_PROVIDER_BAD_RESPONSE",
    });
  }
}

module.exports = { ProfileProviderError, requestJson };
