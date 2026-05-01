import { useEffect, useRef, useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  Upload, FileText, Trash2, CheckCircle2, AlertCircle,
  BarChart2, Users, GitBranch, FileSearch, Loader2,
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

const SUPPORT_TYPES = [
  { category: "meeting_minutes",  title: "Meeting Minutes",       desc: "Workshop or kickoff meeting notes",    Icon: FileText    },
  { category: "process_desc",     title: "Process Descriptions",  desc: "Business process documentation",       Icon: FileSearch  },
  { category: "kpis_kris",        title: "KPIs / KRIs",          desc: "Key performance and risk indicators",  Icon: BarChart2   },
  { category: "process_maps",     title: "Process Maps",          desc: "Visual process flow diagrams",         Icon: GitBranch   },
  { category: "stakeholder_list", title: "Stakeholder List",      desc: "Assessment unit stakeholders",         Icon: Users       },
];

function fmtBytes(b: number) {
  if (b < 1024) return `${b} B`;
  if (b < 1024 * 1024) return `${(b / 1024).toFixed(2)} KB`;
  return `${(b / (1024 * 1024)).toFixed(2)} MB`;
}

function fmtDate(iso: string) {
  return new Date(iso).toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" });
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

  const [form, setForm] = useState({ title: "", unit_id: "", business_unit: "" });
  const [uploading, setUploading] = useState<string | null>(null); // category being uploaded

  useEffect(() => {
    if (data) {
      setForm({
        title:         data.title         ?? "",
        unit_id:       data.unit_id       ?? "",
        business_unit: data.business_unit ?? "",
      });
    }
  }, [data]);

  useEffect(() => {
    onValidChange(form.title.trim().length > 0 && form.business_unit.trim().length > 0);
  }, [form, onValidChange]);

  const save = useMutation({
    mutationFn: (body: Partial<typeof form>) =>
      api.patch(`/api/v1/assessments/${assessmentId}`, body).then((r) => r.json()),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["assessment", assessmentId] }),
  });

  const deleteDoc = useMutation({
    mutationFn: (docId: string) =>
      api.delete(`/api/v1/assessments/${assessmentId}/documents/${docId}`),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["documents", assessmentId] }),
  });

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
              <CheckCircle2 size={13} className={styles.prepStatusIcon} />
              Document analysis complete
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
    </div>
  );
}
