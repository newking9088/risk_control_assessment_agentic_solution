import { useCallback, useEffect, useRef, useState } from "react";
import { taxonomyApi } from "./taxonomyApi";
import type { TaxonomySummary, TaxonomyFull, RiskItem, ControlItem } from "./taxonomyTypes";

export type RiskSourceFilter = "ALL" | "EXT" | "INT";

const RISK_PAGE  = 50;
const CTRL_PAGE  = 50;

export function useTaxonomyManagement() {
  const [taxonomies, setTaxonomies]   = useState<TaxonomySummary[]>([]);
  const [selectedId, setSelectedId]   = useState<string | null>(null);
  const [taxonomy, setTaxonomy]       = useState<TaxonomyFull | null>(null);
  const [editRisks, setEditRisks]     = useState<RiskItem[]>([]);
  const [editControls, setEditControls] = useState<ControlItem[]>([]);
  const originalRisks    = useRef<RiskItem[]>([]);
  const originalControls = useRef<ControlItem[]>([]);

  const [loading, setLoading]   = useState(false);
  const [error, setError]       = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);
  const [uploading, setUploading]   = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Risk filters
  const [riskSearch, setRiskSearch]               = useState("");
  const [riskCategoryFilter, setRiskCategoryFilter] = useState<string | null>(null);
  const [riskSourceFilter, setRiskSourceFilter]   = useState<RiskSourceFilter>("ALL");
  const [riskPage, setRiskPage]                   = useState(1);

  // Control filters
  const [controlSearch, setControlSearch]         = useState("");
  const [controlTypeFilter, setControlTypeFilter] = useState<string | null>(null);
  const [controlPage, setControlPage]             = useState(1);

  const [activeTab, setActiveTab] = useState<"risks" | "controls">("risks");

  function showSuccess(msg: string) {
    setSuccessMsg(msg);
    setTimeout(() => setSuccessMsg(null), 3000);
  }

  const loadTaxonomies = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const list = await taxonomyApi.list();
      setTaxonomies(list);
      if (list.length && !selectedId) {
        setSelectedId(list[0].id);
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load taxonomies");
    } finally {
      setLoading(false);
    }
  }, [selectedId]);

  const loadTaxonomy = useCallback(async (id: string) => {
    setLoading(true);
    setError(null);
    try {
      const t = await taxonomyApi.fetch(id);
      setTaxonomy(t);
      const risks    = Array.isArray(t.risks_data)    ? t.risks_data    : [];
      const controls = Array.isArray(t.controls_data) ? t.controls_data : [];
      setEditRisks(risks);
      setEditControls(controls);
      originalRisks.current    = risks;
      originalControls.current = controls;
      setRiskPage(1);
      setControlPage(1);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load taxonomy");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { loadTaxonomies(); }, []);

  useEffect(() => {
    if (selectedId) loadTaxonomy(selectedId);
  }, [selectedId]);

  // Inline edit handlers
  function handleRiskChange(index: number, field: keyof RiskItem, value: string) {
    setEditRisks((prev) => {
      const next = [...prev];
      next[index] = { ...next[index], [field]: value };
      return next;
    });
  }

  function handleControlChange(index: number, field: keyof ControlItem, value: string | boolean) {
    setEditControls((prev) => {
      const next = [...prev];
      next[index] = { ...next[index], [field]: value };
      return next;
    });
  }

  function addBlankRisk() {
    const blank: RiskItem = {
      risk_id: `R-${Date.now()}`,
      category: "",
      name: "",
      description: "",
      source: "EXT",
    };
    setEditRisks((prev) => [...prev, blank]);
  }

  function addBlankControl() {
    const blank: ControlItem = {
      control_id: `C-${Date.now()}`,
      control_name: "",
      description: "",
      control_type: "Preventive",
      is_key: false,
    };
    setEditControls((prev) => [...prev, blank]);
  }

  async function handleSave() {
    if (!selectedId) return;
    setError(null);
    try {
      // Diff risks
      const changedRisks = editRisks.filter((r, i) => {
        const orig = originalRisks.current[i];
        return !orig || JSON.stringify(r) !== JSON.stringify(orig);
      });
      if (changedRisks.length) {
        await taxonomyApi.patchItems(selectedId, "risk", changedRisks);
      }
      // Diff controls
      const changedControls = editControls.filter((c, i) => {
        const orig = originalControls.current[i];
        return !orig || JSON.stringify(c) !== JSON.stringify(orig);
      });
      if (changedControls.length) {
        await taxonomyApi.patchItems(selectedId, "control", changedControls);
      }
      originalRisks.current    = [...editRisks];
      originalControls.current = [...editControls];
      showSuccess("Changes saved successfully.");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Save failed");
    }
  }

  async function handleUpload(file: File) {
    if (!selectedId) return;
    setUploading(true);
    setError(null);
    try {
      const result = await taxonomyApi.upload(selectedId, file);
      showSuccess(`Uploaded: ${result.risks} risks, ${result.controls} controls`);
      await loadTaxonomy(selectedId);
      await loadTaxonomies();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Upload failed");
    } finally {
      setUploading(false);
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  }

  function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (file) handleUpload(file);
  }

  async function handleDelete() {
    if (!selectedId) return;
    if (!window.confirm("Permanently delete this taxonomy? This cannot be undone.")) return;
    try {
      await taxonomyApi.delete(selectedId);
      setSelectedId(null);
      setTaxonomy(null);
      setEditRisks([]);
      setEditControls([]);
      await loadTaxonomies();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Delete failed");
    }
  }

  // Filtered + paginated data
  const filteredRisks = editRisks.filter((r) => {
    const q = riskSearch.toLowerCase();
    const matchSearch = !q || r.name.toLowerCase().includes(q) || (r.description ?? "").toLowerCase().includes(q) || r.risk_id.toLowerCase().includes(q);
    const matchCat    = !riskCategoryFilter || r.category === riskCategoryFilter;
    const matchSrc    = riskSourceFilter === "ALL" || r.source === riskSourceFilter;
    return matchSearch && matchCat && matchSrc;
  });

  const filteredControls = editControls.filter((c) => {
    const q = controlSearch.toLowerCase();
    const matchSearch = !q || c.control_name.toLowerCase().includes(q) || (c.description ?? "").toLowerCase().includes(q) || c.control_id.toLowerCase().includes(q);
    const matchType   = !controlTypeFilter || c.control_type === controlTypeFilter;
    return matchSearch && matchType;
  });

  const riskTotalPages = Math.max(1, Math.ceil(filteredRisks.length / RISK_PAGE));
  const ctrlTotalPages = Math.max(1, Math.ceil(filteredControls.length / CTRL_PAGE));
  const riskPageData   = filteredRisks.slice((riskPage - 1) * RISK_PAGE, riskPage * RISK_PAGE);
  const ctrlPageData   = filteredControls.slice((controlPage - 1) * CTRL_PAGE, controlPage * CTRL_PAGE);

  const riskCategories = Array.from(new Set(editRisks.map((r) => r.category).filter(Boolean)));

  const stats = {
    totalRisks:    editRisks.length,
    totalControls: editControls.length,
    categories:    riskCategories.length,
    active:        taxonomy?.active ?? false,
  };

  return {
    taxonomies, selectedId, setSelectedId,
    taxonomy, loading, error, successMsg,
    editRisks, editControls,
    handleRiskChange, handleControlChange,
    addBlankRisk, addBlankControl,
    handleSave, handleDelete,
    fileInputRef, handleFileChange, uploading,
    riskSearch, setRiskSearch: (s: string) => { setRiskSearch(s); setRiskPage(1); },
    riskCategoryFilter, setRiskCategoryFilter: (v: string | null) => { setRiskCategoryFilter(v); setRiskPage(1); },
    riskSourceFilter, setRiskSourceFilter: (v: RiskSourceFilter) => { setRiskSourceFilter(v); setRiskPage(1); },
    controlSearch, setControlSearch: (s: string) => { setControlSearch(s); setControlPage(1); },
    controlTypeFilter, setControlTypeFilter: (v: string | null) => { setControlTypeFilter(v); setControlPage(1); },
    riskPageData, filteredRisks, riskPage, setRiskPage, riskTotalPages,
    ctrlPageData, filteredControls, controlPage, setControlPage, ctrlTotalPages,
    riskCategories, stats,
    activeTab, setActiveTab,
    RISK_PAGE, CTRL_PAGE,
  };
}
