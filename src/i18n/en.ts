// English translation table.
// All keys live in this single registry. Components call t("foo") — never inline strings.

export const en = {
  app: {
    name: "THALAMUS",
    tagline: "Understands your business, then assembles the AI that runs it."
  },
  nav: {
    overview: "Overview",
    ask: "Ask Thalamus",
    brain: "Business Brain",
    insights: "Insights",
    agents: "Agents",
    approvals: "Approvals",
    activity: "Activity",
    integrations: "Integrations",
    settings: "Settings"
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
    title: "Ask Thalamus",
    placeholder: "Ask anything about your business…",
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
    title: "Business Brain",
    subtitle: "What THALAMUS has understood about your business.",
    legend: "Legend",
    filter: "Filter",
    entity: {
      product: "Product",
      customer: "Customer",
      supplier: "Supplier",
      policy: "Policy",
      workflow: "Workflow",
      goal: "Goal",
      risk: "Risk"
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
    subtitle: "The seven agents assembled for your business.",
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
    subtitle: "Where THALAMUS pulls your business signal from.",
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
    edit: "Edit"
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
    city: "City"
  },
  tour: {
    restart: "Restart product tour",
    next: "Next",
    back: "Back",
    skip: "Skip",
    done: "Done",
    stepOf: "Step {n} of {total}",
    steps: {
      overviewKpis: { title: "Overview at a glance", body: "Revenue, active customers and inventory health — all derived from the live dataset, not hardcoded numbers." },
      overviewImportant: { title: "Important today", body: "Top insights by risk and confidence. Click any row to jump into the insight." },
      overviewActions: { title: "Recommended actions", body: "Pending approvals surfaced here. Approve or reject inline; the rest of the app updates instantly." },
      ask: { title: "Ask in Bangla or English", body: "Every answer carries evidence. Bangla questions get Bangla answers." },
      brain: { title: "Business Brain", body: "A graph of what THALUS has understood about your business. Hover to inspect, click for the full record." },
      insights: { title: "Insights pipeline", body: "Each insight walks the stages. Filter by agent or risk." },
      agents: { title: "Workforce constellation", body: "The seven agents orbit the Business Brain. Run any agent from the side panel." },
      approvals: { title: "Approvals with risk tiers", body: "High-risk actions wait here. Approve, reject with a reason, or use the keyboard: a, r, j, k." },
      activity: { title: "Audit log", body: "Every decision lands here. Nothing happens off the record." },
      integrations: { title: "Sources", body: "Connect Sheets, Shopify, WhatsApp, CSV. Demo mode lets you walk every flow without a real account." },
      settings: { title: "Settings", body: "Per-agent autonomy, risk thresholds, language and theme." },
      search: { title: "Search everything", body: "⌘K / Ctrl+K finds products, insights, settings fields — with deep links and a highlight on the target." }
    }
  },
  onboarding: {
    welcome: {
      eyebrow: "THALAMUS",
      headline: "THALAMUS understands your business, then assembles the AI that runs it.",
      cta: "Start"
    },
    profile: {
      title: "Tell us about your business",
      subtitle: "These answers seed the Business Brain and come back to you by name.",
      industry: "Industry",
      industryPlaceholder: "e.g. Fashion retail, FMCG, Electronics",
      whatYouSell: "What do you sell?",
      whatYouSellPlaceholder: "Two or three sentences about your products and price range.",
      customers: "Who are your customers?",
      customersPlaceholder: "Where they live, how they buy, what they care about.",
      goals: "Top goals (pick up to three)",
      goalOptions: [
        "Grow repeat purchases",
        "Reduce stockouts",
        "Cut slow-moving inventory",
        "Improve customer response time",
        "Cut marketing waste",
        "Expand to new channels",
        "Improve cashflow visibility"
      ],
      cta: "Continue"
    },
    connect: {
      title: "Connect your business",
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
      title: "Understanding your business",
      subtitle: "Seven derivation steps, all run against your data.",
      steps: {
        products: "Products identified",
        customers: "Customers identified",
        salesPatterns: "Sales patterns identified",
        inventory: "Inventory structure identified",
        goals: "Goals identified",
        policies: "Policies identified",
        graph: "Knowledge graph construction"
      }
    },
    ready: {
      title: "Your Business Brain is ready",
      lineEn: "{products} products, {customers} customers and {goals} goals identified for {business}.",
      cta: "Open Business Brain"
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
      product: "Product",
      customer: "Customer",
      supplier: "Supplier",
      policy: "Policy",
      workflow: "Workflow",
      goal: "Goal",
      risk: "Risk",
      integration: "Integration",
      setting: "Setting"
    }
  }
} as const;

/** Shape of every translation table. Keys mirror `en`; values are opaque strings. */
export type Dict = { [k: string]: any };