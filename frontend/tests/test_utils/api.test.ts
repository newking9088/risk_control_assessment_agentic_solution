import { describe, it, expect, vi, beforeEach } from "vitest";

const makeFetchResponse = (ok: boolean, status: number, body: unknown) => ({
  ok,
  status,
  json: vi.fn().mockResolvedValue(body),
  statusText: ok ? "OK" : "Error",
});

beforeEach(() => {
  vi.restoreAllMocks();
});

describe("api.get", () => {
  it("sends GET request with correct URL", async () => {
    const fetchSpy = vi.spyOn(globalThis, "fetch").mockResolvedValueOnce(
      makeFetchResponse(true, 200, { data: 1 }) as unknown as Response
    );
    const { api } = await import("@/lib/api");
    await api.get("/api/v1/assessments");
    expect(fetchSpy).toHaveBeenCalledWith(
      "/api/v1/assessments",
      expect.objectContaining({ method: "GET" })
    );
  });

  it("returns Response object on success", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValueOnce(
      makeFetchResponse(true, 200, { id: "1" }) as unknown as Response
    );
    const { api } = await import("@/lib/api");
    const resp = await api.get("/api/v1/assessments");
    expect(resp).toBeDefined();
    expect(resp.ok).toBe(true);
  });

  it("throws on non-OK response with error message from body", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValueOnce(
      makeFetchResponse(false, 404, { error: { message: "Not found" } }) as unknown as Response
    );
    const { api } = await import("@/lib/api");
    await expect(api.get("/api/v1/assessments/bad-id")).rejects.toThrow("Not found");
  });
});

describe("api.post", () => {
  it("sends POST with JSON body and Content-Type header", async () => {
    const fetchSpy = vi.spyOn(globalThis, "fetch").mockResolvedValueOnce(
      makeFetchResponse(true, 201, { id: "new" }) as unknown as Response
    );
    const { api } = await import("@/lib/api");
    await api.post("/api/v1/assessments", { title: "Test" });
    expect(fetchSpy).toHaveBeenCalledWith(
      "/api/v1/assessments",
      expect.objectContaining({
        method: "POST",
        headers: expect.objectContaining({ "Content-Type": "application/json" }),
        body: JSON.stringify({ title: "Test" }),
      })
    );
  });

  it("throws on 404", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValueOnce(
      makeFetchResponse(false, 404, { error: { message: "Not found" } }) as unknown as Response
    );
    const { api } = await import("@/lib/api");
    await expect(api.post("/api/v1/assessments/bad", {})).rejects.toThrow();
  });
});

describe("api.patch", () => {
  it("sends PATCH with JSON body", async () => {
    const fetchSpy = vi.spyOn(globalThis, "fetch").mockResolvedValueOnce(
      makeFetchResponse(true, 200, { id: "1" }) as unknown as Response
    );
    const { api } = await import("@/lib/api");
    await api.patch("/api/v1/assessments/1", { status: "in_progress" });
    expect(fetchSpy).toHaveBeenCalledWith(
      "/api/v1/assessments/1",
      expect.objectContaining({
        method: "PATCH",
        body: JSON.stringify({ status: "in_progress" }),
      })
    );
  });
});

describe("api.delete", () => {
  it("sends DELETE request", async () => {
    const fetchSpy = vi.spyOn(globalThis, "fetch").mockResolvedValueOnce(
      makeFetchResponse(true, 204, null) as unknown as Response
    );
    const { api } = await import("@/lib/api");
    await api.delete("/api/v1/assessments/1");
    expect(fetchSpy).toHaveBeenCalledWith(
      "/api/v1/assessments/1",
      expect.objectContaining({ method: "DELETE" })
    );
  });
});

describe("credentials", () => {
  it("all methods pass credentials: include to fetch", async () => {
    const fetchSpy = vi.spyOn(globalThis, "fetch").mockResolvedValue(
      makeFetchResponse(true, 200, {}) as unknown as Response
    );
    const { api } = await import("@/lib/api");
    await api.get("/test");
    await api.post("/test", {});
    await api.patch("/test", {});
    await api.delete("/test");

    const calls = fetchSpy.mock.calls;
    calls.forEach(([, opts]) => {
      expect((opts as RequestInit).credentials).toBe("include");
    });
  });
});
