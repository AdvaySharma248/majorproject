const { fetchGithubSnapshot } = require("./github.provider");
const { requestJson, ProfileProviderError } = require("./profile-provider-error");
const DAY = 86400000;

function parsePublicCalendarHtml(html) {
  const fail = () => { throw new ProfileProviderError("GitHub's public contribution calendar changed or was incomplete", { code: "GITHUB_CALENDAR_HTML_CHANGED" }); };
  if (typeof html !== "string" || html.length < 1000 || !html.includes("js-yearly-contributions")) return fail();
  const attributes = value => Object.fromEntries(Array.from(value.matchAll(/([\w-]+)="([^"]*)"/g), match => [match[1], match[2]]));
  const tooltips = new Map();
  for (const match of html.matchAll(/<tool-tip\b([^>]*)>([\s\S]*?)<\/tool-tip>/gi)) {
    const attr = attributes(match[1]);
    if (!attr.for) continue;
    const text = match[2].replace(/<[^>]*>/g, "").replace(/&nbsp;/g, " ").replace(/&amp;/g, "&").trim();
    tooltips.set(attr.for, text);
  }
  const days = [];
  for (const match of html.matchAll(/<td\b([^>]*\bdata-date="\d{4}-\d{2}-\d{2}"[^>]*)><\/td>/gi)) {
    const attr = attributes(match[1]);
    const tooltip = tooltips.get(attr.id);
    if (!tooltip) return fail();
    let count;
    if (/^No contributions on /i.test(tooltip)) count = 0;
    else {
      const numeric = tooltip.match(/^([\d,]+) contributions? on /i);
      if (!numeric) return fail();
      count = Number(numeric[1].replace(/,/g, ""));
    }
    const level = Number(attr["data-level"]);
    if (!Number.isInteger(count) || count < 0 || !Number.isInteger(level) || level < 0 || level > 4) return fail();
    days.push({ date: attr["data-date"], count, level });
  }
  days.sort((a, b) => a.date.localeCompare(b.date));
  if (days.length < 360 || days.length > 380 || new Set(days.map(d => d.date)).size !== days.length) return fail();
  const first = Date.parse(`${days[0].date}T00:00:00Z`);
  if (days.some((d, i) => d.date !== new Date(first + i * DAY).toISOString().slice(0, 10))) return fail();
  const header = html.match(/<h2\b[^>]*>[\s\S]*?([\d,]+)\s+contributions\s+in\s+the\s+last\s+year[\s\S]*?<\/h2>/i);
  if (!header) return fail();
  const total = Number(header[1].replace(/,/g, ""));
  if (days.reduce((sum, day) => sum + day.count, 0) !== total) return fail();
  return { totalContributions: total, days };
}

function streaksFor(days) {
  let longestStreak = 0, run = 0;
  for (const day of days) { run = day.count > 0 ? run + 1 : 0; longestStreak = Math.max(longestStreak, run); }
  let end = days.length - 1;
  // GitHub includes today (sometimes incomplete). If its count is zero, yesterday can continue the streak.
  if (days[end]?.count === 0) end--;
  let currentStreak = 0;
  for (let i = end; i >= 0 && days[i].count > 0; i--) currentStreak++;
  return { currentStreak, currentStreakAtLeast: currentStreak > 0 && currentStreak === end + 1, longestStreak };
}

async function fetchContributionCalendar(username) {
  try {
    const html = await requestJson(`https://github.com/users/${encodeURIComponent(username)}/contributions`, {
      headers: { Accept: "text/html", "Accept-Language": "en" },
      responseType: "text",
    });
    if (typeof html !== "string" || !html.includes(`/${username}`)) throw new ProfileProviderError("GitHub's public calendar did not match this username", { statusCode: 404, code: "PROFILE_NOT_FOUND" });
    const parsed = parsePublicCalendarHtml(html);
    const days = parsed.days.map(({ date, count, level }) => ({ date, count, level }));
    return { calendar: { from: days[0].date, to: days.at(-1).date, totalContributions: parsed.totalContributions, includesSharedPrivateCounts: false, ...streaksFor(days), days }, calendarUnavailable: null, calendarErrorCode: null };
  } catch (error) {
    const messages = {
      PROFILE_NOT_FOUND: ["This GitHub profile or public calendar could not be found.", "PROFILE_NOT_FOUND"],
      PROFILE_PROVIDER_RATE_LIMITED: ["GitHub's public page rate limit was reached. Please try again later.", "GITHUB_RATE_LIMITED"],
      PROFILE_PROVIDER_UNAVAILABLE: ["GitHub could not be reached. Please try again later.", "GITHUB_NETWORK_ERROR"],
      PROFILE_PROVIDER_TIMEOUT: ["GitHub took too long to respond. Please try again.", "GITHUB_TIMEOUT"],
      GITHUB_CALENDAR_HTML_CHANGED: ["GitHub changed its public calendar format. Daily counts could not be verified.", "GITHUB_CALENDAR_FORMAT_CHANGED"],
    };
    const [calendarUnavailable, calendarErrorCode] = messages[error.code] || ["GitHub's public contribution calendar could not be verified.", error.code || "GITHUB_API_ERROR"];
    return { calendar: null, calendarUnavailable, calendarErrorCode };
  }
}

async function fetchGithubStatistics(username) {
  const [snapshot, contribution] = await Promise.all([fetchGithubSnapshot(username), fetchContributionCalendar(username)]);
  const profile = snapshot.raw.profile;
  if (typeof profile.login !== "string" || !Number.isInteger(profile.public_repos) || !Number.isInteger(profile.followers)) throw new ProfileProviderError("GitHub returned an invalid public profile");
  const preview = {
    username: profile.login, profileUrl: `https://github.com/${encodeURIComponent(profile.login)}`,
    avatarUrl: `https://avatars.githubusercontent.com/u/${Number(profile.id)}`,
    publicRepositories: profile.public_repos, followers: profile.followers,
    languages: Object.entries(snapshot.normalized.sampledLanguages).map(([name, repositories]) => ({ name, repositories })).sort((a, b) => b.repositories - a.repositories),
    sampledRepositoryCount: snapshot.normalized.sampledRepositoryCount,
    repositorySampleLimit: snapshot.normalized.repositorySampleLimit,
    ...contribution,
  };
  return { ...snapshot, normalized: { ...snapshot.normalized, githubPreview: preview }, preview };
}
module.exports = { parsePublicCalendarHtml, streaksFor, fetchContributionCalendar, fetchGithubStatistics };
