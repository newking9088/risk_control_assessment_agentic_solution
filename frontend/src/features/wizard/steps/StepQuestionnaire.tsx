import { useEffect, useRef, useState, useCallback } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  User, ShoppingBag, Radio, GitBranch, Users,
  Lock, ArrowLeftRight, FileText, AlertTriangle,
  CreditCard, Monitor, Bell, UserCog, AlertOctagon,
  ChevronDown, ChevronRight, RefreshCw, Sparkles, X, Send,
} from "lucide-react";
import clsx from "clsx";
import { api } from "@/lib/api";
import type { StepProps } from "../WizardLayout";
import styles from "./Step.module.scss";

// ─────────────────────────────────────────────────────────────
// Question bank — 96 questions across 14 categories
// ─────────────────────────────────────────────────────────────
interface Question {
  id: string;
  text: string;
  criteria: string;
}
interface Category {
  key: string;
  label: string;
  Icon: React.FC<{ size?: number; strokeWidth?: number; className?: string }>;
  questions: Question[];
}

const CATEGORIES: Category[] = [
  {
    key: "entity_customer", label: "Entity/Customer Exposure", Icon: User,
    questions: [
      { id: "AUP-001", text: "Does this assessment unit involve individual consumers?", criteria: "Yes if this unit serves retail or personal banking customers (not solely businesses)." },
      { id: "AUP-002", text: "Does this assessment unit involve business or commercial entities?", criteria: "Yes if this unit serves corporate, small-business, or commercial clients." },
      { id: "AUP-003", text: "Does this assessment unit involve high-net-worth or wealth customers?", criteria: "Yes if this unit specifically handles private banking, wealth, or affluent customer segments." },
      { id: "AUP-004", text: "Does this assessment unit involve elderly or vulnerable populations?", criteria: "Yes if this unit interacts with customers who may be elderly, disabled, or otherwise vulnerable to exploitation. Any unit serving a broad, unscreened consumer population inherently includes vulnerable individuals." },
      { id: "AUP-005", text: "Does this assessment unit perform onboarding, account opening, or application intake for new customers or prospects?", criteria: "Yes if this unit opens new accounts or accepts applications, not just serves first-time callers." },
      { id: "AUP-006", text: "Does this assessment unit service, transact with, or manage accounts for existing customers?", criteria: "Yes if this unit handles requests, transactions, or account changes for already-enrolled customers." },
    ],
  },
  {
    key: "product_service", label: "Product/Service Exposure", Icon: ShoppingBag,
    questions: [
      { id: "AUP-007", text: "Does this assessment unit involve deposit accounts?", criteria: "Yes if this unit handles, services, or supports customers with checking, savings, CD, or money market accounts — including account inquiries, balance lookups, or account maintenance for deposit products." },
      { id: "AUP-008", text: "Does this assessment unit involve credit products (loans, credit cards, lines of credit)?", criteria: "Yes if this unit originates, services, or supports any credit product. This includes credit card activation, blocking, status changes, balance inquiries, or any post-issuance servicing of credit cards, loans, or lines of credit." },
      { id: "AUP-009", text: "Does this assessment unit involve debit or prepaid cards?", criteria: "Yes if this unit issues, services, activates, blocks, replaces, or processes transactions for debit or prepaid cards." },
      { id: "AUP-010", text: "Does this assessment unit initiate, process, or authorize payments or money transfers?", criteria: "Yes if this unit initiates, facilitates, or supports fund transfers, payment requests, or transaction processing — not just displays balances." },
      { id: "AUP-011", text: "Does this assessment unit involve check products or processing?", criteria: "Yes if this unit handles check issuance, deposits, or clearing." },
      { id: "AUP-012", text: "Does this assessment unit involve investment or wealth management products?", criteria: "Yes if this unit handles brokerage, mutual funds, or portfolio management services." },
      { id: "AUP-013", text: "Does this assessment unit involve insurance products?", criteria: "Yes if this unit sells, services, or processes claims for insurance policies." },
    ],
  },
  {
    key: "channel", label: "Channel Exposure", Icon: Radio,
    questions: [
      { id: "AUP-014", text: "Does this assessment unit involve digital channels (web, mobile app)?", criteria: "Yes if customers interact through online banking, a mobile app, or a web portal." },
      { id: "AUP-015", text: "Does this assessment unit involve branch or in-person channels?", criteria: "Yes if customers visit a physical location to conduct business." },
      { id: "AUP-016", text: "Does this assessment unit involve call center or phone channels?", criteria: "Yes if customers contact this unit by phone, or agents make outbound calls." },
      { id: "AUP-017", text: "Does this assessment unit involve ATM or self-service kiosk channels?", criteria: "Yes if customers use ATMs or self-service terminals to conduct transactions." },
      { id: "AUP-018", text: "Does this assessment unit involve third-party or agent channels?", criteria: "Yes if external partners, agents, or intermediaries interact with customers on behalf of this unit." },
      { id: "AUP-019", text: "Does this assessment unit involve API or system-to-system channels?", criteria: "Yes if external systems connect via API, file transfer, or automated integration." },
      { id: "AUP-020", text: "Does this assessment unit involve mail or physical document channels?", criteria: "Yes if this unit sends or receives physical mail, statements, cards, or documents." },
    ],
  },
  {
    key: "process", label: "Process Exposure", Icon: GitBranch,
    questions: [
      { id: "AUP-021", text: "Does this assessment unit perform customer onboarding, identity verification, or account opening processes?", criteria: "Yes if this unit creates new customer relationships or accounts, including KYC and identity verification." },
      { id: "AUP-022", text: "Does this assessment unit involve customer authentication or login?", criteria: "Yes if customers must verify their identity (password, PIN, security question) to access services." },
      { id: "AUP-023", text: "Does this assessment unit initiate, authorize, or execute financial transactions on behalf of or for customers?", criteria: "Yes if this unit can initiate, facilitate, or process fund transfers, payments, debits, credits, or other monetary transactions on behalf of customers." },
      { id: "AUP-024", text: "Does this assessment unit perform account updates, information changes, or ongoing account servicing for customers?", criteria: "Yes if this unit modifies account details, contact info, beneficiaries, or account settings." },
      { id: "AUP-025", text: "Does this assessment unit involve dispute or claim handling?", criteria: "Yes if this unit handles, escalates, investigates, or resolves customer complaints, disputes, or fraud claims." },
      { id: "AUP-026", text: "Does this assessment unit involve credit decisioning or underwriting?", criteria: "Yes if this unit evaluates creditworthiness, approves loans, or sets credit limits." },
    ],
  },
  {
    key: "employee_internal", label: "Employee/Internal Exposure", Icon: Users,
    questions: [
      { id: "AUP-027", text: "Do employees in this assessment unit have access to customer personally identifiable information (PII) or account data?", criteria: "Yes if employees can view names, SSNs, addresses, balances, or transaction histories." },
      { id: "AUP-028", text: "Do employees in this assessment unit have the ability to initiate, approve, or process financial transactions?", criteria: "Yes if employees can initiate, facilitate, or process fund transfers, payments, adjustments, or credits on behalf of customers." },
      { id: "AUP-029", text: "Does this assessment unit involve employees with access to funds or physical assets?", criteria: "Yes if employees handle cash, checks, cards, or other tangible financial instruments." },
      { id: "AUP-030", text: "Does this assessment unit involve employees who interact directly with customers?", criteria: "Yes if employees speak with, message, or otherwise communicate directly with customers." },
      { id: "AUP-031", text: "Does this assessment unit involve third-party vendors or contractors?", criteria: "Yes if external vendors, contractors, or outsourced staff perform work for this unit." },
    ],
  },
  {
    key: "auth_access", label: "Authentication & Access Exposures", Icon: Lock,
    questions: [
      { id: "FRE-007", text: "Does this assessment unit allow customers to view or interact with their existing account information (balances, statements, transactions)?", criteria: "Yes if customers can access, view, inquire about, or take action on their account information through this unit — whether directly or via an agent who retrieves account data on their behalf." },
      { id: "FRE-008", text: "Does this assessment unit authenticate customer identity before granting access?", criteria: "Yes if customers must prove who they are (password, PIN, security question) before proceeding." },
      { id: "FRE-009", text: "Does this assessment unit support password or credential reset?", criteria: "Yes if customers or agents can reset passwords, PINs, or security questions." },
      { id: "FRE-010", text: "Does this assessment unit allow changes to security settings (password, MFA, security questions)?", criteria: "Yes if customers or agents can modify authentication methods or security configurations, including password resets, PIN changes, or security question updates." },
      { id: "FRE-011", text: "Does this assessment unit allow changes to contact information (phone, email, address)?", criteria: "Yes if customers or agents can update phone numbers, email addresses, or mailing addresses on accounts." },
      { id: "FRE-012", text: "Does this assessment unit allow adding authorized users or signers to accounts?", criteria: "Yes if additional people can be granted access or signing authority on an account." },
      { id: "FRE-013", text: "Can customers access accounts through multiple devices?", criteria: "Yes if the same account can be accessed from different phones, computers, or tablets." },
    ],
  },
  {
    key: "transaction_payment", label: "Transaction & Payment Exposures", Icon: ArrowLeftRight,
    questions: [
      { id: "FRE-014", text: "Does this assessment unit process outgoing payments or transfers?", criteria: "Yes if this unit sends money out of customer accounts (bill pay, wire, ACH, P2P)." },
      { id: "FRE-015", text: "Does this assessment unit process incoming payments or deposits?", criteria: "Yes if this unit receives funds into customer accounts (direct deposit, transfers in, check deposit)." },
      { id: "FRE-016", text: "Does this assessment unit process card transactions (credit, debit, prepaid)?", criteria: "Yes if this unit authorizes, clears, settles, activates, blocks, or otherwise services card-based transactions or card accounts." },
      { id: "FRE-017", text: "Does this assessment unit process electronic transfers (ACH, wire)?", criteria: "Yes if this unit handles ACH originations, wire transfers, or other electronic fund movements." },
      { id: "FRE-018", text: "Does this assessment unit process real-time or instant payments?", criteria: "Yes if this unit supports Zelle, RTP, FedNow, or other near-instant fund transfers." },
      { id: "FRE-019", text: "Does this assessment unit process check deposits or payments?", criteria: "Yes if this unit handles paper or mobile check deposits, or issues outgoing checks." },
      { id: "FRE-020", text: "Does this assessment unit allow adding external accounts or payment recipients?", criteria: "Yes if customers can link external bank accounts or register new payees for transfers." },
      { id: "FRE-021", text: "Does this assessment unit process transactions that exceed standard thresholds or require elevated approval (e.g., large wire transfers, bulk payments)?", criteria: "Yes if there are transactions above normal limits that require special handling." },
      { id: "FRE-022", text: "Does this assessment unit process international transactions?", criteria: "Yes if this unit handles cross-border payments, foreign currency, or international wires." },
      { id: "FRE-023", text: "Does this assessment unit allow card-not-present transactions?", criteria: "Yes if card purchases can occur without the physical card (online, phone, mail order)." },
    ],
  },
  {
    key: "credit_application", label: "Credit & Application Exposures", Icon: FileText,
    questions: [
      { id: "FRE-024", text: "Does this assessment unit accept applications for credit or loans?", criteria: "Yes if customers submit credit card, loan, or line-of-credit applications through this unit." },
      { id: "FRE-025", text: "Does this assessment unit accept income, employment, or financial information?", criteria: "Yes if applicants provide salary, employer, or asset details as part of the process." },
      { id: "FRE-026", text: "Does this assessment unit accept supporting documents (pay stubs, tax returns, bank statements)?", criteria: "Yes if applicants upload or submit financial documents to support their application." },
      { id: "FRE-027", text: "Does this assessment unit make credit or lending decisions?", criteria: "Yes if this unit approves, denies, or conditions credit or loan applications." },
      { id: "FRE-028", text: "Does this assessment unit provide same-session or automated approval decisions for credit or account applications?", criteria: "Yes if approval can happen in real time or within minutes, without manual underwriting." },
      { id: "FRE-029", text: "Does this assessment unit disburse loan proceeds or credit?", criteria: "Yes if this unit releases funds to borrowers after approval (loan funding, credit line draws)." },
      { id: "FRE-030", text: "Does this assessment unit allow credit limit increases?", criteria: "Yes if customers can request or receive automatic increases to their credit limits." },
    ],
  },
  {
    key: "dispute_claim", label: "Dispute & Claim Exposures", Icon: AlertTriangle,
    questions: [
      { id: "FRE-036", text: "Does this assessment unit handle transaction disputes?", criteria: "Yes if customers can raise complaints about transactions, contest charges, report errors, or request transaction reversals. General complaint resolution processes that cover transaction-related issues qualify." },
      { id: "FRE-037", text: "Does this assessment unit handle fraud claims?", criteria: "Yes if customers can report suspected fraud and this unit investigates or processes the claim." },
      { id: "FRE-038", text: "Does this assessment unit issue provisional credits during investigations?", criteria: "Yes if customers receive temporary refunds while a dispute or fraud claim is being investigated." },
      { id: "FRE-039", text: "Does this assessment unit process chargebacks?", criteria: "Yes if this unit initiates or resolves card network chargebacks on behalf of customers." },
      { id: "FRE-040", text: "Does this assessment unit allow customers to claim transactions as unauthorized?", criteria: "Yes if customers can formally report that they did not authorize a specific transaction." },
    ],
  },
  {
    key: "card_physical", label: "Card & Physical Instrument Exposures", Icon: CreditCard,
    questions: [
      { id: "FRE-041", text: "Does this assessment unit issue cards (credit, debit, prepaid)?", criteria: "Yes if this unit produces, orders, or activates new payment cards for customers." },
      { id: "FRE-042", text: "Does this assessment unit handle card activation?", criteria: "Yes if customers or agents activate newly issued cards through this unit." },
      { id: "FRE-043", text: "Does this assessment unit handle card replacement or reissuance?", criteria: "Yes if lost, stolen, or damaged cards can be replaced through this unit." },
      { id: "FRE-044", text: "Does this assessment unit issue or process checks?", criteria: "Yes if this unit prints, orders, or processes physical checks for customers." },
      { id: "FRE-045", text: "Does this assessment unit mail physical items to customers (cards, PINs, statements, checks)?", criteria: "Yes if physical documents or instruments are sent via postal mail to customer addresses." },
    ],
  },
  {
    key: "digital_technical", label: "Digital & Technical Exposures", Icon: Monitor,
    questions: [
      { id: "FRE-046", text: "Does this assessment unit involve web application access?", criteria: "Yes if customers or employees use a browser-based web application (e.g., online banking portal) for this unit's functions. Phone, email, or agent-assisted chat channels alone do not constitute web application access." },
      { id: "FRE-047", text: "Does this assessment unit involve mobile application access?", criteria: "Yes if customers or employees use a native mobile app for this unit's functions." },
      { id: "FRE-048", text: "Does this assessment unit involve API or programmatic access?", criteria: "Yes if external systems connect to this unit's functions via APIs or automated integrations." },
      { id: "FRE-049", text: "Does this assessment unit rely on mobile devices for authentication (SMS, push, authenticator)?", criteria: "Yes if login or transaction approval depends on a customer's mobile phone (OTP, push notification)." },
      { id: "FRE-050", text: "Does this assessment unit process batch, scripted, or high-frequency automated transactions (e.g., via API or scheduled jobs)?", criteria: "Yes if transactions can be submitted programmatically or in bulk, not just individually by a human." },
      { id: "FRE-051", text: "Does this assessment unit involve session management (login sessions, timeouts)?", criteria: "Yes if users maintain authenticated sessions that can be hijacked, timed out, or replayed." },
    ],
  },
  {
    key: "communication", label: "Communication & Notification Exposures", Icon: Bell,
    questions: [
      { id: "FRE-052", text: "Does this assessment unit involve phone-based customer interaction?", criteria: "Yes if customers speak with agents or use IVR systems through this unit." },
      { id: "FRE-053", text: "Does this assessment unit involve email communication with customers?", criteria: "Yes if this unit sends or receives emails related to customer accounts or services." },
      { id: "FRE-054", text: "Does this assessment unit send account alerts or notifications?", criteria: "Yes if customers receive automated alerts (SMS, email, push) about account activity." },
      { id: "FRE-055", text: "Does this assessment unit allow customers to modify alert preferences?", criteria: "Yes if customers can change which alerts they receive, or how they receive them." },
      { id: "FRE-056", text: "Does this assessment unit involve customer callbacks or outbound contact?", criteria: "Yes if agents call customers proactively (verification callbacks, follow-ups, marketing)." },
    ],
  },
  {
    key: "employee_access", label: "Employee Access & Capability Exposures", Icon: UserCog,
    questions: [
      { id: "FRE-057", text: "Do employees have access to customer PII (name, SSN, DOB, address)?", criteria: "Yes if employees can view, search, or retrieve personally identifiable customer information." },
      { id: "FRE-058", text: "Do employees have access to customer financial data (balances, transactions)?", criteria: "Yes if employees can view account balances, transaction history, or statements." },
      { id: "FRE-059", text: "Do employees have the ability to view customer authentication credentials?", criteria: "Yes if employees own passwords, PINs, security answers, or token seed materials." },
      { id: "FRE-060", text: "Do employees have the ability to reset customer credentials?", criteria: "Yes if employees can reset passwords, PINs, or unlock accounts on behalf of customers." },
      { id: "FRE-061", text: "Do employees have the ability to modify customer account information?", criteria: "Yes if employees can change contact details, beneficiaries, or account settings on file." },
      { id: "FRE-062", text: "Do employees have the ability to initiate or approve transactions?", criteria: "Yes if employees can initiate, facilitate, or process fund transfers, payments, or credits on behalf of customers." },
      { id: "FRE-063", text: "Do employees have the ability to override limits, alerts, or controls?", criteria: "Yes if employees can bypass transaction limits, suppress fraud alerts, or override system controls." },
      { id: "FRE-064", text: "Do employees have the ability to issue credits, refunds, or adjustments?", criteria: "Yes if employees can post credits, fee waivers, or account adjustments." },
      { id: "FRE-065", text: "Do employees have the ability to waive fees?", criteria: "Yes if employees can reverse service charges, penalties, or late fees." },
      { id: "FRE-066", text: "Do employees have access to cash or physical assets?", criteria: "Yes if employees handle currency, cash drawers, vaults, or other tangible financial instruments." },
      { id: "FRE-067", text: "Do employees have the ability to create or modify system records without a maker-checker control?", criteria: "Yes if a single employee can both initiate and complete a transaction or record change with no secondary approval." },
      { id: "FRE-068", text: "Do employees have access to customer contact channels (phone, email, messaging) outside of supervised systems?", criteria: "Yes if employees can contact customers using personal devices or unsupervised channels." },
      { id: "FRE-069", text: "Do employees have access outside normal business hours?", criteria: "Yes if employees can log in or perform operations after hours, on weekends, or remotely." },
      { id: "FRE-070", text: "Do employees have the ability to bypass security controls?", criteria: "Yes if employees can disable, skip, or override fraud detection, authentication, or compliance controls." },
    ],
  },
  {
    key: "customer_behavior", label: "Customer Behavior & Manipulation Exposures", Icon: AlertOctagon,
    questions: [
      { id: "FRE-076", text: "Are customers of this assessment unit at risk of being contacted, deceived, or coerced by external fraudsters (e.g., via phone scams, phishing, or romance fraud)?", criteria: "Yes if customers interact through channels where external parties could reach and influence them." },
      { id: "FRE-077", text: "Could customers be coached or scripted by a third party while interacting with this assessment unit (e.g., during a phone call or in-branch visit)?", criteria: "Yes if there is a live interaction channel where a fraudster could simultaneously direct the customer." },
      { id: "FRE-078", text: "Does this assessment unit process transactions that are irrevocable or difficult to recover once completed (e.g., wire transfers, cryptocurrency, cash withdrawals)?", criteria: "Yes if funds leave the institution through channels with limited or no recall capability." },
      { id: "FRE-079", text: "Could customers intentionally misrepresent information for financial gain?", criteria: "Yes if customers could inflate income, falsify documents, or lie about their identity to obtain products." },
      { id: "FRE-080", text: "Could customers intentionally default on obligations?", criteria: "Yes if the unit extends credit, loans, or financial obligations that customers could take with no intent to repay (bust-out fraud). Units that only service accounts without extending credit do not have this exposure." },
      { id: "FRE-081", text: "Could customers file false claims or disputes?", criteria: "Yes if customers could fabricate unauthorized transaction claims or disputes to receive undeserved refunds." },
    ],
  },
];

const ALL_QUESTIONS = CATEGORIES.flatMap((c) => c.questions);
const TOTAL = ALL_QUESTIONS.length; // 96

type AnswerVal = "yes" | "no";
type FilterTab = "all" | "confident" | "yes" | "no";

interface QaData {
  answers?: Record<string, AnswerVal>;
  rationale?: Record<string, string>;
}
interface AssessmentData {
  questionnaire?: { qa?: QaData };
}

// ─────────────────────────────────────────────────────────────
// Chat panel
// ─────────────────────────────────────────────────────────────
interface ChatMsg { role: "user" | "ai"; text: string }

function ChatPanel({
  question, assessmentId, onClose,
}: {
  question: Question; assessmentId: string; onClose: () => void;
}) {
  const [messages, setMessages] = useState<ChatMsg[]>([]);
  const [input, setInput] = useState("");
  const [streaming, setStreaming] = useState(false);
  const bottomRef = useRef<HTMLDivElement>(null);
  const sessionId = `${assessmentId}-qa-${question.id}`;

  // Pre-fill context message on open
  useEffect(() => {
    setMessages([{
      role: "ai",
      text: `I'm here to help you answer **${question.id}**: "${question.text}"\n\n**Criteria:** ${question.criteria}\n\nAsk me anything about this question or how it applies to this assessment unit.`,
    }]);
    setInput("");
  }, [question.id]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  async function sendMessage() {
    const text = input.trim();
    if (!text || streaming) return;
    setInput("");
    setMessages((m) => [...m, { role: "user", text }]);
    setStreaming(true);

    const contextMsg = `Context — Question ${question.id}: "${question.text}". Criteria: "${question.criteria}". User asks: ${text}`;
    let aiText = "";
    setMessages((m) => [...m, { role: "ai", text: "" }]);

    try {
      const res = await fetch("/api/v1/chat", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ session_id: sessionId, message: contextMsg, assessment_id: assessmentId }),
      });
      const reader = res.body?.getReader();
      const decoder = new TextDecoder();
      while (reader) {
        const { done, value } = await reader.read();
        if (done) break;
        const lines = decoder.decode(value).split("\n");
        for (const line of lines) {
          if (!line.startsWith("data:")) continue;
          const payload = JSON.parse(line.slice(5).trim());
          if (payload.type === "chat:token") {
            aiText += payload.token;
            setMessages((m) => [...m.slice(0, -1), { role: "ai", text: aiText }]);
          }
          if (payload.type === "chat:done" || payload.type === "chat:error") break;
        }
      }
    } catch (e) {
      setMessages((m) => [...m.slice(0, -1), { role: "ai", text: "Sorry, I couldn't reach the AI. Please try again." }]);
    } finally {
      setStreaming(false);
    }
  }

  return (
    <div className={styles.qaChat}>
      <div className={styles.qaChatHeader}>
        <div>
          <div className={styles.qaChatTitle}>AI Assistant</div>
          <div className={styles.qaChatSubtitle}>{question.id} · {question.text.slice(0, 60)}…</div>
        </div>
        <button type="button" className={styles.qaChatClose} onClick={onClose}><X size={16} /></button>
      </div>

      <div className={styles.qaChatMessages}>
        {messages.map((m, i) => (
          <div key={i} className={clsx(styles.qaChatBubble, m.role === "user" ? styles.qaChatUser : styles.qaChatAi)}>
            {m.role === "ai" && (
              <span className={styles.qaChatAiIcon}><Sparkles size={12} /></span>
            )}
            <span className={styles.qaChatBubbleText}>{m.text || "…"}</span>
          </div>
        ))}
        <div ref={bottomRef} />
      </div>

      <div className={styles.qaChatInputRow}>
        <input
          className={styles.qaChatInput}
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); sendMessage(); } }}
          placeholder="Ask a follow-up question…"
          disabled={streaming}
        />
        <button
          type="button"
          className={styles.qaChatSend}
          onClick={sendMessage}
          disabled={!input.trim() || streaming}
        >
          <Send size={14} />
        </button>
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────
// Main component
// ─────────────────────────────────────────────────────────────
export function StepQuestionnaire({ assessmentId, onValidChange }: StepProps) {
  const qc = useQueryClient();

  const { data } = useQuery<AssessmentData>({
    queryKey: ["assessment", assessmentId],
    queryFn: () => api.get(`/api/v1/assessments/${assessmentId}`).then((r) => r.json()),
  });

  const [answers,   setAnswers]   = useState<Record<string, AnswerVal>>({});
  const [rationale, setRationale] = useState<Record<string, string>>({});
  const [openCats,  setOpenCats]  = useState<Set<string>>(new Set([CATEGORIES[0].key]));
  const [filter,    setFilter]    = useState<FilterTab>("all");
  const [chatQ,     setChatQ]     = useState<Question | null>(null);

  // Hydrate from saved questionnaire
  useEffect(() => {
    const qa = data?.questionnaire?.qa;
    if (qa) {
      if (qa.answers)   setAnswers(qa.answers);
      if (qa.rationale) setRationale(qa.rationale);
    }
  }, [data]);

  const answeredCount = Object.keys(answers).length;
  const yesCount      = Object.values(answers).filter((a) => a === "yes").length;
  const noCount       = Object.values(answers).filter((a) => a === "no").length;

  useEffect(() => {
    onValidChange(answeredCount > 0);
  }, [answeredCount, onValidChange]);

  const saveQa = useMutation({
    mutationFn: (qa: QaData) =>
      api.patch(`/api/v1/assessments/${assessmentId}`, {
        questionnaire: { ...(data?.questionnaire ?? {}), qa },
      }).then((r) => r.json()),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["assessment", assessmentId] }),
  });

  const setAnswer = useCallback((qId: string, val: AnswerVal) => {
    setAnswers((prev) => {
      const next = { ...prev, [qId]: val };
      saveQa.mutate({ answers: next, rationale });
      return next;
    });
  }, [rationale, saveQa]); // eslint-disable-line react-hooks/exhaustive-deps

  function toggleCat(key: string) {
    setOpenCats((s) => {
      const n = new Set(s);
      n.has(key) ? n.delete(key) : n.add(key);
      return n;
    });
  }

  function expandAll() {
    setOpenCats(new Set(CATEGORIES.map((c) => c.key)));
  }

  function handleRerunQa() {
    // Future: call AI to re-analyse document and auto-answer questions
    // For now: reset and open first category
    setOpenCats(new Set([CATEGORIES[0].key]));
  }

  // Filter logic
  function shouldShowQuestion(qId: string): boolean {
    if (filter === "all")       return true;
    if (filter === "confident") return !!answers[qId];
    if (filter === "yes")       return answers[qId] === "yes";
    if (filter === "no")        return answers[qId] === "no";
    return true;
  }

  return (
    <div className={styles.step}>
      <div className={styles.stepHeader}>
        <h2 className={styles.stepTitle}>Step 2: Questionnaire</h2>
        <p className={styles.stepDesc}>
          AU-specific diagnostic — review and answer each question to determine which fraud risks apply.
        </p>
      </div>

      {/* ── QA Review card ── */}
      <div className={styles.card}>
        {/* Header row */}
        <div className={styles.qaReviewHeader}>
          <div>
            <span className={styles.qaReviewTitle}>Document QA Review</span>
            <span className={styles.qaReviewMeta}>
              {answeredCount} / {TOTAL} questions answered
              · Determines which fraud risks apply — does not affect ratings
            </span>
          </div>
          <div style={{ display: "flex", gap: "0.5rem" }}>
            <button type="button" className={styles.qaExpandBtn} onClick={expandAll}>
              Expand All
            </button>
            <button type="button" className={styles.qaRerunBtn} onClick={handleRerunQa}>
              <RefreshCw size={12} /> Re-run QA
            </button>
          </div>
        </div>

        {/* Filter tabs */}
        <div className={styles.qaTabBar}>
          {(["all", "confident", "yes", "no"] as FilterTab[]).map((f) => {
            const count = f === "all" ? TOTAL : f === "confident" ? answeredCount : f === "yes" ? yesCount : noCount;
            return (
              <button
                key={f}
                type="button"
                className={clsx(styles.qaTabBtn, filter === f && styles.qaTabBtnActive)}
                onClick={() => setFilter(f)}
              >
                <span className={styles.qaTabCount}>{count}</span>
                <span className={styles.qaTabLabel}>{f}</span>
              </button>
            );
          })}
        </div>

        {/* Category accordions */}
        <div className={styles.qaAccordions}>
          {CATEGORIES.map(({ key, label, Icon, questions }) => {
            const visibleQs = questions.filter((q) => shouldShowQuestion(q.id));
            if (filter !== "all" && visibleQs.length === 0) return null;
            const isOpen    = openCats.has(key);
            const answered  = questions.filter((q) => answers[q.id]).length;
            return (
              <div key={key} className={styles.qaAccordion}>
                <button
                  type="button"
                  className={styles.qaAccordionHead}
                  onClick={() => toggleCat(key)}
                >
                  <Icon size={15} strokeWidth={1.8} className={styles.qaAccordionIcon} />
                  <span className={styles.qaAccordionLabel}>{label}</span>
                  <span className={styles.qaAccordionCount}>({filter === "all" ? questions.length : visibleQs.length})</span>
                  {answered > 0 && answered === questions.length && (
                    <span className={styles.qaAccordionDone}>✓</span>
                  )}
                  {isOpen ? <ChevronDown size={14} className={styles.qaChevron} /> : <ChevronRight size={14} className={styles.qaChevron} />}
                </button>

                {isOpen && (
                  <div className={styles.qaAccordionBody}>
                    {(filter === "all" ? questions : visibleQs).map((q) => (
                      <QuestionCard
                        key={q.id}
                        q={q}
                        answer={answers[q.id]}
                        rationaleText={rationale[q.id] ?? ""}
                        onAnswer={setAnswer}
                        onSparkle={() => setChatQ(q)}
                      />
                    ))}
                  </div>
                )}
              </div>
            );
          })}
        </div>

        <p className={styles.qaFooterHint}>Review the answers above, then confirm to proceed.</p>
      </div>

      {/* ── Slide-in Chat panel ── */}
      {chatQ && (
        <>
          <div className={styles.qaChatOverlay} onClick={() => setChatQ(null)} />
          <ChatPanel question={chatQ} assessmentId={assessmentId} onClose={() => setChatQ(null)} />
        </>
      )}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────
// Question card
// ─────────────────────────────────────────────────────────────
function QuestionCard({
  q, answer, rationaleText, onAnswer, onSparkle,
}: {
  q: Question;
  answer: AnswerVal | undefined;
  rationaleText: string;
  onAnswer: (id: string, val: AnswerVal) => void;
  onSparkle: () => void;
}) {
  return (
    <div className={styles.qaQCard}>
      <div className={styles.qaQCardTop}>
        {/* Left: id + question + criteria */}
        <div className={styles.qaQCardLeft}>
          <span className={styles.qaQId}>{q.id}</span>
          <p className={styles.qaQText}>{q.text}</p>
          <p className={styles.qaQCriteria}>{q.criteria}</p>
        </div>

        {/* Right: toggle + badge */}
        <div className={styles.qaQCardRight}>
          <div className={styles.qaToggleRow}>
            <span className={clsx(styles.qaToggleLabel, answer === "no" && styles.qaToggleLabelActive)}>No</span>
            <button
              type="button"
              role="switch"
              aria-checked={answer === "yes"}
              className={clsx(styles.qaToggleTrack, answer === "yes" && styles.qaToggleTrackOn)}
              onClick={() => onAnswer(q.id, answer === "yes" ? "no" : "yes")}
            >
              <span className={styles.qaToggleThumb} />
            </button>
            <span className={clsx(styles.qaToggleLabel, answer === "yes" && styles.qaToggleLabelActive)}>Yes</span>
          </div>
          {answer && (
            <span className={styles.qaConfidentBadge}>✓ Confident</span>
          )}
        </div>
      </div>

      {/* AI sparkle row */}
      <div className={styles.qaSparkleRow}>
        <button
          type="button"
          className={styles.qaSparkleBtn}
          onClick={onSparkle}
          title="Ask AI about this question"
        >
          <Sparkles size={13} strokeWidth={1.8} />
        </button>
        <div className={styles.qaRationaleBox}>
          {rationaleText
            ? `"${rationaleText}"`
            : <span className={styles.qaRationalePlaceholder}>Click to ask AI for guidance on this question</span>}
        </div>
      </div>
    </div>
  );
}
