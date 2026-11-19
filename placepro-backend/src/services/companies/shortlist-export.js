const { createHash } = require('node:crypto');
const { companySelect, companyResponse, validateCriteria, matchingStudents } = require('./company-eligibility');
const { evaluateMatches } = require('./company-matching');

function matchVersion(profile, minCgpa, criteria, evaluated) {
  // Aggregate query row order must not make unchanged score maps look stale.
  const canonical = JSON.stringify({ profile, minCgpa, criteria, evaluated }, (_key, value) =>
    value && typeof value === 'object' && !Array.isArray(value)
      ? Object.fromEntries(Object.keys(value).sort().map(key => [key, value[key]])) : value);
  return createHash('sha256').update(canonical).digest('hex');
}

function fail(statusCode, message) {
  const error = new Error(message); error.statusCode = statusCode; throw error;
}

function csvCell(value, preserveDigits = false) {
  let text = value === null || value === undefined ? '' : String(value);
  // CSV has no cell types. A digits-only literal preserves leading zeros and long identifiers in spreadsheet apps.
  // This expression can contain only digits (and an optional phone prefix), never executable user input.
  if (preserveDigits && /^\+?\d+$/.test(text)) text = `="${text}"`;
  else if (typeof value === 'string' && /^[\s]*[=+\-@]|^[\t\r\n]/.test(text)) text = `'${text}`;
  return /[",\r\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

const isProject = c => c.type === 'PROJECT_SCORE' || c.skillId === 'PROJECT_SCORE';

async function exportShortlist(db, companyId, body) {
  const { selectedStudentIds, criteriaOverride, matchingVersion } = body;
  if (!Array.isArray(selectedStudentIds) || !selectedStudentIds.length || selectedStudentIds.some(id =>
    !['string', 'number'].includes(typeof id) || !/^[1-9]\d*$/.test(String(id)) || BigInt(id) > 9223372036854775807n)) {
    fail(400, 'Select at least one student using valid student IDs');
  }
  const selected = new Set(selectedStudentIds.map(String));
  const { rows } = await db.query(`SELECT c.*, batches.eligible_batches ${companySelect} WHERE role_id=$1`, [companyId]);
  if (!rows.length) fail(404, 'Company not found');
  const profile = companyResponse(rows[0]);
  const criteria = criteriaOverride?.criteria ?? profile.criteria;
  const minCgpa = criteriaOverride?.minCgpa ?? profile.minCgpa;
  await validateCriteria(db, minCgpa, criteria);

  const skillRows = await db.query(`SELECT skill_id::text, skill_code, skill_name FROM skill_taxonomy WHERE deleted_at IS NULL AND parameter_type='numeric'`);
  const skillFor = c => skillRows.rows.find(s => s.skill_id === c.skillId || s.skill_code === c.skillId);
  const key = c => isProject(c) ? 'PROJECT_SCORE' : skillFor(c)?.skill_id;
  const configuredKeys = profile.criteria.map(key);
  if (configuredKeys.some(k => !k) || criteria.length !== configuredKeys.length || criteria.some(c => !configuredKeys.includes(key(c)))) {
    fail(409, 'Company requirements changed. Refresh matching before exporting');
  }
  const evaluated = evaluateMatches(await matchingStudents(db, profile.eligibleBatchIds), minCgpa, criteria);
  const eligible = evaluated.filter(r => r.eligible);
  const chosen = eligible.map((r, index) => ({ ...r, rank: index + 1 })).filter(r => selected.has(r.student.id));
  if (chosen.length !== selected.size) fail(422, 'One or more selected students are unavailable, outside the allowed batches, or no longer eligible. Refresh matching');
  if (typeof matchingVersion !== 'string' || matchingVersion !== matchVersion(profile, minCgpa, criteria, evaluated)) {
    fail(409, 'Matching results changed. Refresh matching and select students again before exporting');
  }
  // Saved company order determines headers; applied cutoffs/weights determine the shared matching result.
  const columns = profile.criteria;
  const headers = ['Rank', 'Roll Number', 'Name', 'Mobile Number', 'Email', 'Section', 'Batch', 'CGPA',
    ...columns.flatMap(c => isProject(c) ? ['Verified project score', 'Project GitHub Links'] : [skillFor(c).skill_name]), 'Compatibility %'];
  const dataRows = chosen.map(({ student: s, rank, compatibility }) => [rank, s.rollNumber, s.name,
    s.mobileNumber, s.email, s.section, s.batch, s.cgpa,
    ...columns.flatMap(c => isProject(c) ? [s.projectScore, s.projectGithubLinks.join('\n')] : [s.scores[c.skillId]]), compatibility]);
  const csv = '\uFEFF' + [headers.map(value => csvCell(value)).join(','),
    ...dataRows.map(row => row.map((value, index) => csvCell(value, index === 1 || index === 3)).join(','))].join('\r\n') + '\r\n';
  const safeName = value => String(value).normalize('NFKC').replace(/[^\p{L}\p{N}]+/gu, '_').replace(/^_|_$/g, '').slice(0, 80) || 'Company';
  const date = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Kolkata', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date());
  return { csv, fileName: `${safeName(profile.name)}_${safeName(profile.role)}_Shortlist_${date}.csv`, rowCount: chosen.length };
}

module.exports = { matchVersion, exportShortlist, csvCell };
