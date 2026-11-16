const PROJECT_FORMULA_VERSION = "project-v1";
const AUTOMATED_WEIGHTS = {
  readme: 20,
  tests: 25,
  docker: 10,
  ci: 20,
  demo: 10,
  originalRepository: 15,
};

function scoreProjectRepository(signals) {
  const breakdown = {
    readme: signals.readmePresent ? AUTOMATED_WEIGHTS.readme : 0,
    tests: signals.hasTests ? AUTOMATED_WEIGHTS.tests : 0,
    docker: signals.hasDocker ? AUTOMATED_WEIGHTS.docker : 0,
    ci: signals.hasCi ? AUTOMATED_WEIGHTS.ci : 0,
    demo: signals.hasDemo ? AUTOMATED_WEIGHTS.demo : 0,
    originalRepository: signals.isFork ? 0 : AUTOMATED_WEIGHTS.originalRepository,
  };
  const score = Object.values(breakdown).reduce((total, value) => total + value, 0);
  return { score, breakdown, formulaVersion: PROJECT_FORMULA_VERSION };
}

function combineProjectScore(automaticScore, trainerScore) {
  if (!Number.isFinite(automaticScore) || !Number.isFinite(trainerScore)) {
    throw new TypeError("Project scores must be finite numbers");
  }
  return Math.round((automaticScore * 0.4 + trainerScore * 0.6) * 100) / 100;
}

module.exports = {
  PROJECT_FORMULA_VERSION,
  scoreProjectRepository,
  combineProjectScore,
};
