import type { Student } from "@/types";

export function domainScore(student: Student, domain: string): number | undefined {
  const values = student.domainAverages ?? {};
  const direct = values[domain];
  return typeof direct === "number" ? direct : undefined;
}

export function weakestDomain(student: Student): { domain: string; score?: number } {
  const scored = Object.entries(student.domainAverages ?? {})
    .filter((entry): entry is [string, number] => typeof entry[1] === "number")
    .map(([domain, score]) => ({ domain, score }));
  if (scored.length === 0) return { domain: "Unavailable" };
  scored.sort((a, b) => a.score - b.score);
  return scored[0];
}
