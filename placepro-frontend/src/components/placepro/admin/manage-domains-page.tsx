"use client";

import { useEffect, useMemo, useState } from "react";
import { Pencil, Plus, Tags, Trash2 } from "lucide-react";
import { api } from "@/lib/placepro/api";
import { useAppStore } from "@/lib/placepro/store";
import type { EvaluationDomain } from "@/types";
import { PageHeader } from "@/components/placepro/shared/page-header";
import { SearchInput } from "@/components/placepro/shared/controls";
import { StatusBadge } from "@/components/placepro/shared/badges";
import { EmptyState, TableSkeleton } from "@/components/placepro/shared/states";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { useToast } from "@/hooks/use-toast";

type DomainForm = { name: string; code: string; description: string; active: boolean };
const EMPTY_FORM: DomainForm = { name: "", code: "", description: "", active: true };

export default function ManageDomainsPage() {
  const domains = useAppStore((s) => s.domains);
  const setDomains = useAppStore((s) => s.setDomains);
  const refreshData = useAppStore((s) => s.refreshData);
  const navigate = useAppStore((s) => s.navigate);
  const { toast } = useToast();
  const [search, setSearch] = useState("");
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState<EvaluationDomain | null>(null);
  const [form, setForm] = useState<DomainForm>(EMPTY_FORM);
  const [formError, setFormError] = useState<string | null>(null);
  const [deleting, setDeleting] = useState<EvaluationDomain | null>(null);

  useEffect(() => {
    let current = true;
    void api.domains().then((items) => {
      if (current) { setDomains(items); setLoadError(null); }
    }).catch((error) => {
      if (current) setLoadError(error instanceof Error ? error.message : "Unable to load domains.");
    }).finally(() => { if (current) setLoading(false); });
    return () => { current = false; };
  }, [setDomains]);

  const filtered = useMemo(() => {
    const query = search.trim().toLowerCase();
    if (!query) return domains;
    return domains.filter((domain) => [domain.name, domain.code ?? "", domain.description]
      .some((value) => value.toLowerCase().includes(query)));
  }, [domains, search]);

  function openAdd() {
    setEditing(null); setForm(EMPTY_FORM); setFormError(null); setDialogOpen(true);
  }

  function openEdit(domain: EvaluationDomain) {
    setEditing(domain);
    setForm({ name: domain.name, code: domain.code ?? "", description: domain.description, active: domain.active });
    setFormError(null); setDialogOpen(true);
  }

  async function reloadDomains() {
    const items = await api.domains();
    setDomains(items);
    await refreshData();
  }

  async function saveDomain() {
    if (!form.name.trim()) { setFormError("Domain name is required."); return; }
    if (form.code.trim() && !/^[a-z][a-z0-9_]{0,39}$/.test(form.code.trim())) {
      setFormError("Use a lowercase code beginning with a letter; letters, numbers and underscores are allowed."); return;
    }
    setSaving(true); setFormError(null);
    try {
      const payload = { name: form.name.trim(), code: form.code.trim() || null, description: form.description.trim(), active: form.active };
      if (editing) await api.updateDomain(editing.id, payload);
      else await api.createDomain(payload);
      await reloadDomains();
      toast({ title: editing ? "Domain updated" : "Domain created" });
      setDialogOpen(false);
    } catch (error) {
      setFormError(error instanceof Error ? error.message : "Unable to save this domain.");
    } finally { setSaving(false); }
  }

  async function toggleDomain(domain: EvaluationDomain) {
    try {
      await api.updateDomain(domain.id, { active: !domain.active });
      await reloadDomains();
      toast({ title: domain.active ? "Domain deactivated" : "Domain activated", description: domain.name });
    } catch (error) {
      toast({ title: "Domain update failed", description: error instanceof Error ? error.message : "Please try again.", variant: "destructive" });
    }
  }

  async function deleteDomain() {
    if (!deleting) return;
    try {
      await api.deleteDomain(deleting.id);
      await reloadDomains();
      toast({ title: "Domain deleted", description: deleting.name });
      setDeleting(null);
    } catch (error) {
      toast({ title: "Domain could not be deleted", description: error instanceof Error ? error.message : "Deactivate it if it is in use.", variant: "destructive" });
    }
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title="Manage Domains"
        subtitle="Organize evaluation parameters into domains."
        actions={<Button size="sm" className="h-9 bg-primary hover:bg-primary-hover" onClick={openAdd}><Plus className="size-4" /> Add domain</Button>}
      />

      <Card className="gap-0 border-border bg-card p-0 shadow-none">
        <div className="flex flex-col gap-3 border-b border-border/70 p-4 sm:flex-row sm:items-center sm:justify-between sm:p-5">
          <SearchInput value={search} onChange={setSearch} placeholder="Search domains…" className="w-full sm:max-w-sm" />
          <p className="text-xs text-muted-foreground">{domains.length} {domains.length === 1 ? "domain" : "domains"}</p>
        </div>
        {loading ? <TableSkeleton rows={5} /> : loadError ? (
          <div role="alert" className="p-6 text-sm text-danger">{loadError}</div>
        ) : filtered.length === 0 ? (
          <EmptyState icon={Tags} title={search ? "No matching domains" : "No domains yet"}
            description={search ? "Try a different search." : "Add a domain to make it available for evaluation parameters."} />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead><tr className="border-b border-border/70 text-left text-xs text-muted-foreground">
                <th className="py-3 pl-5 pr-2 font-medium">Domain</th>
                <th className="px-2 py-3 font-medium">Description</th>
                <th className="px-2 py-3 font-medium">Parameters</th>
                <th className="px-2 py-3 font-medium">Status</th>
                <th className="py-3 pl-2 pr-5 text-right font-medium">Actions</th>
              </tr></thead>
              <tbody>{filtered.map((domain) => (
                <tr key={domain.id} className="border-b border-border/50 last:border-0 hover:bg-muted/40">
                  <td className="py-3 pl-5 pr-2">
                    <p className="font-medium text-foreground">{domain.name}</p>
                    {domain.code && <p className="mt-0.5 font-mono text-[11px] text-muted-foreground">{domain.code}</p>}
                  </td>
                  <td className="max-w-[360px] px-2 py-3 text-[13px] text-muted-foreground"><p className="line-clamp-2">{domain.description || "—"}</p></td>
                  <td className="px-2 py-3 tabular-nums">{domain.parameterCount}</td>
                  <td className="px-2 py-3"><StatusBadge tone={domain.active ? "success" : "neutral"}>{domain.active ? "Active" : "Inactive"}</StatusBadge></td>
                  <td className="py-3 pl-2 pr-5">
                    <div className="flex flex-wrap items-center justify-end gap-1">
                      <Button variant="ghost" size="sm" className="h-7 px-2 text-[12px] text-primary" onClick={() => navigate("skills", { domainId: domain.id })}>View parameters</Button>
                      <Button variant="ghost" size="sm" className="h-7 px-2 text-[12px]" onClick={() => openEdit(domain)}><Pencil className="size-3.5" /> Edit</Button>
                      <Button variant="ghost" size="sm" className="h-7 px-2 text-[12px]" onClick={() => void toggleDomain(domain)}>{domain.active ? "Deactivate" : "Activate"}</Button>
                      <Button variant="ghost" size="sm" className="h-7 px-2 text-[12px] text-danger hover:text-danger" disabled={domain.parameterCount > 0} title={domain.parameterCount > 0 ? "A domain with parameters cannot be deleted; deactivate it instead." : "Delete unused domain"} onClick={() => setDeleting(domain)}><Trash2 className="size-3.5" /> Delete</Button>
                    </div>
                  </td>
                </tr>
              ))}</tbody>
            </table>
          </div>
        )}
      </Card>

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-h-[85vh] overflow-y-auto sm:max-w-lg">
          <DialogHeader><DialogTitle>{editing ? "Edit domain" : "Add domain"}</DialogTitle><DialogDescription>Domains with parameters can be deactivated, but cannot be deleted.</DialogDescription></DialogHeader>
          <div className="grid gap-4">
            <div className="grid gap-1.5"><Label htmlFor="domain-name">Domain name</Label><Input id="domain-name" maxLength={100} value={form.name} onChange={(event) => setForm((current) => ({ ...current, name: event.target.value }))} placeholder="e.g. Cybersecurity" /></div>
            <div className="grid gap-1.5"><Label htmlFor="domain-code">Domain code <span className="font-normal text-muted-foreground">(optional)</span></Label><Input id="domain-code" maxLength={40} value={form.code} onChange={(event) => setForm((current) => ({ ...current, code: event.target.value }))} placeholder="e.g. cybersecurity" /><p className="text-xs text-muted-foreground">Optional unique identifier using lowercase letters, numbers and underscores.</p></div>
            <div className="grid gap-1.5"><Label htmlFor="domain-description">Description <span className="font-normal text-muted-foreground">(optional)</span></Label><Textarea id="domain-description" maxLength={2000} rows={3} value={form.description} onChange={(event) => setForm((current) => ({ ...current, description: event.target.value }))} placeholder="What does this domain evaluate?" /></div>
            <div className="flex items-center justify-between rounded-lg border border-border px-3 py-2.5"><div><Label htmlFor="domain-active" className="text-[13px]">Active</Label><p className="text-xs text-muted-foreground">Inactive domains cannot be assigned to new parameters.</p></div><Switch id="domain-active" checked={form.active} onCheckedChange={(active) => setForm((current) => ({ ...current, active }))} /></div>
            {formError && <p role="alert" className="text-sm text-danger">{formError}</p>}
          </div>
          <DialogFooter><Button variant="outline" size="sm" onClick={() => setDialogOpen(false)}>Cancel</Button><Button size="sm" className="bg-primary hover:bg-primary-hover" disabled={saving} onClick={() => void saveDomain()}>{saving ? "Saving…" : editing ? "Save changes" : "Create domain"}</Button></DialogFooter>
        </DialogContent>
      </Dialog>

      <AlertDialog open={deleting !== null} onOpenChange={(open) => !open && setDeleting(null)}>
        <AlertDialogContent><AlertDialogHeader><AlertDialogTitle>Delete this unused domain?</AlertDialogTitle><AlertDialogDescription>{deleting?.name} will be removed. Domains connected to parameters or historical ratings cannot be deleted.</AlertDialogDescription></AlertDialogHeader><AlertDialogFooter><AlertDialogCancel>Cancel</AlertDialogCancel><AlertDialogAction className="bg-danger hover:bg-danger" onClick={() => void deleteDomain()}>Delete domain</AlertDialogAction></AlertDialogFooter></AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
