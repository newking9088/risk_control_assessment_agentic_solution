import { api } from "@/lib/api";
import type { TaxonomySummary, TaxonomyFull, RiskItem, ControlItem } from "./taxonomyTypes";

const BASE = "/api/v1/taxonomy";

export const taxonomyApi = {
  list: (): Promise<TaxonomySummary[]> =>
    api.get(BASE).then((r) => r.json()),

  fetch: (id: string): Promise<TaxonomyFull> =>
    api.get(`${BASE}/${id}`).then((r) => r.json()),

  create: (body: { name: string; version?: number; source_type?: string }): Promise<{ id: string }> =>
    api.post(BASE, body).then((r) => r.json()),

  patchMeta: (id: string, body: { name?: string; active?: boolean }): Promise<void> =>
    api.patch(`${BASE}/${id}`, body).then(() => undefined),

  delete: (id: string): Promise<void> =>
    api.delete(`${BASE}/${id}`).then(() => undefined),

  patchItems: (
    id: string,
    item_type: "risk" | "control",
    items: Partial<RiskItem & ControlItem>[],
  ): Promise<{ updated: number }> =>
    api.patch(`${BASE}/${id}/items`, { item_type, items }).then((r) => r.json()),

  export: (id: string): void => {
    window.location.href = `${BASE}/${id}/export`;
  },

  upload: async (id: string, file: File): Promise<{ risks: number; controls: number }> => {
    const form = new FormData();
    form.append("file", file);
    const res = await fetch(`${BASE}/${id}/upload`, {
      method: "POST",
      credentials: "include",
      body: form,
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({ detail: res.statusText }));
      throw new Error(err?.detail ?? res.statusText);
    }
    return res.json();
  },
};
