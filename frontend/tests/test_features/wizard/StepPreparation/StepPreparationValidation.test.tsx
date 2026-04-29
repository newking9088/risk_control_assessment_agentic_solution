import { render, screen } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { describe, it, expect, vi } from "vitest";

vi.mock("@/lib/api", () => ({ api: { get: vi.fn(), patch: vi.fn() } }));

import { api } from "@/lib/api";
import { StepPreparation } from "@/features/wizard/steps/StepPreparation";

function setup(mockData: object, onValidChange = vi.fn()) {
  (api.get as ReturnType<typeof vi.fn>).mockResolvedValue({
    json: () => Promise.resolve(mockData),
    ok: true,
  });
  (api.patch as ReturnType<typeof vi.fn>).mockResolvedValue({
    json: () => Promise.resolve(mockData),
    ok: true,
  });
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={qc}>
      <StepPreparation assessmentId="a1" onValidChange={onValidChange} />
    </QueryClientProvider>
  );
}

describe("StepPreparation — validation rules", () => {
  it("onValidChange(false) when api returns assessment with empty title", async () => {
    const onValidChange = vi.fn();
    setup({ title: "", scope: "Some scope", owner: "Jane" }, onValidChange);
    await screen.findByText(/assessment details/i);
    expect(onValidChange).toHaveBeenCalledWith(false);
  });

  it("onValidChange(false) when api returns assessment with empty scope", async () => {
    const onValidChange = vi.fn();
    setup({ title: "My Assessment", scope: "", owner: "Jane" }, onValidChange);
    await screen.findByText(/assessment details/i);
    expect(onValidChange).toHaveBeenCalledWith(false);
  });

  it("onValidChange(true) when title and scope are both filled", async () => {
    const onValidChange = vi.fn();
    setup(
      { title: "My Assessment", scope: "Retail Banking", owner: "Jane Doe", business_unit: "Retail" },
      onValidChange
    );
    await screen.findByText(/assessment details/i);
    expect(onValidChange).toHaveBeenCalledWith(true);
  });
});
