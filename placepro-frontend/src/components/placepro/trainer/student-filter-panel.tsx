"use client";
import { useState } from "react";
import { Filter, X } from "lucide-react";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { FilterSelect, type FilterOption } from "@/components/placepro/shared/controls";
import { useAppStore } from "@/lib/placepro/store";
import { emptyStudentFilters, studentFilterKeys, type StudentFilters, type StudentFilterKey } from "@/lib/placepro/student-filters";
import type { useSubjectColumns } from "./use-subject-columns";

const statusOptions = [{ label: "Placement ready (PR)", value: "PR" }, { label: "Not ready (NPR)", value: "NPR" }];
const projectOptions = [
  { label: "Has approved projects", value: "has-project" }, { label: "No approved projects", value: "no-project" },
  { label: "Project score below 60%", value: "score-below-60" }, { label: "Project score 60% or higher", value: "score-at-least-60" },
];
export default function StudentFilterPanel({ filters, apply, batches, sections, columns }: {
  filters: StudentFilters; apply: (filters: StudentFilters) => void; batches: FilterOption[]; sections: FilterOption[];
  columns: ReturnType<typeof useSubjectColumns>;
}) {
  const domains = useAppStore((s) => s.domains);
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState(filters);
  const [subjectSearch, setSubjectSearch] = useState("");
  const activeCount = studentFilterKeys.filter(key => filters[key] !== "all").length;
  const definitions: { key: StudentFilterKey; label: string; allLabel: string; options: FilterOption[] }[] = [
    { key: "batch", label: "Batch", allLabel: "All batches", options: batches },
    { key: "section", label: "Section", allLabel: "All sections", options: sections },
    { key: "pr", label: "Student status", allLabel: "All statuses", options: statusOptions },
    { key: "domain", label: "Weak domain (below 60%)", allLabel: "All domains", options: domains.map(domain => ({ label: domain.name, value: domain.id })) },
    { key: "project", label: "Project", allLabel: "All projects", options: projectOptions },
  ];
  return <Popover open={open} onOpenChange={value => { if (value) setDraft(filters); setOpen(value); }}>
    <PopoverTrigger asChild>
      <Button variant={activeCount ? "secondary" : "outline"} className="h-9 shrink-0 gap-2" aria-label={`Advanced filters${activeCount ? `, ${activeCount} applied` : ""}`}>
        <Filter className="size-4" /> Filters {activeCount > 0 && <span className="rounded-full bg-primary px-1.5 text-xs text-primary-foreground">{activeCount}</span>}
        {columns.error && <span aria-label="Subject preferences need attention" className="text-danger">!</span>}
      </Button>
    </PopoverTrigger>
    <PopoverContent align="end" sideOffset={8} collisionPadding={12} className="flex max-h-[min(85dvh,var(--radix-popover-content-available-height))] w-[min(420px,calc(100vw-24px))] flex-col overflow-hidden rounded-xl p-0 shadow-lg" aria-label="Advanced student filters">
      <div className="border-b px-4 py-3"><h2 className="font-semibold">Filter students</h2><p className="text-xs text-muted-foreground">Students must match all selected criteria.</p></div>
      <div className="space-y-5 overflow-y-auto p-4">
        <div className="grid gap-3 sm:grid-cols-2">
          {definitions.map(({ key, label, options, allLabel }) => <div key={key} className={key === "project" ? "sm:col-span-2" : ""}>
            <div className="mb-1 flex items-center justify-between"><span className="text-xs font-medium">{label}</span>{draft[key] !== "all" && <button aria-label={`Clear ${label}`} onClick={() => setDraft(d => ({ ...d, [key]: "all" }))} className="rounded p-1 hover:bg-muted"><X className="size-3" /></button>}</div>
            <FilterSelect value={draft[key]} onChange={value => setDraft(d => ({ ...d, [key]: value }))} options={options} allLabel={allLabel} ariaLabel={label} />
          </div>)}
        </div>
        <section className="space-y-3 border-t pt-4" aria-label="Subject column visibility">
          <div><h3 className="text-sm font-semibold">Subject columns <span className="font-normal text-muted-foreground">({columns.visible.length}/{columns.subjects.length})</span></h3>
          <p className="text-xs text-muted-foreground">Display preference, saved immediately. Student results and averages stay the same.</p></div>
          {columns.error && <p role="alert" className="text-xs text-danger">{columns.error} <button className="underline" onClick={columns.retry}>Retry</button></p>}
          {columns.loading && <p role="status" className="text-xs text-muted-foreground">Loading subjects...</p>}
          <Input value={subjectSearch} onChange={e => setSubjectSearch(e.target.value)} placeholder="Find a subject" aria-label="Find a subject" className="h-8" />
          <div className="flex gap-3 text-xs">
            <button className="text-primary disabled:opacity-50" disabled={!columns.ready || columns.loading || columns.saving} onClick={() => void columns.save(Object.fromEntries(columns.subjects.map(s => [s.id, true])))}>Select All</button>
            <button className="text-primary disabled:opacity-50" disabled={!columns.ready || columns.loading || columns.saving} onClick={() => void columns.save(null)}>Reset to Defaults</button>
            {columns.saving && <span role="status">Saving...</span>}
          </div>
          <div className="grid max-h-44 gap-2 overflow-y-auto sm:grid-cols-2">
            {columns.subjects.filter(s => s.name.toLowerCase().includes(subjectSearch.toLowerCase())).map(subject => <label key={subject.id} className="flex cursor-pointer items-center gap-2 rounded p-1 text-sm hover:bg-muted">
              <Checkbox checked={columns.selected(subject)} disabled={!columns.ready || columns.loading || columns.saving} onCheckedChange={value => void columns.save({ [subject.id]: value === true })} />{subject.name}
            </label>)}
            {!columns.loading && !columns.error && !columns.subjects.length && <p className="text-xs text-muted-foreground">No active subjects available.</p>}
          </div>
        </section>
      </div>
      <div className="flex shrink-0 justify-between border-t bg-card p-3">
        <Button variant="ghost" size="sm" onClick={() => { setDraft(emptyStudentFilters); apply(emptyStudentFilters); }}>Reset Filters</Button>
        <Button size="sm" onClick={() => { apply(draft); setOpen(false); }}>Apply Filters</Button>
      </div>
    </PopoverContent>
  </Popover>;
}
