import styles from "./Tab.module.scss";

interface Props {
  draft: Record<string, unknown>;
  patch: (key: string, value: unknown) => void;
  role?: string;
}

const LLM_PROVIDERS = ["openai", "anthropic", "azure_openai"] as const;
const LLM_MODELS: Record<string, string[]> = {
  openai:       ["gpt-4o", "gpt-4o-mini", "gpt-4-turbo"],
  anthropic:    ["claude-opus-4-7", "claude-sonnet-4-6", "claude-haiku-4-5-20251001"],
  azure_openai: ["gpt-4o", "gpt-4-turbo"],
};

const AI_TOGGLES: Array<{ key: string; label: string; desc: string }> = [
  { key: "override_badge",   label: "Override Badge",    desc: "Show AI-override indicator on ratings that were changed by the AI assistant." },
  { key: "ai_risk_callout",  label: "AI Risk Callout",   desc: "Display an AI-generated risk insight callout card on each risk row." },
  { key: "mini_ai_tag",      label: "Mini AI Tag",       desc: "Show a compact AI tag on fields populated by the assistant." },
  { key: "ai_header_flag",   label: "AI Header Flag",    desc: "Add an AI-generated banner at the top of assessment reports." },
  { key: "ai_disclaimer",    label: "AI Disclaimer",     desc: "Include a disclaimer note on all AI-assisted content." },
];

const LEAD_ROLES = new Set(["delivery_lead", "admin"]);

export function TabAIAssistant({ draft, patch, role }: Props) {
  const canConfigLLM = role ? LEAD_ROLES.has(role) : false;
  const provider = (draft.llm_provider as string) ?? "openai";
  const models   = LLM_MODELS[provider] ?? LLM_MODELS.openai;

  return (
    <div className={styles.tab}>
      {/* AI Behavior Toggles */}
      <section className={styles.section}>
        <h3 className={styles.sectionTitle}>AI Behavior</h3>
        <p className={styles.sectionDesc}>Control how AI-generated content is displayed across the platform.</p>
        <div className={styles.toggleList}>
          {AI_TOGGLES.map(({ key, label, desc }) => (
            <label key={key} className={styles.toggleRow}>
              <div className={styles.toggleInfo}>
                <span className={styles.toggleLabel}>{label}</span>
                <span className={styles.toggleDesc}>{desc}</span>
              </div>
              <button
                role="switch"
                aria-checked={!!draft[key]}
                className={`${styles.toggle} ${draft[key] ? styles.toggleOn : ""}`}
                onClick={() => patch(key, !draft[key])}
              >
                <span className={styles.toggleThumb} />
              </button>
            </label>
          ))}
        </div>
      </section>

      {/* LLM Configuration — delivery_lead/admin only */}
      {canConfigLLM ? (
        <section className={styles.section}>
          <h3 className={styles.sectionTitle}>LLM Configuration</h3>
          <p className={styles.sectionDesc}>Configure the language model used for AI-assisted analysis.</p>

          <div className={styles.fieldGroup}>
            <label className={styles.fieldLabel}>Provider</label>
            <select
              className={styles.select}
              value={provider}
              onChange={(e) => {
                patch("llm_provider", e.target.value);
                patch("llm_model", LLM_MODELS[e.target.value]?.[0] ?? "gpt-4o");
              }}
            >
              {LLM_PROVIDERS.map((p) => (
                <option key={p} value={p}>{p}</option>
              ))}
            </select>
          </div>

          <div className={styles.fieldGroup}>
            <label className={styles.fieldLabel}>Model</label>
            <select
              className={styles.select}
              value={(draft.llm_model as string) ?? "gpt-4o"}
              onChange={(e) => patch("llm_model", e.target.value)}
            >
              {models.map((m) => (
                <option key={m} value={m}>{m}</option>
              ))}
            </select>
          </div>

          <div className={styles.fieldGroup}>
            <label className={styles.fieldLabel}>
              Temperature <span className={styles.rangeVal}>{(draft.llm_temperature as number ?? 0.3).toFixed(1)}</span>
            </label>
            <input
              type="range"
              min={0}
              max={1}
              step={0.1}
              className={styles.range}
              value={(draft.llm_temperature as number) ?? 0.3}
              onChange={(e) => patch("llm_temperature", parseFloat(e.target.value))}
            />
            <div className={styles.rangeLabels}><span>Precise</span><span>Creative</span></div>
          </div>

          <div className={styles.fieldGroup}>
            <label className={styles.fieldLabel}>
              Top P <span className={styles.rangeVal}>{(draft.llm_top_p as number ?? 0.8).toFixed(1)}</span>
            </label>
            <input
              type="range"
              min={0}
              max={1}
              step={0.1}
              className={styles.range}
              value={(draft.llm_top_p as number) ?? 0.8}
              onChange={(e) => patch("llm_top_p", parseFloat(e.target.value))}
            />
            <div className={styles.rangeLabels}><span>0</span><span>1</span></div>
          </div>

          <div className={styles.fieldGroup}>
            <label className={styles.fieldLabel}>Max Tokens</label>
            <div className={styles.inlineRow}>
              <input
                type="number"
                min={256}
                max={8192}
                step={256}
                className={styles.numberInput}
                value={(draft.llm_max_tokens as number) ?? 1500}
                onChange={(e) => patch("llm_max_tokens", Number(e.target.value))}
              />
            </div>
          </div>
        </section>
      ) : (
        <section className={styles.section}>
          <div className={styles.lockedNotice}>
            LLM configuration is restricted to Delivery Lead and Admin roles.
          </div>
        </section>
      )}
    </div>
  );
}
