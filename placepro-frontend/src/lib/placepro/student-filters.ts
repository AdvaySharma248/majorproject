export const studentFilterKeys = ["batch", "section", "pr", "domain", "project"] as const;
export type StudentFilterKey = typeof studentFilterKeys[number];
export type StudentFilters = Record<StudentFilterKey, string>;
export const emptyStudentFilters: StudentFilters = { batch: "all", section: "all", pr: "all", domain: "all", project: "all" };
export function readStudentFilters(search: URLSearchParams): StudentFilters {
  return Object.fromEntries(studentFilterKeys.map(key => [key, search.get(key) || "all"])) as StudentFilters;
}
export function applyStudentFilters(search: URLSearchParams, filters: StudentFilters) {
  const next = new URLSearchParams(search);
  for (const key of studentFilterKeys) {
    if (filters[key] === "all") next.delete(key); else next.set(key, filters[key]);
  }
  next.delete("page");
  return next;
}
