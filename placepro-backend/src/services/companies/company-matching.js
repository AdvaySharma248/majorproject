// Shared unchanged scoring and ranking for the matching UI and shortlist export.
function evaluateMatches(allStudents, minCgpa, criteria) {
    const totalWeight = criteria.reduce(
      (acc, c) => acc + Number(c.weightage || 0), 
      0
    ) || 1;

    const evaluated = allStudents.map((stu) => {
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

    evaluated.sort((a, b) => b.compatibility - a.compatibility || a.student.name.localeCompare(b.student.name) || a.student.id.localeCompare(b.student.id, undefined, { numeric: true }));
    return evaluated;
}

module.exports = { evaluateMatches };
