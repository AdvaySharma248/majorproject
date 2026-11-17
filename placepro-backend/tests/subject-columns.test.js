const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const jwt = require('jsonwebtoken');
const { pool } = require('../src/config/db');

test('subjects, authenticated preferences and paginated student API', async t => {
  const client = await pool.connect();
  const schema = `placepro_test_${process.pid}_${Date.now()}`;
  const originalQuery = pool.query.bind(pool);
  let server;
  try {
    await client.query(`CREATE SCHEMA ${schema}`);
    await client.query(`SET search_path TO ${schema}`);
    await client.query(fs.readFileSync(path.join(__dirname, '../sql/schema.updated.sql'), 'utf8'));
    // Reapplying the additive migration must be harmless.
    await client.query(fs.readFileSync(path.join(__dirname, '../sql/migrations/20261117_subject_columns.sql'), 'utf8'));
    pool.query = (...args) => client.query(...args);
    await client.query(`INSERT INTO users (user_id,email,password_hash,full_name,role) VALUES
      (1,'admin@test.invalid','test','Admin','ADMIN'),(2,'trainer@test.invalid','test','Trainer','TRAINER'),(3,'student@test.invalid','test','Student','STUDENT'),(4,'other@test.invalid','test','Other','TRAINER')`);
    await client.query(`INSERT INTO students (roll_no,full_name,email,batch,section,cgpa,average_score)
      SELECT 'R' || n, 'Student ' || lpad(n::text,2,'0'), 's' || n || '@test.invalid', 'Batch', CASE WHEN n % 2 = 0 THEN 'A' ELSE 'B' END, 8, 75 FROM generate_series(1,23) n`);
    const express = require('express');
    const app = express(); app.use(express.json());
    app.use('/api/v1', require('../src/services/admin/routes/admin.routes'));
    app.use('/api/v1', require('../src/services/students/routes/students.routes'));
    app.use(require('../src/middleware/error.middleware').errorHandler);
    server = app.listen(0, '127.0.0.1');
    await new Promise(resolve => server.once('listening', resolve));
    const base = `http://127.0.0.1:${server.address().port}/api/v1`;
    async function request(url, user = 1, method = 'GET', body) {
      const token = jwt.sign({ userId: user }, process.env.JWT_SECRET || 'placepro-dev-secret');
      const response = await fetch(base + url, { method, headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' }, body: body === undefined ? undefined : JSON.stringify(body) });
      return { status: response.status, body: response.status === 204 ? null : await response.json() };
    }
    let subject;
    await t.test('admin creates, validates and rejects duplicate subjects', async () => {
      const created = await request('/skills', 1, 'POST', { name: 'Operating Systems', domain: 'Core Computer Science', defaultVisible: true });
      assert.equal(created.status, 201); subject = created.body;
      assert.equal(subject.defaultVisible, true);
      assert.equal((await request('/skills', 1, 'POST', { name: ' operating systems ' })).status, 409);
      assert.equal((await request('/skills', 1, 'POST', { name: '  ' })).status, 400);
      assert.equal((await request('/skills', 1, 'POST', { name: 'Custom', code: 'custom_code', defaultVisible: false })).status, 201);
      assert.equal((await request('/skills', 1, 'POST', { name: 'Different', code: 'custom_code' })).status, 409);
      assert.equal((await request('/skills', 1, 'POST', { name: 'Invalid', code: 'bad code' })).status, 400);
      assert.equal((await request(`/skills/${subject.id}`, 1, 'PATCH', { defaultVisible: 'false' })).status, 400);
      assert.equal((await request('/skills', 2, 'POST', { name: 'Forbidden' })).status, 403);
      assert.equal((await request(`/skills/${subject.id}`, 3, 'PATCH', { active: false })).status, 403);
    });
    await t.test('preferences preserve custom choices and inherit new subjects only', async () => {
      assert.equal((await request('/me/subject-columns', 2)).body.columns, null);
      let saved = await request('/me/subject-columns', 2, 'PATCH', { columns: { [subject.id]: false } });
      assert.equal(saved.body.columns[subject.id], false);
      assert.equal((await request('/me/subject-columns', 4)).body.columns, null);
      await request(`/skills/${subject.id}`, 1, 'PATCH', { defaultVisible: false });
      await request(`/skills/${subject.id}`, 1, 'PATCH', { defaultVisible: true });
      const added = await request('/skills', 1, 'POST', { name: 'New Subject', defaultVisible: true });
      let read = (await request('/me/subject-columns', 2)).body.columns;
      assert.equal(read[subject.id], false); assert.equal(read[added.body.id], true);
      await request(`/skills/${added.body.id}`, 1, 'PATCH', { defaultVisible: false });
      read = (await request('/me/subject-columns', 2)).body.columns;
      assert.equal(read[added.body.id], true);
      assert.equal((await request('/me/subject-columns', 2, 'PATCH', { columns: { unknown: true } })).status, 400);
      assert.equal((await request('/me/subject-columns', 3)).status, 403);
      assert.equal((await request('/me/subject-columns', 2, 'PATCH', { reset: true })).body.columns, null);
    });
    await t.test('editing/deactivation preserve score relationships and average', async () => {
      await client.query(`INSERT INTO import_batches (batch_id,event_type,event_title,original_filename,import_status) VALUES (1,'EXAM','Test','test.csv','CONFIRMED')`);
      await client.query(`INSERT INTO evaluation_records (record_id,batch_id,student_id) VALUES (1,1,1)`);
      await client.query(`INSERT INTO skill_ratings (student_id,skill_id,score_percentage,source_type,source_id) VALUES (1,$1,85,'EXAM',1)`, [subject.numericId]);
      const before = (await request('/students/1', 2)).body;
      const changed = await request(`/skills/${subject.id}`, 1, 'PATCH', { name: 'OS renamed', active: false, description: 'Changed', defaultVisible: false });
      assert.equal(changed.status, 200); assert.equal(changed.body.id, subject.id); assert.equal(changed.body.active, false);
      const after = (await request('/students/1', 2)).body;
      assert.deepEqual(after.scores, before.scores); assert.equal(after.average, before.average);
      assert.equal((await request('/skills', 2)).body.find(s => s.id === subject.id).active, false);
    });
    await t.test('stable pages, filtering, totals and invalid/out-of-range parameters', async () => {
      const first = (await request('/students?page=1&pageSize=10', 2)).body;
      const second = (await request('/students?page=2&pageSize=10', 2)).body;
      const last = (await request('/students?page=3&pageSize=10', 2)).body;
      assert.equal(first.total, 23); assert.equal(last.items.length, 3);
      assert.equal(new Set([...first.items, ...second.items, ...last.items].map(s => s.id)).size, 23);
      assert.deepEqual((await request('/students?page=2&pageSize=10', 2)).body.items.map(s => s.id), second.items.map(s => s.id));
      assert.equal((await request('/students?section=A&page=9', 2)).body.page, 2);
      assert.equal((await request('/students?section=A', 2)).body.total, 11);
      assert.equal((await request('/students?q=R23', 2)).body.total, 1);
      assert.equal((await request('/students?page=garbage&pageSize=NaN', 2)).body.page, 1);
      assert.equal((await request('/students?projectFilter=no-project', 2)).body.total, 23);
      assert.equal((await request('/students?projectFilter=has-project', 2)).body.total, 0);
      assert.equal((await request('/students?projectFilter=score-below-60', 2)).body.total, 0);
      assert.equal((await request('/students?sort=name_asc', 2)).body.items[0].name, 'Student 01');
      assert.equal((await request('/students', 3)).status, 403);
    });
  } finally {
    t.after(async () => {
    if (server) await new Promise(resolve => server.close(resolve));
    pool.query = originalQuery;
    await client.query('ROLLBACK');
    await client.query('SET search_path TO public');
    await client.query(`DROP SCHEMA IF EXISTS ${schema} CASCADE`);
    client.release(); await pool.end();
    });
  }
});
