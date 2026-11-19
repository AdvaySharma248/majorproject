const test = require('node:test');
const assert = require('node:assert/strict');
const { csvCell, matchVersion } = require('../src/services/companies/shortlist-export');

test('CSV escaping handles Unicode, quotes, commas, CR/LF and optional values', () => {
  assert.equal(csvCell('A,"B"\r\nC'), '"A,""B""\r\nC"');
  assert.equal(csvCell('José'), 'José');
  assert.equal(csvCell(null), ''); assert.equal(csvCell(undefined), '');
  assert.equal(csvCell(0), '0'); assert.equal(csvCell(92.5), '92.5');
});

test('identifier literals preserve leading zeros without allowing formula injection', () => {
  assert.equal(csvCell('00123', true), '"=""00123"""');
  assert.equal(csvCell('+919876543210', true), '"=""+919876543210"""');
  assert.equal(csvCell('=1+1', true), "'=1+1");
  assert.equal(csvCell(' @SUM(A1)', false), "' @SUM(A1)");
  assert.equal(csvCell('1+1', true), '1+1');
});

test('matching versions ignore object key order but detect changed values', () => {
  const first = matchVersion({}, 7, [], [{ student: { scores: { dsa: 80, comm: 90 } } }]);
  assert.equal(first, matchVersion({}, 7, [], [{ student: { scores: { comm: 90, dsa: 80 } } }]));
  assert.notEqual(first, matchVersion({}, 7, [], [{ student: { scores: { comm: 90, dsa: 81 } } }]));
});
