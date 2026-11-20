const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const { pool } = require('../src/config/db');

test('admin registration, protected first login and password rotation', async t => {
  const client = await pool.connect();
  const schema = `registration_test_${process.pid}_${Date.now()}`;
  const originalQuery = pool.query, originalConnect = pool.connect;
  let server;
  try {
    await client.query(`CREATE SCHEMA ${schema}`);
    await client.query(`SET search_path TO ${schema}`);
    await client.query(fs.readFileSync(path.join(__dirname,'../sql/schema.updated.sql'),'utf8').split('-- Migrate legacy enum-backed skills')[0]);
    const migration = fs.readFileSync(path.join(__dirname,'../sql/migrations/20261120_registration.sql'),'utf8');
    await client.query(migration); await client.query(migration);
    pool.query = (...args) => client.query(...args);
    pool.connect = async () => ({ query: (...args) => client.query(...args), release() {} });
    await client.query(`INSERT INTO users (email,full_name,password_hash,role) VALUES ('admin@test.invalid','Admin',$1,'ADMIN')`, [await bcrypt.hash('ExistingAdmin123!',10)]);
    await client.query(`INSERT INTO academic_batches (name,department,academic_years,sections) VALUES
      ('Batch A','CSE','2024-2028','["A","B"]'),('Batch B','IT','2025-2029','["C"]')`);
    const express = require('express'); const app = express();
    app.use(express.json()); app.use(require('cookie-parser')());
    app.use('/api/v1',require('../src/services/auth/routes/auth.routes'));
    app.use('/api/v1',require('../src/services/admin/routes/admin.routes'));
    app.use('/api/v1',require('../src/services/students/routes/students.routes'));
    app.use('/api/v1',require('../src/services/companies/routes/companies.routes'));
    app.use(require('../src/middleware/error.middleware').errorHandler);
    server=app.listen(0,'127.0.0.1'); await new Promise(resolve=>server.once('listening',resolve));
    const admin=jwt.sign({userId:1},process.env.JWT_SECRET || 'placepro-dev-secret');
    async function req(url, method='GET', body, token=admin, cookie) {
      const response=await fetch(`http://127.0.0.1:${server.address().port}/api/v1${url}`,{method,
        headers:{'Content-Type':'application/json',...(token?{Authorization:`Bearer ${token}`} : {}),...(cookie?{Cookie:cookie}:{})},
        body:body===undefined?undefined:JSON.stringify(body)});
      return {status:response.status,body:response.status===204?null:await response.json(),cookie:response.headers.get('set-cookie')?.split(';')[0]};
    }
    const studentInput={name:'Registered Student',email:'student@test.invalid',rollNumber:'000123',mobileNumber:'+91 98765 43210',academicBatchId:'1',section:'B',cgpa:8.1};
    let student, trainer, studentLogin, trainerLogin;
    await t.test('admin creates student and multi-batch trainer with hashed own-phone passwords',async()=>{
      student=await req('/students','POST',studentInput); assert.equal(student.status,201);
      trainer=await req('/users/trainers','POST',{name:'Trainer',email:'trainer@test.invalid',mobileNumber:'9123456789',assignedBatchIds:['1','2','1']}); assert.equal(trainer.status,201);
      for (const [created,phone,role] of [[student,'9876543210','STUDENT'],[trainer,'9123456789','TRAINER']]) {
        const u=(await client.query(`SELECT * FROM users WHERE user_id=$1`,[created.body.userId])).rows[0];
        assert.equal(u.role,role); assert.equal(u.must_change_password,true); assert.equal(await bcrypt.compare(phone,u.password_hash),true);
        assert.notEqual(u.password_hash,phone); assert(!JSON.stringify(created.body).includes(phone)); assert(!('password_hash' in created.body));
      }
      const s=(await client.query(`SELECT * FROM students WHERE user_id=$1`,[student.body.userId])).rows[0];
      assert.equal(String(s.academic_batch_id),'1'); assert.equal(s.section,'B'); assert.equal(s.readiness_status,'NPR'); assert.equal(Number(s.average_score),0);
      const batches=(await req('/batches')).body; assert(batches.every(b=>b.trainerIds.includes(trainer.body.userId)));
      const users=(await req('/users')).body.items; assert.equal(users.find(u=>u.id===trainer.body.userId).assignedBatches.length,2);
      assert.equal((await req('/students?batchId=1')).body.total,1); assert.equal((await req('/students?batchId=2')).body.total,0);
      assert.equal((await req('/students?q=student@test.invalid')).body.items[0].mobileNumber,'9876543210');
    });
    await t.test('invalid login rejected, first login sessions blocked except password flow',async()=>{
      assert.equal((await req('/auth/login','POST',{email:studentInput.email,password:'incorrect'},null)).status,401);
      assert.equal((await req('/auth/login','POST',{email:'missing@test.invalid',password:'incorrect'},null)).status,401);
      studentLogin=await req('/auth/login','POST',{email:' STUDENT@test.invalid ',password:'9876543210'},null);
      trainerLogin=await req('/auth/login','POST',{email:'trainer@test.invalid',password:'9123456789'},null);
      assert.equal(studentLogin.status,200); assert.equal(trainerLogin.status,200); assert.equal(studentLogin.body.user.mustChangePassword,true);
      const restored=await req('/auth/me','GET',undefined,null,studentLogin.cookie); assert.equal(restored.body.user.mustChangePassword,true);
      for (const url of ['/students','/batches','/companies','/me/student']) assert.equal((await req(url,'GET',undefined,studentLogin.body.token)).status,403);
      assert.equal((await req('/students','POST',studentInput,trainerLogin.body.token)).status,403);
    });
    await t.test('password change validates current password, rotates sessions and permits normal access',async()=>{
      assert.equal((await req('/auth/change-password','POST',{currentPassword:'wrong',newPassword:'ChangedStudent123!'},studentLogin.body.token)).status,401);
      assert.equal((await req('/auth/change-password','POST',{currentPassword:'9876543210',newPassword:'9876543210'},studentLogin.body.token)).status,400);
      const changed=await req('/auth/change-password','POST',{currentPassword:'9876543210',newPassword:'ChangedStudent123!'},studentLogin.body.token);
      assert.equal(changed.status,200); assert.equal(changed.body.user.mustChangePassword,false);
      assert.equal((await req('/auth/me','GET',undefined,studentLogin.body.token)).status,401);
      assert.equal((await req('/auth/login','POST',{email:studentInput.email,password:'9876543210'},null)).status,401);
      assert.equal((await req('/auth/login','POST',{email:studentInput.email,password:'ChangedStudent123!'},null)).status,200);
      assert.equal((await req('/me/student','GET',undefined,changed.body.token)).status,200);
      assert.equal((await req('/students','POST',studentInput,changed.body.token)).status,403);
      const changedTrainer=await req('/auth/change-password','POST',{currentPassword:'9123456789',newPassword:'ChangedTrainer123!'},trainerLogin.body.token);
      assert.equal(changedTrainer.status,200); assert.equal((await req('/batches','GET',undefined,changedTrainer.body.token)).status,200);
      assert.equal((await req('/users/trainers','POST',{},changedTrainer.body.token)).status,403);
      assert.equal((await req('/auth/login','POST',{email:'admin@test.invalid',password:'ExistingAdmin123!'},null)).body.user.mustChangePassword,false);
    });
    await t.test('validation, uniqueness and safe linking preserve historical student evaluations',async()=>{
      assert.equal((await req('/students','POST',studentInput)).status,409);
      assert.equal((await req('/students','POST',{...studentInput,email:'other@test.invalid'})).status,409);
      assert.equal((await req('/students','POST',{...studentInput,mobileNumber:'123'})).status,400);
      assert.equal((await req('/students','POST',{...studentInput,email:'section@test.invalid',rollNumber:'SECTION',section:'Z'})).status,400);
      assert.equal((await req('/users/trainers','POST',{name:'Bad',email:'bad@test.invalid',mobileNumber:'9876543210',assignedBatchIds:['999']})).status,400);
      const historical=(await client.query(`INSERT INTO students (roll_no,full_name,email,academic_batch_id,cgpa,average_score) VALUES ('OLD1','Historical Student','history@test.invalid',1,9,81) RETURNING student_id`)).rows[0];
      const imported=(await client.query(`INSERT INTO import_batches (event_type,event_title,original_filename,import_status) VALUES ('EXAM','Historical assessment','history.csv','CONFIRMED') RETURNING batch_id`)).rows[0];
      await client.query(`INSERT INTO evaluation_records (batch_id,student_id,overall_score_pct) VALUES ($1,$2,81)`,[imported.batch_id,historical.student_id]);
      const payload={...studentInput,name:'Historical Student',email:'history@test.invalid',rollNumber:'OLD1',cgpa:0};
      assert.equal((await req('/students','POST',{...payload,name:'Different name'})).status,409);
      const linked=await req('/students','POST',payload); assert.equal(linked.status,201); assert.equal(linked.body.studentId,String(historical.student_id));
      const preserved=(await client.query(`SELECT * FROM students WHERE student_id=$1`,[historical.student_id])).rows[0];
      assert.equal(Number(preserved.cgpa),9); assert.equal(Number(preserved.average_score),81);
      assert.equal(Number((await client.query(`SELECT overall_score_pct FROM evaluation_records WHERE student_id=$1`,[historical.student_id])).rows[0].overall_score_pct),81);
      assert.equal((await req('/students','POST',payload)).status,409);
    });
    await t.test('audit failure rolls back account and student registration',async()=>{
      await client.query(`CREATE FUNCTION reject_registration_audit() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'Test audit failure'; END $$;
        CREATE TRIGGER reject_registration_audit BEFORE INSERT ON audit_logs FOR EACH ROW EXECUTE FUNCTION reject_registration_audit()`);
      assert.equal((await req('/students','POST',{...studentInput,email:'rollback@test.invalid',rollNumber:'ROLLBACK'})).status,500);
      assert.equal((await client.query(`SELECT * FROM users WHERE email='rollback@test.invalid'`)).rowCount,0);
      assert.equal((await client.query(`SELECT * FROM students WHERE roll_no='ROLLBACK'`)).rowCount,0);
      await client.query(`DROP TRIGGER reject_registration_audit ON audit_logs`);
    });
    await t.test('login attempts are rate limited',async()=>{
      let response;
      for(let i=0;i<16;i++) response=await req('/auth/login','POST',{email:'limited@test.invalid',password:'wrong'},null);
      assert.equal(response.status,429);
    });
    await t.test('concurrent duplicate registration creates exactly one linked account',async()=>{
      const testConnect=pool.connect;
      pool.connect=async()=>{ const connection=await originalConnect.call(pool); await connection.query(`SET search_path TO ${schema}`); return connection; };
      try {
        const payload={...studentInput,email:'concurrent@test.invalid',rollNumber:'CONCURRENT'};
        const results=await Promise.all([req('/students','POST',payload),req('/students','POST',payload)]);
        assert.deepEqual(results.map(r=>r.status).sort(),[201,409]);
        assert.equal((await client.query(`SELECT * FROM users WHERE email='concurrent@test.invalid'`)).rowCount,1);
        assert.equal((await client.query(`SELECT * FROM students WHERE roll_no='CONCURRENT' AND user_id IS NOT NULL`)).rowCount,1);
      } finally { pool.connect=testConnect; }
    });
  } finally {
    t.after(async()=>{
      if(server) await new Promise(resolve=>server.close(resolve));
      pool.query=originalQuery; pool.connect=originalConnect;
      await client.query('ROLLBACK'); await client.query('SET search_path TO public');
      await client.query(`DROP SCHEMA IF EXISTS ${schema} CASCADE`);
      client.release(); await pool.end();
    });
  }
});
