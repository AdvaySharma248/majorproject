const { ProfileProviderError, requestJson } = require("./profile-provider-error");

const API_VERSION = "2022-11-28";
const apiHeaders = {
  Accept: "application/vnd.github+json",
  "X-GitHub-Api-Version": API_VERSION,
};

async function getGithubUser(username) {
  return requestJson(`https://api.github.com/users/${encodeURIComponent(username)}`, {
    headers: apiHeaders,
  });
}

async function fetchGithubSnapshot(username) {
  const [profile, repositories] = await Promise.all([
    getGithubUser(username),
    requestJson(
      `https://api.github.com/users/${encodeURIComponent(username)}/repos?type=owner&sort=updated&per_page=100`,
      { headers: apiHeaders }
    ),
  ]);

  if (!Array.isArray(repositories)) {
    throw new Error("GitHub returned an invalid repositories response");
  }

  const sampledStars = repositories.reduce((total, repo) => total + (repo.stargazers_count || 0), 0);
  const sampledForks = repositories.reduce((total, repo) => total + (repo.forks_count || 0), 0);
  const languageCounts = repositories.reduce((counts, repo) => {
    if (repo.language) counts[repo.language] = (counts[repo.language] || 0) + 1;
    return counts;
  }, {});

  return {
    raw: { profile, repositories },
    normalized: {
      providerUserId: profile.id,
      username: profile.login,
      profileUrl: profile.html_url,
      followers: profile.followers,
      publicRepositories: profile.public_repos,
      publicGists: profile.public_gists,
      accountCreatedAt: profile.created_at,
      sampledRepositoryCount: repositories.length,
      sampledStars,
      sampledForks,
      sampledLanguages: languageCounts,
      repositorySampleLimit: 100,
    },
    apiVersion: API_VERSION,
  };
}

async function fetchGithubRepository(username, repository) {
  const encodedRepo = `${encodeURIComponent(username)}/${encodeURIComponent(repository)}`;
  const repositoryData = await requestJson(`https://api.github.com/repos/${encodedRepo}`, {
    headers: apiHeaders,
  });
  if (!repositoryData || typeof repositoryData.default_branch !== "string" ||
      typeof repositoryData.name !== "string" || !repositoryData.owner?.login) {
    throw new ProfileProviderError("GitHub returned an invalid repository response", {
      code: "PROFILE_PROVIDER_BAD_RESPONSE",
    });
  }
  const tree = await requestJson(
    `https://api.github.com/repos/${encodedRepo}/git/trees/${encodeURIComponent(repositoryData.default_branch)}?recursive=1`,
    { headers: apiHeaders },
  );
  if (!tree || !Array.isArray(tree.tree) || tree.truncated) {
    throw new ProfileProviderError("GitHub returned an incomplete repository tree", {
      code: "PROFILE_PROVIDER_BAD_RESPONSE",
    });
  }

  const paths = tree.tree
    .filter((entry) => entry.type === "blob" && typeof entry.path === "string")
    .map((entry) => entry.path.toLowerCase());
  const readmePresent = paths.some((path) => /^readme(?:\.[^/]+)?$/.test(path));
  const hasTests = paths.some((path) =>
    /(^|\/)(__tests__|tests?|specs?)(\/|$)/.test(path) ||
    /(^|\/)[^/]+\.(test|spec)\.[^/]+$/.test(path)
  );
  const hasDocker = paths.some((path) => /(^|\/)dockerfile(?:\.[^/]*)?$/.test(path));
  const hasCi = paths.some((path) => path.startsWith(".github/workflows/"));

  return {
    repository: repositoryData,
    signals: {
      readmePresent,
      hasTests,
      hasDocker,
      hasCi,
      hasDemo: Boolean(repositoryData.homepage),
      isFork: Boolean(repositoryData.fork),
    },
    evidence: {
      stars: Number(repositoryData.stargazers_count) || 0,
      forks: Number(repositoryData.forks_count) || 0,
      language: repositoryData.language || null,
      topics: Array.isArray(repositoryData.topics) ? repositoryData.topics : [],
      createdAt: repositoryData.created_at || null,
      updatedAt: repositoryData.updated_at || null,
      pushedAt: repositoryData.pushed_at || null,
      defaultBranch: repositoryData.default_branch || null,
    },
  };
}

module.exports = { getGithubUser, fetchGithubSnapshot, fetchGithubRepository, API_VERSION };
