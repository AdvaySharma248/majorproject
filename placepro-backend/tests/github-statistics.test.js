const test = require('node:test');
const assert = require('node:assert/strict');
const { parsePublicCalendarHtml, streaksFor } = require('../src/services/students/providers/github-statistics');
const { isLegacyTokenCalendar } = require('../src/services/students/controllers/github-preview.controller');

test('streaks are calculated from consecutive actual daily counts', () => {
  const days = [{ count: 0 }, { count: 2 }, { count: 0 }, { count: 1 }, { count: 3 }, { count: 0 }];
  assert.deepEqual(streaksFor(days), { currentStreak: 2, currentStreakAtLeast: false, longestStreak: 2 });
});

test('old token-required snapshots are identified for immediate refresh', () => {
  assert.equal(isLegacyTokenCalendar({ calendarErrorCode: 'GITHUB_TOKEN_MISSING' }), true);
  assert.equal(isLegacyTokenCalendar({ calendarUnavailable: 'Contribution calendar is not configured. Public repository statistics are still available.' }), true);
  assert.equal(isLegacyTokenCalendar({ calendar: { totalContributions: 330 } }), false);
});

test('public contribution HTML is parsed and its displayed total must match daily counts', () => {
  const start = Date.parse('2025-01-01T00:00:00Z');
  const cells = [];
  for (let i = 0; i < 365; i++) {
    const date = new Date(start + i * 86400000).toISOString().slice(0, 10);
    const id = `day-${i}`;
    const count = i === 10 ? 2 : 0;
    const tooltip = count ? `${count} contributions on January 11th.` : 'No contributions on January 1st.';
    cells.push(`<td id="${id}" data-date="${date}" data-level="${count ? 1 : 0}"></td><tool-tip for="${id}">${tooltip}</tool-tip>`);
  }
  const html = `<div class="js-yearly-contributions"><h2>2\n contributions in the last year</h2>${cells.join('')}`;
  const parsed = parsePublicCalendarHtml(html);
  assert.equal(parsed.totalContributions, 2);
  assert.equal(parsed.days.length, 365);
  assert.equal(parsed.days[10].count, 2);
  assert.equal(parsed.days[10].level, 1);
  assert.throws(() => parsePublicCalendarHtml(html.replace('2\n contributions', '3\n contributions')), /incomplete/);
});

