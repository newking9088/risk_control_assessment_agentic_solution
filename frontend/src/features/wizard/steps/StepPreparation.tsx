import { useEffect, useRef, useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  Upload, FileText, Trash2, CheckCircle2, AlertCircle,
  BarChart2, Users, GitBranch, FileSearch, Loader2,
  BookOpen, ShieldCheck, Check,
} from "lucide-react";
import clsx from "clsx";
import { api } from "@/lib/api";
import type { StepProps } from "../WizardLayout";
import styles from "./Step.module.scss";

interface Assessment {
  id: string; title: string; description: string; scope: string;
  assessment_date: string; owner: string; business_unit: string;
  unit_id?: string; taxonomy_scope?: string; risk_sources?: string[];
}

interface Doc {
  id: string; filename: string; mime_type: string;
  blob_size_bytes: number; uploaded_at: string; category: string;
}

interface Taxonomy {
  id: string; name: string; version: string;
  source_type: string; active: boolean;
}

const SUPPORT_TYPES = [
  { category: "meeting_minutes",  title: "Meeting Minutes",       desc: "Workshop or kickoff meeting notes",    Icon: FileText    },
  { category: "process_desc",     title: "Process Descriptions",  desc: "Business process documentation",       Icon: FileSearch  },
  { category: "kpis_kris",        title: "KPIs / KRIs",          desc: "Key performance and risk indicators",  Icon: BarChart2   },
  { category: "process_maps",     title: "Process Maps",          desc: "Visual process flow diagrams",         Icon: GitBranch   },
  { category: "stakeholder_list", title: "Stakeholder List",      desc: "Assessment unit stakeholders",         Icon: Users       },
];

const SCOPE_OPTIONS = [
  { value: "internal", label: "Insider Threat",  desc: "Risks from employees, contractors, and privileged users" },
  { value: "external", label: "External Fraud",  desc: "Risks from customers, third parties, and cybercriminals" },
  { value: "both",     label: "Both",            desc: "Comprehensive coverage of insider and external fraud risks" },
];

function fmtBytes(b: number) {
  if (b < 1024) return `${b} B`;
  if (b < 1024 * 1024) return `${(b / 1024).toFixed(2)} KB`;
  return `${(b / (1024 * 1024)).toFixed(2)} MB`;
}

function fmtDate(iso: string) {
  return new Date(iso).toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" });
}

// Extract a short org/company name from a taxonomy name
function extractOrgName(name: string): string {
  // e.g. "NGC Fraud Risk Framework" → "NGC"
  const first = name.split(/\s+/)[0];
  return first ?? name;
}

export function StepPreparation({ assessmentId, onValidChange }: StepProps) {
  const qc = useQueryClient();
  const auRef   = useRef<HTMLInputElement>(null);
  const suppRef = useRef<Record<string, HTMLInputElement | null>>({});

  const { data } = useQuery<Assessment>({
    queryKey: ["assessment", assessmentId],
    queryFn: () => api.get(`/api/v1/assessments/${assessmentId}`).then((r) => r.json()),
  });

  const { data: documents = [] } = useQuery<Doc[]>({
    queryKey: ["documents", assessmentId],
    queryFn: () => api.get(`/api/v1/assessments/${assessmentId}/documents`).then((r) => r.json()),
  });

  // Fetch available sources from taxonomy list + controls catalog
  const { data: taxonomies = [] } = useQuery<Taxonomy[]>({
    queryKey: ["taxonomies"],
    queryFn: () => api.get("/api/v1/taxonomy").then((r) => r.json()),
  });

  const { data: controlSources = [] } = useQuery<string[]>({
    queryKey: ["controlSources"],
    queryFn: () => api.get("/api/v1/controls/sources").then((r) => r.json()),
  });

  const [form, setForm] = useState({ title: "", unit_id: "", business_unit: "" });
  const [selectedSources, setSelectedSources] = useState<string[]>(["NGC"]);
  const [taxonomyScope, setTaxonomyScope] = useState<string>("both");
  const [uploading, setUploading] = useState<string | null>(null);
  const [analyzing, setAnalyzing] = useState(false);
  const [sourcesInitialised, setSourcesInitialised] = useState(false);

  // Build unified source list: one entry per unique org name
  // Taxonomy entries take priority; control-only sources are appended
  const taxonomySources = taxonomies.map((t) => ({
    key:   extractOrgName(t.name),
    label: t.name,
    type:  "taxonomy" as const,
  }));
  const usedTaxKeys = new Set(taxonomySources.map((s) => s.key));
  const controlOnlySources = controlSources
    .filter((s) => !usedTaxKeys.has(s))
    .map((s) => ({ key: s, label: s, type: "controls" as const }));

  // Always show NGC even if not yet in DB
  const allSources = [...taxonomySources, ...controlOnlySources];
  const hasNGC = allSources.some((s) => s.key === "NGC");
  const displaySources = hasNGC
    ? allSources
    : [{ key: "NGC", label: "NGC Fraud Risk Framework", type: "taxonomy" as const }, ...allSources];

  useEffect(() => {
    if (data) {
      setForm({
        title:         data.title         ?? "",
        unit_id:       data.unit_id       ?? "",
        business_unit: data.business_unit ?? "",
      });
      setTaxonomyScope(data.taxonomy_scope ?? "both");

      if (!sourcesInitialised) {
        setSourcesInitialised(true);
        const saved = data.risk_sources ?? [];
        // Auto-select NGC if nothing has been saved yet
        setSelectedSources(saved.length > 0 ? saved : ["NGC"]);
      }
    }
  }, [data]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    onValidChange(form.title.trim().length > 0 && form.business_unit.trim().length > 0);
  }, [form, onValidChange]);

  const save = useMutation({
    mutationFn: (body: Record<string, unknown>) =>
      api.patch(`/api/v1/assessments/${assessmentId}`, body).then((r) => r.json()),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["assessment", assessmentId] }),
  });

  const deleteDoc = useMutation({
    mutationFn: (docId: string) =>
      api.delete(`/api/v1/assessments/${assessmentId}/documents/${docId}`),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["documents", assessmentId] }),
  });

  async function triggerAnalysisPipeline() {
    setAnalyzing(true);
    try {
      await api.post(`/api/v1/assessments/${assessmentId}/ao-overview`, {});
      await api.post(`/api/v1/assessments/${assessmentId}/qa-run`, {});
      qc.invalidateQueries({ queryKey: ["qa-answers", assessmentId] });
    } catch {
      // Non-blocking — user can still answer manually in Step 2
    } finally {
      setAnalyzing(false);
    }
  }

  async function uploadFile(file: File, category: string) {
    setUploading(category);
    try {
      const fd = new FormData();
      fd.append("file", file);
      const res = await fetch(
        `/api/v1/upload?assessment_id=${assessmentId}&category=${category}`,
        { method: "POST", credentials: "include", body: fd },
      );
      if (!res.ok) throw new Error(await res.text());
      qc.invalidateQueries({ queryKey: ["documents", assessmentId] });
      if (category === "au_description") {
        triggerAnalysisPipeline();
      }
    } catch (e) {
      console.error(e);
    } finally {
      setUploading(null);
    }
  }

  function pickFile(ref: React.RefObject<HTMLInputElement | null>) {
    ref.current?.click();
  }

  function onAuChange(e: React.ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0];
    if (f) uploadFile(f, "au_description");
    e.target.value = "";
  }

  function onSuppChange(cat: string, e: React.ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0];
    if (f) uploadFile(f, cat);
    e.target.value = "";
  }

  function toggleSource(key: string) {
    setSelectedSources((prev) => {
      const next = prev.includes(key) ? prev.filter((s) => s !== key) : [...prev, key];
      save.mutate({ risk_sources: next });
      return next;
    });
  }

  function handleScopeClick(value: string) {
    setTaxonomyScope(value);
    save.mutate({ taxonomy_scope: value });
  }

  const auDocs   = documents.filter((d) => d.category === "au_description" || !d.category);
  const suppDocs = (cat: string) => documents.filter((d) => d.category === cat);

  return (
    <div className={styles.step}>
      <div className={styles.stepHeader}>
        <h2 className={styles.stepTitle}>Step 1: Prepare an Assessment</h2>
        <p className={styles.stepDesc}>Set up the assessment parameters and upload the supporting documents</p>
      </div>

      {/* ── Top two-column layout ── */}
      <div className={styles.prepLayout}>

        {/* Left: Assessment Unit Details */}
        <div className={clsx(styles.card, styles.prepCard)}>
          <div className={styles.prepCardHeader}>
            <span className={styles.prepCardTitle}>
              <FileText size={14} strokeWidth={2.2} className={styles.prepCardIcon} />
              Assessment Unit Details
            </span>
            <span className={styles.required}>*</span>
          </div>

          <div className={styles.prepFieldStack}>
            <div>
              <label className={styles.label}>
                Assessment Unit ID <span className={styles.required}>*</span>
              </label>
              <input
                className={styles.input}
                value={form.unit_id}
                onChange={(e) => setForm((f) => ({ ...f, unit_id: e.target.value }))}
                onBlur={() => save.mutate({ unit_id: form.unit_id })}
                placeholder="e.g. RET-228"
              />
            </div>

            <div>
              <label className={styles.label}>
                Assessment Unit Name <span className={styles.required}>*</span>
              </label>
              <input
                className={styles.input}
                value={form.title}
                onChange={(e) => setForm((f) => ({ ...f, title: e.target.value }))}
                onBlur={() => save.mutate({ title: form.title })}
                placeholder="e.g. Consumer Credit Card Opening"
              />
            </div>

            <div>
              <label className={styles.label}>
                Line of Business <span className={styles.required}>*</span>
              </label>
              <input
                className={styles.input}
                value={form.business_unit}
                onChange={(e) => setForm((f) => ({ ...f, business_unit: e.target.value }))}
                onBlur={() => save.mutate({ business_unit: form.business_unit })}
                placeholder="e.g. Retail 2"
              />
            </div>
          </div>
        </div>

        {/* Right: AU Description upload */}
        <div className={clsx(styles.card, styles.prepCard)}>
          <div className={styles.prepCardHeader}>
            <span className={styles.prepCardTitle}>
              AU Description and Business Process Details
            </span>
            <span className={styles.required}>*</span>
            <input
              ref={auRef}
              type="file"
              accept=".pdf,.doc,.docx,.xls,.xlsx"
              style={{ display: "none" }}
              onChange={onAuChange}
            />
            <button
              type="button"
              className={styles.prepUploadBtn}
              onClick={() => pickFile(auRef)}
              disabled={uploading === "au_description"}
            >
              {uploading === "au_description"
                ? <Loader2 size={13} className={styles.prepSpinner} />
                : <Upload size={13} />}
              Upload
            </button>
          </div>

          {auDocs.length > 0 && (
            <p className={styles.prepFileCount}>{auDocs.length} file{auDocs.length !== 1 ? "s" : ""} uploaded</p>
          )}

          <div className={styles.prepFileList}>
            {auDocs.map((doc) => (
              <div key={doc.id} className={styles.prepFileRow}>
                <FileText size={14} className={styles.prepFileIcon} />
                <div className={styles.prepFileMeta}>
                  <span className={styles.prepFileName}>{doc.filename}</span>
                  <span className={styles.prepFileSizeDt}>
                    {fmtBytes(doc.blob_size_bytes)} · {fmtDate(doc.uploaded_at)}
                  </span>
                </div>
                <button
                  type="button"
                  className={styles.prepFileDelete}
                  onClick={() => deleteDoc.mutate(doc.id)}
                  title="Remove"
                >
                  <Trash2 size={13} />
                </button>
              </div>
            ))}
          </div>

          {auDocs.length > 0 && (
            <div className={styles.prepFileStatus}>
              {analyzing ? (
                <>
                  <Loader2 size={13} className={styles.prepSpinner} />
                  Analyzing document — AI is generating AU profile &amp; questionnaire answers…
                </>
              ) : (
                <>
                  <CheckCircle2 size={13} className={styles.prepStatusIcon} />
                  Document analysis complete
                </>
              )}
            </div>
          )}

          {auDocs.length === 0 && uploading !== "au_description" && (
            <div className={styles.prepUploadPlaceholder}>
              <AlertCircle size={14} className={styles.prepPlaceholderIcon} />
              <span>No document uploaded yet. Upload the AU description to proceed.</span>
            </div>
          )}
        </div>
      </div>

      {/* ── Supporting Documents ── */}
      <div className={clsx(styles.card, styles.prepSupportCard)}>
        <div className={styles.prepSupportHeader}>
          <span className={styles.sectionTitle}>Supporting Documents</span>
          <p className={styles.prepSupportDesc}>
            Upload relevant documentation to enhance AI-assisted risk identification
          </p>
        </div>

        <div className={styles.prepDocGrid}>
          {SUPPORT_TYPES.map(({ category, title, desc, Icon }) => {
            const docs = suppDocs(category);
            const isUploading = uploading === category;
            return (
              <button
                key={category}
                type="button"
                className={clsx(styles.prepDocTile, docs.length > 0 && styles.prepDocTileUploaded)}
                onClick={() => suppRef.current[category]?.click()}
                disabled={isUploading}
              >
                <input
                  ref={(el) => { suppRef.current[category] = el; }}
                  type="file"
                  accept=".pdf,.doc,.docx,.xls,.xlsx"
                  style={{ display: "none" }}
                  onChange={(e) => onSuppChange(category, e)}
                />
                <div className={styles.prepDocIconWrap}>
                  {isUploading
                    ? <Loader2 size={22} className={styles.prepSpinner} />
                    : <Icon size={22} strokeWidth={1.5} />}
                </div>
                <div className={styles.prepDocTileTitle}>{title}</div>
                <div className={styles.prepDocTileDesc}>{desc}</div>
                {docs.length > 0 && (
                  <div className={styles.prepDocBadge}>{docs.length}</div>
                )}
              </button>
            );
          })}
        </div>
      </div>

      {/* ── Risk Assessment Focus ── */}
      <div className={clsx(styles.card, styles.prepFocusCard)}>
        <div className={styles.prepFocusHeading}>RISK ASSESSMENT FOCUS</div>

        {/* Step A: Risk & Controls Sources */}
        <div className={styles.prepFocusSection}>
          <div className={styles.prepFocusSectionLabel}>
            <BookOpen size={14} className={styles.prepFocusSectionIcon} />
            Risk &amp; Controls Sources
          </div>
          <p className={styles.prepFocusSectionDesc}>
            Select the risk and controls frameworks that apply to this assessment.
            Sources are drawn from the Controls Library and Taxonomy configured in the dashboard.
          </p>

          <div className={styles.prepSourceGrid}>
            {displaySources.map(({ key, label, type }) => {
              const selected = selectedSources.includes(key);
              return (
                <button
                  key={key}
                  type="button"
                  className={clsx(styles.prepSourceCard, selected && styles.prepSourceCardActive)}
                  onClick={() => toggleSource(key)}
                >
                  <div className={styles.prepSourceCardTop}>
                    <span className={clsx(
                      styles.prepSourceTypeBadge,
                      type === "taxonomy" ? styles.prepBadgeTaxonomy : styles.prepBadgeControls
                    )}>
                      {type === "taxonomy" ? "Taxonomy" : "Controls"}
                    </span>
                    {selected && (
                      <span className={styles.prepSourceCheck}>
                        <Check size={11} strokeWidth={3} />
                      </span>
                    )}
                  </div>
                  <div className={styles.prepSourceName}>{label}</div>
                </button>
              );
            })}
          </div>
        </div>

        <div className={styles.prepFocusDivider} />

        {/* Step B: Risk Scope */}
        <div className={styles.prepFocusSection}>
          <div className={styles.prepFocusSectionLabel}>
            <ShieldCheck size={14} className={styles.prepFocusSectionIcon} />
            Risk Scope
          </div>
          <p className={styles.prepFocusSectionDesc}>
            Define which types of fraud risk this assessment will cover.
          </p>

          <div className={styles.prepScopeRow}>
            {SCOPE_OPTIONS.map((opt) => {
              const active = taxonomyScope === opt.value;
              return (
                <button
                  key={opt.value}
                  type="button"
                  className={clsx(styles.prepScopeBtn, active && styles.prepScopeBtnActive)}
                  onClick={() => handleScopeClick(opt.value)}
                >
                  {active && <Check size={12} strokeWidth={3} className={styles.prepScopeCheck} />}
                  <span className={styles.prepScopeBtnLabel}>{opt.label}</span>
                  <span className={styles.prepScopeBtnDesc}>{opt.desc}</span>
                </button>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
}
