/**
 * Tests for useTaxonomyManagement — Array.isArray guard
 *
 * Root cause: when the API returns risks_data / controls_data as {} (JSON object)
 * instead of [] (array), the ?? [] fallback still returns {} because {} is truthy.
 * The fix is to use Array.isArray() instead of ??.
 */
import { renderHook, waitFor } from "@testing-library/react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { createQueryWrapper } from "../testUtils";
import { useTaxonomyManagement } from "@/features/taxonomy/useTaxonomyManagement";
import * as taxonomyApiModule from "@/features/taxonomy/taxonomyApi";

vi.mock("@tanstack/react-router", () => ({
  createRoute: vi.fn(() => ({})),
  useNavigate: () => vi.fn(),
  Link: ({ children, to }: { children: unknown; to: string }) => ({ children, to }),
}));

vi.mock("@/lib/auth", () => ({
  getSession: vi.fn().mockResolvedValue(null),
  signOut: vi.fn(),
}));

const EMPTY_SUMMARY = { id: "tax-1", name: "T", version: 1, active: true,
  source_type: "both", risk_count: 0, control_count: 0, file_name: null, uploaded_at: null, created_at: "" };

const BASE_FULL = {
  id: "tax-1", name: "T", version: 1, source_type: "both", schema: {},
  active: true, file_name: null, uploaded_at: null, created_at: "",
  risk_count: 0, control_count: 0,
};

function spyApi(risksData: unknown, controlsData: unknown) {
  vi.spyOn(taxonomyApiModule.taxonomyApi, "list").mockResolvedValue([EMPTY_SUMMARY]);
  vi.spyOn(taxonomyApiModule.taxonomyApi, "fetch").mockResolvedValue({
    ...BASE_FULL,
    risks_data: risksData as never,
    controls_data: controlsData as never,
  });
}

describe("useTaxonomyManagement — Array.isArray guard", () => {
  beforeEach(() => vi.clearAllMocks());

  it("sets editRisks to [] when API returns risks_data as object {}", async () => {
    spyApi({}, []);
    const { result } = renderHook(() => useTaxonomyManagement(), {
      wrapper: createQueryWrapper(),
    });
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(Array.isArray(result.current.editRisks)).toBe(true);
    expect(result.current.editRisks).toEqual([]);
  });

  it("sets editControls to [] when API returns controls_data as object {}", async () => {
    spyApi([], {});
    const { result } = renderHook(() => useTaxonomyManagement(), {
      wrapper: createQueryWrapper(),
    });
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(Array.isArray(result.current.editControls)).toBe(true);
    expect(result.current.editControls).toEqual([]);
  });

  it("sets editRisks to [] when API returns risks_data as null", async () => {
    spyApi(null, []);
    const { result } = renderHook(() => useTaxonomyManagement(), {
      wrapper: createQueryWrapper(),
    });
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.editRisks).toEqual([]);
  });

  it("preserves non-empty array risks_data", async () => {
    const risks = [{ risk_id: "R-1", name: "Fraud", category: "Fraud", description: "", source: "EXT" }];
    spyApi(risks, []);
    const { result } = renderHook(() => useTaxonomyManagement(), {
      wrapper: createQueryWrapper(),
    });
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.editRisks).toEqual(risks);
  });
});
