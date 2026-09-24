// English translation table.
// All keys live in this single registry. Components call t("foo") — never inline strings.

export const en = {
  app: {
    name: "BunonBrain",
    tagline: "The operations layer for a mid-tier Bangladeshi garment plant.",
    factoryProfile: "Demo plant — mid-tier BD RMG",
    simulatedBadge: "Simulated data"
  },
  nav: {
    overview: "Overview",
    ask: "Ask BunonBrain",
    brain: "Factory Brain",
    insights: "Insights",
    agents: "Agents",
    approvals: "Approvals",
    activity: "Activity",
    integrations: "Integrations",
    settings: "Settings",
    vision: "Vision repair"
  },
  sidebar: {
    overview: "OVERVIEW",
    ask: "ASK",
    intelligence: "INTELLIGENCE",
    control: "CONTROL",
    system: "SYSTEM",
    unread: "{n} pending"
  },
  overview: {
    greetingMorning: "Good morning, {name}.",
    greetingAfternoon: "Good afternoon, {name}.",
    greetingEvening: "Good evening, {name}.",
    businessHealth: "Business health",
    revenue: "Revenue (30d)",
    customers: "Active customers",
    inventory: "Inventory health",
    trend: "30d trend",
    importantToday: "Important today",
    recommendedActions: "Recommended actions",
    recentActivity: "Recent activity",
    noActivity: "No activity yet.",
    nudgeConnect: "Connect more sources",
    nudgeConnectBody: "You're under 3 integrations. New agents unlock as you connect.",
    nothingImportant: "Nothing pinned yet."
  },
  ask: {
    title: "Ask BunonBrain",
    placeholder: "Ask anything about your factory…",
    placeholderBn: "বাংলায় লিখুন অথবা ইংরেজি — যেটা আপনার সুবিধা।",
    submit: "Ask",
    suggestions: "Try one of these",
    newQuestion: "Ask another question",
    analyzed: "Analyzed",
    finding: "Finding",
    factors: "Contributing factors",
    evidence: "Evidence",
    recommendedAction: "Recommended action",
    execute: "Execute",
    reviewFirst: "Review first",
    saveToInsights: "Save to Insights",
    streamingThinking: "Thinking…",
    scopeLabel: "Scope",
    scopeAll: "All data",
    sendLabel: "Send question",
    copy: "Copy answer",
    copied: "Copied",
    regenerate: "Regenerate",
    history: "Recent questions",
    noHistory: "No previous questions yet.",
    demoMode: "Demo mode",
    liveMode: "Live model"
  },
  brain: {
    title: "Factory Brain",
    subtitle: "What BunonBrain has understood about your production floor.",
    legend: "Legend",
    filter: "Filter",
    entity: {
      product: "Order",
      customer: "Buyer",
      supplier: "Supplier",
      policy: "Compliance",
      workflow: "Process",
      goal: "Target",
      risk: "Risk",
      line: "Line",
      machine: "Machine",
      order: "Order",
      buyer: "Buyer",
      process: "Process",
      target: "Target",
      compliance: "Compliance"
    },
    status: {
      healthy: "Healthy",
      at_risk: "At risk",
      down: "Down"
    },
    edgeKind: {
      assigned_to: "Assigned to",
      contains: "Contains",
      follows: "Follows",
      has: "Has",
      threatens: "Threatens",
      sourced_from: "Sourced from",
      shipped_to: "Shipped to"
    },
    detailTitle: "Detail",
    neighbors: "Connected",
    viewSources: "View source records",
    searchPlaceholder: "Find a node…",
    fit: "Fit to screen",
    zoomIn: "Zoom in",
    zoomOut: "Zoom out",
    isolate: "Isolate neighbourhood",
    clearFocus: "Clear focus",
    connections: "connections",
    facts: "Key facts"
  },
  insights: {
    title: "Insights",
    filterByAgent: "Agent",
    filterByRisk: "Risk",
    filterByDate: "Date",
    stages: {
      suggested: "Suggested",
      pending_approval: "Pending approval",
      executing: "Executing",
      done: "Done",
      logged: "Logged to evidence store",
      rejected: "Rejected",
      failed: "Failed"
    },
    empty: "No insights in this stage yet.",
    showEvidence: "Show evidence"
  },
  agents: {
    title: "Workforce",
    subtitle: "The three agents assembled for your factory by BunonBrain.",
    detail: {
      purpose: "Purpose",
      contextSlices: "Context slices read",
      riskTier: "Risk tier",
      model: "Model",
      status: "Status",
      tasksToday: "Tasks today",
      recentActivity: "Recent activity",
      goToActivity: "Open in activity",
      runNow: "Run now",
      running: "Running",
      lastRun: "Last run",
      autonomy: "Autonomy"
    },
    riskNote: {
      auto: "Auto-execute",
      approval: "Approval required",
      perPolicy: "Per policy"
    },
    autonomy: {
      auto: "Auto-execute",
      approval: "Approval required",
      paused: "Paused"
    },
    runResult: "Run complete. Insight logged to the pipeline."
  },
  approvals: {
    title: "Approvals",
    subtitle: "High-risk actions awaiting your decision.",
    empty: "Nothing waiting on you.",
    emptyToday: "You've cleared everything pending today.",
    approve: "Approve",
    reject: "Reject",
    viewDetails: "View details",
    reasoning: "Reasoning",
    evidenceCount: "{n} sources",
    rejectedReason: "Rejection reason",
    approvedToast: "Approved",
    rejectedToast: "Rejected",
    undo: "Undo",
    bulkApproveLow: "Approve all low risk",
    filterAgent: "Agent",
    filterRisk: "Risk",
    filterStatus: "Status",
    sortRisk: "Sort by risk",
    sortRecency: "Sort by recency",
    selectAll: "Select all"
  },
  activity: {
    title: "Activity",
    subtitle: "Every action, decision, and context update.",
    empty: "No activity yet.",
    actor: "Actor"
  },
  integrations: {
    title: "Integrations",
    subtitle: "Where BunonBrain pulls your factory signal from.",
    lastSync: "Last sync",
    syncNow: "Sync now",
    connect: "Connect",
    connected: "Connected",
    available: "Available",
    objectTypes: "Object types",
    disconnect: "Disconnect",
    disconnectConfirm: "Disconnect this source? Any records pulled from it will stop counting until you reconnect.",
    records: "records",
    syncFailed: "Sync failed. Try again.",
    syncSuccess: "Synced.",
    empty: "Nothing connected yet.",
    emptyCta: "Connect a source",
    edit: "Edit",
    simulated: "Simulated",
    simulatedTip: "This feed is synthetic. Patterns are calibrated to NASA C-MAPSS, Kaggle Bosch, and UCI SECOM public datasets. A real pilot needs a hardware partner."
  },
  connect: {
    fields: {
      sheetsUrl: "Google Sheets URL",
      shopifyDomain: "Shopify store domain",
      shopifyToken: "Access token (demo)",
      whatsappPhone: "WhatsApp business number",
      whatsappCountry: "Country code",
      facebookUrl: "Facebook page URL",
      instagramHandle: "Instagram handle",
      csvFile: "Upload CSV / Excel",
      csvDrive: "or paste a Drive link",
      documentsFolder: "Drive folder link"
    },
    errors: {
      url: "Please enter a valid URL.",
      handle: "Handles start with @ and use letters, numbers, dot or underscore.",
      phone: "Please enter a valid phone number with country code.",
      domain: "Domain should look like yourshop.myshopify.com",
      required: "This field is required."
    },
    skip: "Skip for now",
    useDemo: "Use demo data",
    connected: "Connected",
    masked: "Connected · tap Edit to change"
  },
  settings: {
    title: "Settings",
    subtitle: "Language, business profile, autonomy and risk thresholds.",
    language: "Language",
    businessProfile: "Business profile",
    industry: "Industry",
    whatYouSell: "What you sell",
    customers: "Your customers",
    goals: "Top goals",
    risk: "Risk policy",
    inventoryOrderThreshold: "Inventory order-size threshold (BDT)",
    resetDemo: "Reset demo",
    resetConfirm: "Reset everything and return to onboarding?",
    save: "Save changes",
    saved: "Saved",
    appearance: "Appearance",
    theme: "Theme",
    themeLight: "Light",
    themeDark: "Dark",
    themeSystem: "System",
    numberFormat: "Number format",
    dateFormat: "Date format",
    density: "Density",
    densityComfortable: "Comfortable",
    densityCompact: "Compact",
    currency: "Currency",
    timezone: "Timezone",
    fiscalMonthStart: "Fiscal month starts",
    autonomy: "Agents & autonomy",
    perAgentMode: "Per-agent execution",
    perAgentModel: "Per-agent model",
    globalPause: "Pause all agents",
    thresholds: "Risk thresholds",
    thresholdOrderValue: "Order value (BDT)",
    thresholdDiscount: "Discount (%)",
    thresholdInventorySpend: "Inventory spend (BDT)",
    thresholdMessageVolume: "Outbound messages",
    approvalGate: "Require approval at",
    autoApproveBelow: "Auto-approve below",
    notifications: "Notifications",
    channelInApp: "In-app",
    channelEmail: "Email",
    channelWhatsapp: "WhatsApp",
    digestTime: "Daily digest time",
    dataSources: "Data sources",
    dataSourcesBody: "Manage integrations from a single view.",
    openIntegrations: "Open Integrations",
    advanced: "Advanced",
    restartTour: "Restart product tour",
    exportConfig: "Export configuration",
    importConfig: "Import configuration",
    businessName: "Business name",
    city: "City",
    factoryName: "Factory name",
    experimental: "Experimental features",
    feature: {
      visionRepair: "Vision-to-repair instruction",
      whatsappAlert: "WhatsApp-style alert view"
    },
    featureBody: {
      visionRepair: "Upload a defect photo and get a short repair instruction in Bangla + English. Uses the same LLM plumbing.",
      whatsappAlert: "Show alert events in a WhatsApp chat-bubble stream inside Activity."
    },
    simulatedData: "Simulated data badge on sensor feeds",
    llmPanel: "LLM / Live Ask",
    llmPanelBody: "Connect a provider so Ask BunonBrain and the agents can call a live model. Without a key, every answer runs in demo mode.",
    llmProvider: "Provider",
    llmProviderHint: "Preferred: OpenAI (platform.openai.com)",
    llmProviderOpenai: "OpenAI",
    llmProviderGemini: "Google Gemini",
    llmProviderAnthropic: "Anthropic",
    llmApiKey: "API key",
    llmApiKeyPlaceholder: "Paste API key",
    llmApiKeyHint: "Server-only. Never stored in your browser, Zustand, cookies, or the URL.",
    llmKeySaved: "Key saved",
    llmKeySavedMasked: "••••••••••••••••  Key saved",
    llmKeyNotSet: "No key yet",
    llmKeyNotSetHint: "Demo mode is on until you save a key.",
    llmModel: "Model (optional)",
    llmModelHint: "OpenAI hint: gpt-6-luna",
    llmSave: "Save LLM settings",
    llmClearing: "Clearing…",
    llmClear: "Clear key",
    llmClearConfirmTitle: "Clear saved API key?",
    llmClearConfirmBody: "Ask BunonBrain and the agents will go back to demo mode until you save a new key. The key is removed from .env.local on this machine.",
    llmClearConfirmCta: "Yes, clear key",
    llmClearCancel: "Keep key",
    llmSavedToast: "LLM settings saved",
    llmClearedToast: "API key cleared",
    llmDemoChip: "Demo mode",
    llmLiveChip: "Live mode",
    llmProviderPersistence: "Source",
    llmPersistenceEnvLocal: "Saved to .env.local",
    llmPersistenceProcess: "This process only",
    llmPersistenceVercel: "Vercel project env",
    llmSecurityTitle: "How your key is handled",
    llmSecurityBody: "Your key is sent only to this app's server and stored in .env.local during development. It is never echoed back, never saved to localStorage or cookies, and never logged. In production, set it in your Vercel project environment."
  },
  tour: {
    restart: "Restart product tour",
    next: "Next",
    back: "Back",
    skip: "Skip",
    done: "Done",
    stepOf: "Step {n} of {total}",
    steps: {
      overviewKpis: { title: "Overview at a glance", body: "Line efficiency, active orders and machine health — all derived from the live dataset, not hardcoded numbers." },
      overviewImportant: { title: "Important today", body: "Top insights by risk and confidence. Click any row to jump into the insight." },
      overviewActions: { title: "Recommended actions", body: "Pending approvals surfaced here. Approve or reject inline; the rest of the app updates instantly." },
      ask: { title: "Ask in Bangla or English", body: "Every answer carries evidence. Bangla questions get Bangla answers." },
      brain: { title: "Factory Brain", body: "A graph of what Factory Brain has understood about your floor. Hover to inspect, click for the full record." },
      insights: { title: "Insights pipeline", body: "Each insight walks the stages. Filter by agent or risk." },
      agents: { title: "Workforce constellation", body: "The three agents orbit the Factory Brain. Run any agent from the side panel." },
      approvals: { title: "Approvals with risk tiers", body: "High-risk actions wait here. Approve, reject with a reason, or use the keyboard: a, r, j, k." },
      activity: { title: "Audit log", body: "Every decision lands here. Nothing happens off the record." },
      integrations: { title: "Sources", body: "Connect sensors, ERP, WhatsApp, CSV. Demo mode lets you walk every flow without a real account." },
      settings: { title: "Settings", body: "Per-agent autonomy, risk thresholds, language and theme." },
      search: { title: "Search everything", body: "⌘K / Ctrl+K finds orders, insights, settings fields — with deep links and a highlight on the target." }
    }
  },
  landing: {
    eyebrow: "Factory Brain · mid-tier BD RMG",
    headlineLead: "Factory Brain understands your floor,",
    headlineAccent: "then runs it for you.",
    subhead: "BunonBrain is the operations layer for a mid-tier Bangladeshi garment plant. Connect your sensor feeds, watch the Factory Brain graph form, then ask the floor in Bangla or English. Every answer carries evidence. Every high-risk action waits for your sign-off.",
    ctaPrimary: "Enter demo",
    ctaPrimaryHint: "Skip onboarding, jump straight into the live demo plant.",
    ctaSecondary: "Tour in 2 min",
    ctaSecondaryHint: "Walk the guided product tour first.",
    badge: "Demo · simulated data, calibrated against public datasets",
    valueProps: {
      liveLine: {
        title: "Live line board",
        body: "Efficiency, defect rate and WIP roll up line by line. The dashboard updates as the simulated floor ticks — no refresh needed."
      },
      alerts: {
        title: "Bottleneck & floor alerts",
        body: "Maintenance, line-throughput and manager agents surface the bottleneck, the failing machine, and the order at risk — before your floor manager sees it on paper."
      },
      bangla: {
        title: "Ask in Bangla, answer in Bangla",
        body: "Type \"লাইন ৩ এর efficiency কত?\" and get a Bangla finding with the same evidence the English answer carries. Manual pages, sensor data and policies are all in scope."
      }
    },
    socialProof: {
      kicker: "Built for mid-tier RMG",
      body: "Designed around a 30-line knit plant in the BD-RMG profile: woven and knit lines, one cutting section, three finishing sections, ~3,000 workers. No Fortune-500 dashboards — no fake logos either.",
      pillars: [
        "Woven, knit & denim lines",
        "BDT currency · 12-hour shifts",
        "Bangla + English operations",
        "Manual-corpus grounded answers"
      ]
    },
    howItWorks: {
      kicker: "How it fits your floor",
      steps: [
        "Connect · Ingest sensor feeds, ERP exports, manual PDFs and the daily WhatsApp queue. Demo mode simulates every source so the rest of the app stays honest.",
        "Understand · The Factory Brain builds a graph of lines, machines, orders and suppliers. Every insight cites the records it came from.",
        "Act · Ask in Bangla, route to the right agent, approve the high-risk items. Every decision lands in the activity log."
      ]
    },
    honesty: {
      kicker: "Honest defaults",
      body: "Demo data is clearly labelled simulated, calibrated against public datasets. The LLM key is server-only — the key never enters your browser, Zustand, cookies, or the URL."
    },
    footer: {
      tagline: "BunonBrain — Factory Brain for mid-tier BD RMG plants.",
      cta: "Enter demo",
      secondary: "Take the 2-min tour"
    }
  },
  onboarding: {
    welcome: {
      eyebrow: "BUNONBRAIN",
      headline: "BunonBrain reads your BD RMG floor, then assembles the agents that run it.",
      cta: "Start"
    },
    profile: {
      title: "Tell us about your factory",
      subtitle: "These answers seed BunonBrain for the demo plant and come back to you by name.",
      industry: "Industry",
      industryPlaceholder: "e.g. RMG, knit, woven, denim",
      whatYouSell: "What do you produce?",
      whatYouSellPlaceholder: "Two or three sentences about your lines, SKUs and lead times.",
      customers: "Who are your buyers?",
      customersPlaceholder: "Which brands, what regions, what MOQs.",
      goals: "Top goals (pick up to three)",
      goalOptions: [
        "Improve line efficiency",
        "Reduce machine downtime",
        "Cut fabric waste",
        "Hit on-time shipment rate",
        "Reduce energy cost per piece",
        "Pass buyer compliance audits",
        "Improve worker safety"
      ],
      cta: "Continue"
    },
    connect: {
      title: "Connect your factory",
      subtitle: "Demo connections below. No real third-party account is needed.",
      sources: {
        sheets: "Google Sheets",
        shopify: "Shopify",
        whatsapp: "WhatsApp",
        facebook: "Facebook",
        instagram: "Instagram",
        csv: "CSV / Excel",
        documents: "Documents"
      },
      cta: "Continue",
      needOne: "Connect at least one source to continue."
    },
    understanding: {
      title: "Understanding your factory",
      subtitle: "Seven derivation steps, all run against your data.",
      steps: {
        lines: "Lines identified",
        machines: "Machines identified",
        orders: "Orders identified",
        buyers: "Buyers identified",
        suppliers: "Suppliers identified",
        compliance: "Compliance docs identified",
        graph: "Knowledge graph construction"
      }
    },
    ready: {
      title: "Your Factory Brain is ready",
      lineEn: "{products} lines, {customers} buyers and {goals} targets identified for {business}.",
      cta: "Open Factory Brain"
    }
  },
  risk: {
    low: "Low",
    medium: "Medium",
    high: "High"
  },
  common: {
    yes: "Yes",
    no: "No",
    cancel: "Cancel",
    confirm: "Confirm",
    search: "Search",
    loading: "Loading…",
    comingSoon: "Coming soon",
    backToActivity: "Back to activity",
    banglaHint: "আপনি বাংলায় লিখতে পারেন।",
    searchHint: "Try a product name, insight title or setting",
    noResults: "Nothing matched.",
    noResultsHint: "Search across agents, insights, products, customers, suppliers, policies, integrations and settings.",
    recent: "Recent",
    suggestedQueries: "Suggested searches"
  },
  search: {
    types: {
      page: "Page",
      agent: "Agent",
      insight: "Insight",
      approval: "Approval",
      activity: "Activity",
      product: "Order",
      customer: "Buyer",
      supplier: "Supplier",
      policy: "Compliance",
      workflow: "Process",
      goal: "Target",
      risk: "Risk",
      line: "Line",
      machine: "Machine",
      integration: "Integration",
      setting: "Setting"
    }
  },
  topbar: {
    factory: "Factory",
    scope: "scope",
    lines: "{n} lines"
  },
  whatsapp: {
    alert: {
      title: "Supervisor alerts",
      subtitle: "Streaming from the synthetic factory floor.",
      empty: "No alerts right now."
    }
  },
  vision: {
    title: "Vision-to-repair",
    body: "Upload a defect photo to get a short repair instruction in Bangla + English. Demo data only.",
    upload: "Upload a defect photo",
    choose: "Choose one of the staged images",
    resultEn: "Repair instruction (English)",
    resultBn: "Repair instruction (Bangla)",
    repairTitle: "Repair instruction",
    none: "No image selected yet."
  },
  factory: {
    labels: {
      line: "Line",
      machine: "Machine",
      process: "Process",
      target: "Target",
      order: "Order",
      buyer: "Buyer",
      supplier: "Supplier",
      compliance: "Compliance",
      risk: "Risk"
    }
  }
} as const;

/** Shape of every translation table. Keys mirror `en`; values are opaque strings. */
export type Dict = { [k: string]: any };