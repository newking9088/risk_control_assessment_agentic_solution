import { useRef, useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { api } from "@/lib/api";

export interface CatalogControl {
  id: string;
  name: string;
  description?: string;
  control_type?: string;
  is_key_control: boolean;
  source?: string;
  category?: string;
  display_label?: string;
  created_at: string;
}

export type TypeFilter = "all" | "Preventive" | "Detective" | "Corrective" | "Directive";

const PAGE_SIZE = 20;

export function normalizeType(t?: string): string {
  if (!t) return "other";
  const l = t.toLowerCase();
  if (l.startsWith("prev")) return "preventive";
  if (l.startsWith("det"))  return "detective";
  if (l.startsWith("cor"))  return "corrective";
  if (l.startsWith("dir"))  return "directive";
  return "other";
}

export function isKeyControl(val: boolean | string | undefined): boolean {
  if (typeof val === "boolean") return val;
  if (typeof val === "string")  return ["YES", "Y", "TRUE", "1"].includes(val.toUpperCase());
  return false;
}

export function useControlsLibrary() {
  const qc = useQueryClient();
  const [filter, setFilter] = useState<TypeFilter>("all");
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);
  const [uploadStatus, setUploadStatus] = useState<"idle" | "uploading" | "success" | "error">("idle");
  const [uploadMsg, setUploadMsg] = useState("");
  const fileInputRef = useRef<HTMLInputElement>(null);

  const { data, isLoading } = useQuery<{ items: CatalogControl[]; total: number }>({
    queryKey: ["controls-catalog"],
    queryFn: () => api.get("/api/v1/controls").then((r) => r.json()),
  });

  const all: CatalogControl[] = data?.items ?? [];

  const filtered = all.filter((c) => {
    const matchType   = filter === "all" || c.control_type === filter;
    const matchSearch = !search || c.name.toLowerCase().includes(search.toLowerCase());
    return matchType && matchSearch;
  });

  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const pageData   = filtered.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);

  const typeCounts = {
    all:        all.length,
    Preventive: all.filter((c) => c.control_type === "Preventive").length,
    Detective:  all.filter((c) => c.control_type === "Detective").length,
    Corrective: all.filter((c) => c.control_type === "Corrective").length,
    Directive:  all.filter((c) => c.control_type === "Directive").length,
  };

  const stats = {
    total:      all.length,
    preventive: typeCounts.Preventive,
    detective:  typeCounts.Detective,
    keyControls: all.filter((c) => isKeyControl(c.is_key_control)).length,
  };

  const deleteControl = useMutation({
    mutationFn: (id: string) => api.delete(`/api/v1/controls/${id}`),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["controls-catalog"] }),
  });

  function triggerUpload() {
    fileInputRef.current?.click();
  }

  async function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploadStatus("uploading");
    setUploadMsg("");
    try {
      const form = new FormData();
      form.append("file", file);
      const res = await fetch("/api/v1/controls/upload", {
        method: "POST",
        credentials: "include",
        body: form,
      });
      if (!res.ok) throw new Error(await res.text());
      const result = await res.json();
      setUploadStatus("success");
      setUploadMsg(`Uploaded: ${result.inserted} inserted, ${result.skipped} skipped`);
      qc.invalidateQueries({ queryKey: ["controls-catalog"] });
    } catch (err) {
      setUploadStatus("error");
      setUploadMsg(err instanceof Error ? err.message : "Upload failed");
    } finally {
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  }

  function exportCSV() {
    window.location.href = "/api/v1/controls/report";
  }

  return {
    all,
    filtered,
    pageData,
    isLoading,
    filter,
    setFilter: (f: TypeFilter) => { setFilter(f); setPage(1); },
    search,
    setSearch: (s: string) => { setSearch(s); setPage(1); },
    page,
    setPage,
    totalPages,
    typeCounts,
    stats,
    deleteControl,
    triggerUpload,
    handleFileChange,
    fileInputRef,
    uploadStatus,
    uploadMsg,
    exportCSV,
    PAGE_SIZE,
  };
}
