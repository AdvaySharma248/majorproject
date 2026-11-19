const { Router } = require("express");
const { pool, withTransaction, writeAuditLog } = require("../../../config/db");
const { matchingStudents, validateCriteria, validateBatchIds, companySelect, companyResponse } = require("../company-eligibility");
const { requireAuth, requireRole } = require("../../../middleware/auth.middleware");

const router = Router();

router.get("/companies", requireAuth, requireRole(["admin", "trainer"]), async (req, res, next) => {
  try {
    const { q = "", page = "1", pageSize = "10" } = req.query;
    const p = Math.max(1, parseInt(page, 10));
    const ps = Math.max(1, parseInt(pageSize, 10));
    const { rows } = await pool.query(
      `SELECT c.*, batches.eligible_batches,
       COUNT(*) OVER() AS total_count
       ${companySelect}
       WHERE company_name ILIKE $1 
       OR role_title ILIKE $1
       ORDER BY created_at DESC
       LIMIT $2 OFFSET $3`,
      [`%${q}%`, ps, (p - 1) * ps]
    );

    res.json({
      items: rows.map(companyResponse),
      page: p,
      pageSize: ps,
      total: rows.length ? Number(rows[0].total_count) : 0,
    });
  } catch (err) {
    next(err);
  }
});

router.post("/companies", requireAuth, requireRole(["admin"]), async (req, res, next) => {
  try { res.status(201).json(await saveCompany(req)); }
  catch (err) { next(err); }
});

router.get("/companies/:companyId", requireAuth, requireRole(["admin", "trainer"]), async (req, res, next) => {
  try {
    const { rows } = await pool.query(`SELECT c.*, batches.eligible_batches ${companySelect} WHERE role_id = $1`, [req.params.companyId]);
    if (!rows.length) {
      return res.status(404).json({ error: { code: "NOT_FOUND", message: "Company not found" } });
    }
    res.json(companyResponse(rows[0]));
  } catch (err) {
    next(err);
  }
});

router.patch("/companies/:companyId", requireAuth, requireRole(["admin"]), async (req, res, next) => {
  try { res.json(await saveCompany(req, req.params.companyId)); }
  catch (err) { next(err); }
});

async function saveCompany(req, id) {
  return withTransaction(async (client) => {
    let existing;
    if (id) {
      const locked = await client.query(`SELECT * FROM company_roles WHERE role_id = $1 FOR UPDATE`, [id]);
      if (!locked.rows.length) { const error = new Error("Company not found"); error.statusCode = 404; throw error; }
      const read = await client.query(`SELECT c.*, batches.eligible_batches ${companySelect} WHERE role_id = $1`, [id]);
      existing = companyResponse(read.rows[0]);
    }
    const data = { industry: "IT Services", minCgpa: 6, criteria: [], ...existing, ...req.body };
    const fail = message => { const error = new Error(message); error.statusCode = 400; throw error; };
    if (typeof data.name !== "string" || !data.name.trim() || data.name.trim().length > 100) fail("Company name must contain 1 to 100 characters");
    if (typeof data.role !== "string" || !data.role.trim() || data.role.trim().length > 100) fail("Role must contain 1 to 100 characters");
    if (typeof data.industry !== "string" || data.industry.length > 100) fail("Industry must be at most 100 characters");
    await validateCriteria(client, data.minCgpa, data.criteria);
    const batchIds = await validateBatchIds(client, data.eligibleBatchIds);
    const values = [data.name.trim(), data.role.trim(), data.industry.trim(), data.minCgpa, JSON.stringify(data.criteria)];
    const saved = id
      ? await client.query(`UPDATE company_roles SET company_name=$1, role_title=$2, industry=$3, min_cgpa=$4, criteria_json=$5 WHERE role_id=$6 RETURNING role_id`, [...values, id])
      : await client.query(`INSERT INTO company_roles (company_name,role_title,industry,min_cgpa,criteria_json) VALUES ($1,$2,$3,$4,$5) RETURNING role_id`, values);
    const companyId = saved.rows[0].role_id;
    await client.query(`DELETE FROM company_eligible_batches WHERE company_id=$1`, [companyId]);
    await client.query(`INSERT INTO company_eligible_batches (company_id,batch_id) SELECT $1, unnest($2::bigint[])`, [companyId, batchIds]);
    await client.query(`INSERT INTO audit_logs (actor_id,actor_name,module,action,status) VALUES ($1,$2,'Companies',$3,'success')`,
      [req.user.id, req.user.name, `${id ? "Updated" : "Created"} company ${data.name} (${data.role})`]);
    const result = await client.query(`SELECT c.*, batches.eligible_batches ${companySelect} WHERE role_id=$1`, [companyId]);
    return companyResponse(result.rows[0]);
  });
}

router.delete("/companies/:companyId", requireAuth, requireRole(["admin"]), async (req, res, next) => {
  try {
    await pool.query(`DELETE FROM company_roles WHERE role_id = $1`, [req.params.companyId]);
    await writeAuditLog(req.user.id, req.user.name, "Companies", `Deleted company ${req.params.companyId}`);
    res.status(204).send();
  } catch (err) {
    next(err);
  }
});

router.post("/companies/:companyId/matches", requireAuth, requireRole(["admin", "trainer"]), async (req, res, next) => {
  try {
    const { criteriaOverride, filters = {}, page = 1, pageSize = 10 } = req.body;
    const compRes = await pool.query(`SELECT c.*, batches.eligible_batches ${companySelect} WHERE role_id = $1`, [
      req.params.companyId,
    ]);
    if (!compRes.rows.length) {
      return res.status(404).json({ error: { code: "NOT_FOUND", message: "Company not found" } });
    }
    const comp = compRes.rows[0];
    const minCgpa = criteriaOverride?.minCgpa ?? Number(comp.min_cgpa);
    const criteria = criteriaOverride?.criteria ?? comp.criteria_json ?? [];
    await validateCriteria(pool, minCgpa, criteria);
    if (!Number.isInteger(page) || page < 1 || !Number.isInteger(pageSize) || pageSize < 1 || pageSize > 1000) {
      return res.status(400).json({ error: { code: "VALIDATION_ERROR", message: "Invalid matching pagination" } });
    }
    const profile = companyResponse(comp);
    const allStudents = await matchingStudents(pool, profile.eligibleBatchIds);

    const totalWeight = criteria.reduce(
      (acc, c) => acc + Number(c.weightage || 0), 
      0
    ) || 1;

    let evaluated = allStudents.map((stu) => {
      const failedRequirements = [];
      if (stu.cgpa < minCgpa) {
        failedRequirements.push(`CGPA ${stu.cgpa} is below minimum ${minCgpa}`);
      }
      let weightedSum = 0;
      for (const c of criteria) {
        const isProjectScore = c.type === "PROJECT_SCORE" || c.skillId === "PROJECT_SCORE";
        const score = isProjectScore ? (stu.projectScore ?? 0) : (stu.scores[c.skillId] ?? 0);
        weightedSum += score * Number(c.weightage);
        if (c.mandatory && score < c.minCutoff) {
          if (isProjectScore && stu.projectScore === null) {
            failedRequirements.push(`PROJECT SCORE is not available (required ${c.minCutoff}%)`);
          } else {
            const label = isProjectScore ? "PROJECT SCORE" : c.skillId.toUpperCase();
            failedRequirements.push(`${label} score ${score}% < ${c.minCutoff}%`);
          }
        }
      }
      return {
        student: stu,
        eligible: failedRequirements.length === 0,
        compatibility: Number((weightedSum / totalWeight).toFixed(1)),
        failedRequirements,
      };
    });

    if (filters.prStatus) {
      evaluated = evaluated.filter((e) => e.student.prStatus === filters.prStatus);
    }
    if (filters.eligibility === "eligible") {
      evaluated = evaluated.filter((e) => e.eligible);
    } else if (filters.eligibility === "ineligible") {
      evaluated = evaluated.filter((e) => !e.eligible);
    }
    if (filters.q) {
      const qLower = String(filters.q).toLowerCase();
      evaluated = evaluated.filter(
        (e) =>
          e.student.name.toLowerCase().includes(qLower) ||
          e.student.rollNumber.toLowerCase().includes(qLower)
      );
    }

    evaluated.sort((a, b) => b.compatibility - a.compatibility || a.student.name.localeCompare(b.student.name) || a.student.id.localeCompare(b.student.id, undefined, { numeric: true }));
    const start = (page - 1) * pageSize;
    res.json({
      items: evaluated.slice(start, start + pageSize),
      page,
      pageSize,
      total: evaluated.length,
      company: profile,
      requiresBatchConfiguration: profile.eligibleBatchIds.length === 0,
    });
  } catch (err) {
    next(err);
  }
});

module.exports = router;
