import express from "express";
import path from "path";
import { createServer as createViteServer } from "vite";
import { GoogleGenAI, Type } from "@google/genai";
import dotenv from "dotenv";
import { 
  SLAConfig, 
  SupportCase, 
  AuditLog, 
  TransitionRecord, 
  CaseTransition, 
  SmartInsights 
} from "./src/types";

dotenv.config();

const app = express();
const PORT = 3000;

// Body parsing with safe limit for larger CRM exports
app.use(express.json({ limit: "25mb" }));
app.use(express.urlencoded({ extended: true, limit: "25mb" }));

// In-memory data store for the session imports, configs, and system logs
let currentSLAConfig: SLAConfig = {
  targetHours: 24,
  useBusinessHours: true,
  businessStart: "09:00",
  businessEnd: "18:00",
  excludeWeekends: true,
  holidays: ["2026-01-01", "2026-05-25", "2026-07-04", "2026-11-26", "2026-12-25"],
};

let auditLogs: AuditLog[] = [
  {
    id: "LOG-001",
    timestamp: new Date(Date.now() - 3600000 * 4).toISOString(),
    action: "SYSTEM_BOOT",
    user: "System Core",
    role: "Operations",
    details: "CX Escalation Matrix service loaded. Standard business rules applied.",
  },
  {
    id: "LOG-002",
    timestamp: new Date(Date.now() - 3600000 * 3).toISOString(),
    action: "SEED_DATA_LOAD",
    user: "Seemab.Haider00@gmail.com",
    role: "Leadership",
    details: "Pre-populated Enterprise CX audit logs (120+ transitions) loaded successfully.",
  }
];

// Rich, high-fidelity default seed data representing common CRM support case audit logs
let rawUploadedRecords: TransitionRecord[] = [
  // CASE-9001: Escalated Enterprise Case (SLA Breach)
  {
    caseId: "CASE-9001",
    status: "New Intake",
    startTimestamp: "2026-05-18T09:15:00Z",
    endTimestamp: "2026-05-18T10:30:00Z",
    owner: "AutoRouter_Bot",
    isEscalated: false,
    priority: "Critical",
    queue: "Tier 1 Inbox",
    origin: "Web Portal",
    customerLink: "Acme Corp (LTV $180k)",
    notes: "Case created via Enterprise client support webhook. Handed off to Tier 1 triage."
  },
  {
    caseId: "CASE-9001",
    status: "Technical Triage",
    startTimestamp: "2026-05-18T10:30:00Z",
    endTimestamp: "2026-05-18T13:45:00Z",
    owner: "Sarah Jenkins",
    isEscalated: false,
    priority: "Critical",
    queue: "Tier 1 Support",
    origin: "Web Portal",
    customerLink: "Acme Corp (LTV $180k)",
    notes: "Diagnosed core API endpoint rejection. Moved up as it affects live transactions."
  },
  {
    caseId: "CASE-9001",
    status: "Escalation Core Desk",
    startTimestamp: "2026-05-18T13:45:00Z",
    endTimestamp: "2026-05-20T10:00:00Z", // Spans across days and weekend exclusion
    owner: "Marcus Brody",
    isEscalated: true,
    priority: "Critical",
    queue: "Escalation Desk",
    origin: "Web Portal",
    customerLink: "Acme Corp (LTV $180k)",
    notes: "Escalation flag checked. Marcus requesting senior infrastructure engineer involvement."
  },
  {
    caseId: "CASE-9001",
    status: "Engineering Queue",
    startTimestamp: "2026-05-20T10:00:00Z",
    endTimestamp: "2026-05-21T16:30:00Z",
    owner: "Alex Rivera (Tech Lead)",
    isEscalated: true,
    priority: "Critical",
    queue: "Engineering L3",
    origin: "Web Portal",
    customerLink: "Acme Corp (LTV $180k)",
    notes: "Resolved DB lock issue on database cluster. Marked ready for post-incident testing."
  },
  {
    caseId: "CASE-9001",
    status: "Pending Client Verification",
    startTimestamp: "2026-05-21T16:30:00Z",
    owner: "Sarah Jenkins",
    isEscalated: false,
    priority: "Critical",
    queue: "Tier 1 Support",
    origin: "Web Portal",
    customerLink: "Acme Corp (LTV $180k)",
    notes: "Awaiting client verification page confirmation. Periodic reminder sent."
  },

  // CASE-9002: Stuck Case / Queue Bottleneck
  {
    caseId: "CASE-9002",
    status: "New Intake",
    startTimestamp: "2026-05-19T08:00:00Z",
    endTimestamp: "2026-05-19T08:10:00Z",
    owner: "AutoRouter_Bot",
    isEscalated: false,
    priority: "High",
    queue: "Tier 1 Inbox",
    origin: "Email Express",
    customerLink: "Globex Corporation",
    notes: "Auto-ingested Express SLA ticket. Routed based on email category header."
  },
  {
    caseId: "CASE-9002",
    status: "Awaiting Billing Clearance",
    startTimestamp: "2026-05-19T08:10:00Z",
    endTimestamp: "2026-05-21T11:00:00Z",
    owner: "System_SLA_Escalator",
    isEscalated: false,
    priority: "High",
    queue: "Billing & Finance",
    origin: "Email Express",
    customerLink: "Globex Corporation",
    notes: "Awaiting direct invoice mapping from finance department. Long idle period."
  },
  {
    caseId: "CASE-9002",
    status: "Under Review Desk",
    startTimestamp: "2026-05-21T11:00:00Z",
    owner: "John Sterling",
    isEscalated: false,
    priority: "High",
    queue: "Tier 1 Support",
    origin: "Email Express",
    customerLink: "Globex Corporation",
    notes: "Invoice map parsed. Verifying accounts setup state."
  },

  // CASE-9003: Smooth Automated Auto-Resolution Case
  {
    caseId: "CASE-9003",
    status: "New Intake",
    startTimestamp: "2026-05-21T14:00:00Z",
    endTimestamp: "2026-05-21T14:05:00Z",
    owner: "AutoRouter_Bot",
    isEscalated: false,
    priority: "Medium",
    queue: "Tier 1 Inbox",
    origin: "Mobile Chat App",
    customerLink: "Samantha Thorne",
    notes: "Mobile application session registered. Identified account recovery query."
  },
  {
    caseId: "CASE-9003",
    status: "Automated Bot Response",
    startTimestamp: "2026-05-21T14:05:00Z",
    endTimestamp: "2026-05-21T14:15:00Z",
    owner: "SupportAgent_Bot",
    isEscalated: false,
    priority: "Medium",
    queue: "Virtual Assistant",
    origin: "Mobile Chat App",
    customerLink: "Samantha Thorne",
    notes: "Sent automated secure recovery link. Self-service documentation triggered."
  },
  {
    caseId: "CASE-9003",
    status: "Closed - Resolved",
    startTimestamp: "2026-05-21T14:15:00Z",
    endTimestamp: "2026-05-21T14:15:00Z",
    owner: "SupportAgent_Bot",
    isEscalated: false,
    priority: "Medium",
    queue: "Virtual Assistant",
    origin: "Mobile Chat App",
    customerLink: "Samantha Thorne",
    notes: "Client authenticated through security screen successfully. Mark resolved."
  },

  // CASE-9004: Multistep bouncing case demonstrating workflow loops
  {
    caseId: "CASE-9004",
    status: "New Intake",
    startTimestamp: "2026-05-20T10:00:00Z",
    endTimestamp: "2026-05-20T10:15:00Z",
    owner: "AutoRouter_Bot",
    isEscalated: false,
    priority: "Low",
    queue: "Tier 1 Triage",
    origin: "Customer Portal",
    customerLink: "OmniCorp US",
    notes: "New standard priority billing ticket query."
  },
  {
    caseId: "CASE-9004",
    status: "Technical Triage",
    startTimestamp: "2026-05-20T10:15:00Z",
    endTimestamp: "2026-05-20T12:00:00Z",
    owner: "Sarah Jenkins",
    isEscalated: false,
    priority: "Low",
    queue: "Tier 1 Support",
    origin: "Customer Portal",
    customerLink: "OmniCorp US",
    notes: "Assessed as routing query but user insists on credit adjustments."
  },
  {
    caseId: "CASE-9004",
    status: "Finance Review Pool",
    startTimestamp: "2026-05-20T12:00:00Z",
    endTimestamp: "2026-05-20T15:00:00Z",
    owner: "Billing_Aide_Bot",
    isEscalated: false,
    priority: "Low",
    queue: "Billing Desk",
    origin: "Customer Portal",
    customerLink: "OmniCorp US",
    notes: "Rejected credit allocation. Moving log back to support triage."
  },
  {
    caseId: "CASE-9004",
    status: "Technical Triage",
    startTimestamp: "2026-05-20T15:00:00Z",
    endTimestamp: "2026-05-21T09:00:00Z",
    owner: "Sarah Jenkins",
    isEscalated: false,
    priority: "Low",
    queue: "Tier 1 Support",
    origin: "Customer Portal",
    customerLink: "OmniCorp US",
    notes: "Client requesting escalation. Escalating internally to Marcus."
  },
  {
    caseId: "CASE-9004",
    status: "Escalation Core Desk",
    startTimestamp: "2026-05-21T09:00:00Z",
    owner: "Marcus Brody",
    isEscalated: true,
    priority: "Low",
    queue: "Escalation Desk",
    origin: "Customer Portal",
    customerLink: "OmniCorp US",
    notes: "Escalated Core assessing credentials. Active state."
  }
];

// Reconstructed cases cached on server
let processedCasesCached: SupportCase[] = [];

// Helper functions for Duration and SLA Business Hours Calculation
function calculateDurationDetails(
  startStr: string,
  endStr: string,
  config: SLAConfig
): { calendarHours: number; businessHours: number } {
  const start = new Date(startStr);
  const end = new Date(endStr);
  
  if (isNaN(start.getTime()) || isNaN(end.getTime())) {
    return { calendarHours: 0, businessHours: 0 };
  }

  const calendarMs = end.getTime() - start.getTime();
  const calendarHours = Math.max(0, calendarMs / (1000 * 60 * 60));

  if (!config.useBusinessHours) {
    return { calendarHours, businessHours: calendarHours };
  }

  // Optimized minute-by-minute parser for SLA business hour compliance
  let businessMs = 0;
  const current = new Date(start);
  const incrementMinutes = 30; // Highly precise 30 min intervals

  const [bStartH, bStartM] = config.businessStart.split(":").map(Number);
  const [bEndH, bEndM] = config.businessEnd.split(":").map(Number);

  while (current < end) {
    const day = current.getDay();
    const isWeekend = day === 0 || day === 6; // Sunday = 0, Saturday = 6

    let isValidDay = true;
    if (config.excludeWeekends && isWeekend) {
      isValidDay = false;
    }

    const dateString = current.toISOString().substring(0, 10);
    if (config.holidays.includes(dateString)) {
      isValidDay = false;
    }

    if (isValidDay) {
      const currentH = current.getHours();
      const currentM = current.getMinutes();
      const currentTimeVal = currentH * 60 + currentM;
      const bStartTimeVal = bStartH * 60 + bStartM;
      const bEndTimeVal = bEndH * 60 + bEndM;

      if (currentTimeVal >= bStartTimeVal && currentTimeVal < bEndTimeVal) {
        businessMs += incrementMinutes * 60 * 1000;
      }
    }
    
    current.setMinutes(current.getMinutes() + incrementMinutes);
  }

  return {
    calendarHours,
    businessHours: Math.max(0, businessMs / (1000 * 60 * 60))
  };
}

// Sequence Timeline Reconstruction Engine
function rebuildCaseWorkflows(records: TransitionRecord[], config: SLAConfig): SupportCase[] {
  const groups: Record<string, TransitionRecord[]> = {};
  
  // Group rows by CaseID
  records.forEach((record) => {
    if (!record.caseId) return;
    if (!groups[record.caseId]) {
      groups[record.caseId] = [];
    }
    groups[record.caseId].push(record);
  });

  const cases: SupportCase[] = [];
  const RIGHT_NOW = "2026-05-22T07:53:44Z"; // User metadata baseline

  Object.entries(groups).forEach(([caseId, items]) => {
    // Sort items chronologically by start timestamp
    const sortedItems = [...items].sort((a, b) => {
      const tA = new Date(a.startTimestamp).getTime();
      const tB = new Date(b.startTimestamp).getTime();
      return tA - tB;
    });

    const parsedTransitions: CaseTransition[] = [];
    const escalationChainSet = new Set<string>();
    
    let isClosed = false;
    let totalAgeHours = 0;
    let currentStatus = "Unknown";
    let currentOwner = "Unassigned";
    let priority = "Medium";
    let queue = "Default";
    let origin = "Unknown";
    let customerLink = "N/A";
    let lastUpdated = sortedItems[sortedItems.length - 1]?.startTimestamp || RIGHT_NOW;
    let isValidTimeline = true;
    let openMissingEstimatesCount = 0;
    let idleHours = 0;

    // Read metadata from occurrences
    sortedItems.forEach((it) => {
      if (it.priority) priority = it.priority;
      if (it.queue) queue = it.queue;
      if (it.origin) origin = it.origin;
      if (it.customerLink) customerLink = it.customerLink;
      if (it.isEscalated && it.owner) {
        escalationChainSet.add(it.owner);
      }
    });

    for (let i = 0; i < sortedItems.length; i++) {
      const currentRec = sortedItems[i];
      const nextRec = sortedItems[i + 1];

      let startStr = currentRec.startTimestamp;
      let endStr = currentRec.endTimestamp || "";

      // Estimate incomplete end times using sequence order
      if (!endStr) {
        if (nextRec) {
          endStr = nextRec.startTimestamp;
        } else {
          // It's the latest row. If the system detects closed tags, use last action time.
          const isClosedStatusInput = /closed|resolved|completed|done/i.test(currentRec.status);
          if (isClosedStatusInput) {
            endStr = startStr;
            isClosed = true;
          } else {
            // Otherwise, it is an ongoing active ticket, run duration matching local current time
            endStr = RIGHT_NOW;
            isClosed = false;
          }
          openMissingEstimatesCount++;
        }
      } else {
        // Explicitly check closed flags on the file itself too
        if (/closed|resolved|completed|done/i.test(currentRec.status)) {
          isClosed = true;
        }
      }

      const { calendarHours } = calculateDurationDetails(startStr, endStr, config);
      totalAgeHours += calendarHours;

      // Identify bot involvement
      const isAutomation = /bot|system|auto|workflow/i.test(currentRec.owner) || !!currentRec.owner?.includes("Automated");

      // Calculate gaps and overlaps
      let gapWithNextHours = 0;
      let isOverlap = false;

      if (nextRec) {
        const nextStart = new Date(nextRec.startTimestamp).getTime();
        const currEnd = new Date(endStr).getTime();
        if (nextStart < currEnd) {
          isOverlap = true;
          isValidTimeline = false;
        } else {
          gapWithNextHours = (nextStart - currEnd) / (1000 * 60 * 60);
        }
      }

      parsedTransitions.push({
        status: currentRec.status,
        owner: currentRec.owner || "System",
        startTimestamp: startStr,
        endTimestamp: endStr,
        durationHours: Number(calendarHours.toFixed(2)),
        isAutomation,
        gapWithNextHours: Number(gapWithNextHours.toFixed(2)),
        isOverlap
      });

      // Track idle metrics
      if (/awaiting|pending|idle|waiting/i.test(currentRec.status)) {
        idleHours += calendarHours;
      }
    }

    // Capture overall current parameters from the latest event in the lifecycle
    const latestItem = sortedItems[sortedItems.length - 1];
    if (latestItem) {
      currentStatus = latestItem.status;
      currentOwner = latestItem.owner || "Unassigned";
    }

    // Determine current time in current active status
    const latestTransition = parsedTransitions[parsedTransitions.length - 1];
    const timeInCurrentStatusHours = latestTransition ? latestTransition.durationHours : 0;

    // SLA Target Metrics
    const slaLimit = priority === "Critical" ? 4 : priority === "High" ? 12 : priority === "Medium" ? 24 : 48;
    const slaTargetRemaining = slaLimit - totalAgeHours;

    let slaStatus: "MET" | "AT_RISK" | "BREACHED" = "MET";
    if (totalAgeHours > slaLimit) {
      slaStatus = "BREACHED";
    } else if (slaTargetRemaining < 4) {
      slaStatus = "AT_RISK";
    }

    // Compute automation weighting
    const totalDuration = parsedTransitions.reduce((sum, current) => sum + current.durationHours, 0);
    const automationDuration = parsedTransitions
      .filter((t) => t.isAutomation)
      .reduce((sum, current) => sum + current.durationHours, 0);
    const automationPercentage = totalDuration > 0 ? (automationDuration / totalDuration) * 100 : 0;

    // Timeline Confidence Scoring Assessment
    let baseConfidence = 100;
    if (openMissingEstimatesCount > 0) baseConfidence -= 10;
    if (!isValidTimeline) baseConfidence -= 30; // Timestamps are overlaps or backward
    // If gaps are too long, degrade confidence slightly
    const maxGap = Math.max(...parsedTransitions.map((t) => t.gapWithNextHours), 0);
    if (maxGap > 24) baseConfidence -= 15;
    const confidenceScore = Math.max(20, baseConfidence);

    // Operational Risk Scoring (0 to 100)
    let riskScore = 15;
    if (priority === "Critical") riskScore += 35;
    else if (priority === "High") riskScore += 20;
    
    if (slaStatus === "BREACHED") riskScore += 40;
    else if (slaStatus === "AT_RISK") riskScore += 25;

    if (escalationChainSet.size > 0) riskScore += 10;
    if (idleHours > 8) riskScore += 15;
    if (!isClosed && timeInCurrentStatusHours > 12) riskScore += 10;

    riskScore = Math.min(100, Math.max(0, riskScore));

    cases.push({
      caseId,
      currentStatus,
      currentOwner,
      priority,
      queue,
      origin,
      customerLink,
      totalAgeHours: Number(totalAgeHours.toFixed(2)),
      timeInCurrentStatusHours: Number(timeInCurrentStatusHours.toFixed(2)),
      slaStatus,
      slaTimeLimitHours: slaLimit,
      slaTimeRemainingHours: Number(slaTargetRemaining.toFixed(2)),
      transitions: parsedTransitions,
      escalationChain: Array.from(escalationChainSet),
      automationPercentage: Number(automationPercentage.toFixed(1)),
      riskScore: Math.round(riskScore),
      isValidTimeline,
      confidenceScore,
      lastUpdated,
      isClosed,
      idleHours: Number(idleHours.toFixed(2))
    });
  });

  return cases;
}

// RESTful Core API Endpoints
app.get("/api/cases", (req, res) => {
  processedCasesCached = rebuildCaseWorkflows(rawUploadedRecords, currentSLAConfig);
  res.json({
    cases: processedCasesCached,
    config: currentSLAConfig
  });
});

app.post("/api/upload", (req, res) => {
  const { records, config } = req.body;
  if (!Array.isArray(records) || records.length === 0) {
    return res.status(400).json({ error: "No support transition rows recognized in upload dataset." });
  }

  // Safe ingest mapping and normalization
  const parsedRecords: TransitionRecord[] = records.map((rec) => ({
    caseId: String(rec.caseId || "").trim(),
    status: String(rec.status || "").trim(),
    startTimestamp: String(rec.startTimestamp || "").trim(),
    endTimestamp: rec.endTimestamp ? String(rec.endTimestamp).trim() : undefined,
    owner: String(rec.owner || "Unassigned").trim(),
    isEscalated: rec.isEscalated === true || String(rec.isEscalated).toLowerCase() === "true" || String(rec.isEscalated) === "1",
    priority: rec.priority ? String(rec.priority).trim() : "Medium",
    queue: rec.queue ? String(rec.queue).trim() : "Support Pool",
    origin: rec.origin ? String(rec.origin).trim() : "Adhoc Portal",
    customerLink: rec.customerLink ? String(rec.customerLink).trim() : "General Account",
    notes: rec.notes ? String(rec.notes).trim() : ""
  }));

  rawUploadedRecords = parsedRecords;
  processedCasesCached = rebuildCaseWorkflows(parsedRecords, currentSLAConfig);

  // Log auditing
  const logItem: AuditLog = {
    id: `LOG-${Date.now().toString().substring(7)}`,
    timestamp: new Date().toISOString(),
    action: "TRANSITION_UPLOAD",
    user: "Seemab.Haider00@gmail.com",
    role: "Analyst",
    details: `Imported CRM dataset containing ${parsedRecords.length} transition rows. Ingested ${processedCasesCached.length} rebuilt support cases.`,
  };
  auditLogs.unshift(logItem);

  res.json({
    success: true,
    message: "CRM support audit log ingested cleanly.",
    casesRebuiltCount: processedCasesCached.length,
    cases: processedCasesCached
  });
});

app.post("/api/config/sla", (req, res) => {
  const { config } = req.body;
  if (!config) {
    return res.status(400).json({ error: "Invalid SLA parameters configuration." });
  }

  currentSLAConfig = {
    ...currentSLAConfig,
    ...config
  };

  processedCasesCached = rebuildCaseWorkflows(rawUploadedRecords, currentSLAConfig);

  // Add configuration audit footprint
  const logItem: AuditLog = {
    id: `LOG-${Date.now().toString().substring(7)}`,
    timestamp: new Date().toISOString(),
    action: "SLA_CALIBRATION",
    user: "Seemab.Haider00@gmail.com",
    role: "Operations",
    details: `SLA calendar parameters configured. Use Business Hours: ${currentSLAConfig.useBusinessHours}. Profile clock limits recalculated.`,
  };
  auditLogs.unshift(logItem);

  res.json({
    success: true,
    message: "SLA configurations updated successfully.",
    config: currentSLAConfig,
    cases: processedCasesCached
  });
});

app.get("/api/audit-logs", (req, res) => {
  res.json({ auditLogs });
});

// Post Audit Actions logs for security models and user actions representation page
app.post("/api/audit-logs", (req, res) => {
  const { action, details, user, role } = req.body;
  const logItem: AuditLog = {
    id: `LOG-${Date.now().toString().substring(7)}`,
    timestamp: new Date().toISOString(),
    action: action || "USER_INTERACTION",
    user: user || "Seemab.Haider00@gmail.com",
    role: role || "Operations",
    details: details || "",
  };
  auditLogs.unshift(logItem);
  res.json({ success: true, log: logItem });
});

// Gemini AI Operational Insights Endpoint
app.post("/api/ai/insights", async (req, res) => {
  try {
    const casesBrief = processedCasesCached.map((c) => ({
      caseId: c.caseId,
      status: c.currentStatus,
      owner: c.currentOwner,
      priority: c.priority,
      queue: c.queue,
      age: c.totalAgeHours,
      sla: c.slaStatus,
      loopsCount: c.transitions.length,
      automationPercent: c.automationPercentage,
      idleHours: c.idleHours,
      confidence: c.confidenceScore
    }));

    const stats = {
      totalCount: processedCasesCached.length,
      breachedCount: processedCasesCached.filter((c) => c.slaStatus === "BREACHED").length,
      atRiskCount: processedCasesCached.filter((c) => c.slaStatus === "AT_RISK").length,
      automationRatio: Number(
        (
          processedCasesCached.reduce((acc, c) => acc + c.automationPercentage, 0) /
          (processedCasesCached.length || 1)
        ).toFixed(1)
      ),
      averageAge: Number(
        (
          processedCasesCached.reduce((acc, c) => acc + c.totalAgeHours, 0) /
          (processedCasesCached.length || 1)
        ).toFixed(1)
      ),
    };

    const promptText = `
Analyze the following support-case lifecycle dataset for the CX Operations Team:
Support Cases: ${JSON.stringify(casesBrief, null, 2)}
Overall Stats: ${JSON.stringify(stats, null, 2)}

Provide an operational diagnostic and smart recommendations:
1. Identify transition anomalies (e.g., redundant bouncing, backward times, extremely long gaps).
2. Point out queue bottlenecks or statuses where tickets stall.
3. Call out specific escalation patterns and risk factors.
4. Recommend concrete steps to optimize work redistribution (e.g., shift agents between queues, change target response thresholds, replace human loops with automation).
5. Score the confidence level of the timeline reconstruction.

You MUST return a JSON object matching this schema exactly:
{
  "anomalies": ["diagnostic string 1", "diagnostic string 2"],
  "suggestedBottleneckCauses": ["cause description 1", "cause description 2"],
  "escalationPatterns": ["pattern analysis 1", "pattern analysis 2"],
  "workloadSuggestions": ["redistribution detail 1", "redistribution detail 2"],
  "confidenceScore": 85,
  "executiveSummary": "A highly readable, professional executive summary outlining operation findings."
}
`;

    // Retrieve API key with secure server-side isolation
    const apiKey = process.env.GEMINI_API_KEY;

    if (!apiKey || apiKey === "MY_GEMINI_API_KEY") {
      // Graceful fallback for environments with missing or template credentials
      const simulatedInsights: SmartInsights = {
        anomalies: [
          "Detected repetitive status loop on CASE-9004 bouncing twice between 'Technical Triage' and 'Finance Review Pool' with 3+ hour stalls.",
          "Chronological duration anomaly for CASE-9003: self-service bot resolved thread in 10 minutes, outstanding manual log lacks verification confirmation."
        ],
        suggestedBottleneckCauses: [
          "Awaiting Billing Clearance queue experiences on average 51 hours of idle waiting time due to unassigned agent coverage.",
          "High concentrations of High-priority escalations are stalling in 'Under Review Desk' during non-business hours."
        ],
        escalationPatterns: [
          "Enterprise cases originating from Web Portals display an escalation rate of 75%, exceeding the standard baseline by 3x.",
          "System Escalator triggers automated Tier 1 handoffs but fails to assign physical agents within the crucial 4-hour SLA window."
        ],
        workloadSuggestions: [
          "Deploy 2 dedicated operations agents to the 'Billing & Finance Queue' to clear the billing clearance bottleneck.",
          "Automate the 'Pending Client Verification' follow-ups using CRM webhooks to reduce idle timeline delays by estimated 22%."
        ],
        confidenceScore: 92,
        executiveSummary: "Operational intelligence reveals excellent automation rates (averaging 30%) but critical bottlenecks in financial clearance lanes. Case transitions are clean with high sequence integrity. Active re-distribution of triage operators can maintain breach rates under 15%."
      };
      
      return res.json({ 
        insights: simulatedInsights,
        provider: "Local Simulated Insights (Configure GEMINI_API_KEY inside Settings > Secrets for real-time generative intelligence)"
      });
    }

    const ai = new GoogleGenAI({
      apiKey,
      httpOptions: {
        headers: {
          "User-Agent": "aistudio-build",
        },
      },
    });

    const response = await ai.models.generateContent({
      model: "gemini-3.5-flash",
      contents: promptText,
      config: {
        responseMimeType: "application/json",
        responseSchema: {
          type: Type.OBJECT,
          properties: {
            anomalies: {
              type: Type.ARRAY,
              items: { type: Type.STRING },
              description: "Detect anomalies, invalid states, loops, or transitions."
            },
            suggestedBottleneckCauses: {
              type: Type.ARRAY,
              items: { type: Type.STRING },
              description: "Suggest bottleneck causes, queues that are stalled."
            },
            escalationPatterns: {
              type: Type.ARRAY,
              items: { type: Type.STRING },
              description: "Identify patterns of repeated escalation actions."
            },
            workloadSuggestions: {
              type: Type.ARRAY,
              items: { type: Type.STRING },
              description: "Actionable redistribution recommendations for agents and queues."
            },
            confidenceScore: {
              type: Type.INTEGER,
              description: "Timelines reconstructed confidence score from 0 to 100."
            },
            executiveSummary: {
              type: Type.STRING,
              description: "Summary detailing the executive operations layout overview."
            }
          },
          required: ["anomalies", "suggestedBottleneckCauses", "escalationPatterns", "workloadSuggestions", "confidenceScore", "executiveSummary"]
        }
      }
    });

    const outputText = response.text ? response.text.trim() : "";
    const insights: SmartInsights = JSON.parse(outputText);

    // Audit footprint
    const logItem: AuditLog = {
      id: `LOG-${Date.now().toString().substring(7)}`,
      timestamp: new Date().toISOString(),
      action: "AI_GENERATED_DIAGNOSTIC",
      user: "Seemab.Haider00@gmail.com",
      role: "Leadership",
      details: "Triggered Gemini generative intelligence model diagnostic sweep. Response schema parsed.",
    };
    auditLogs.unshift(logItem);

    res.json({ insights, provider: "Gemini Generative Intelligence" });
  } catch (error: any) {
    console.error("Gemini Ingest Diagnostic Error: ", error);
    res.status(500).json({ error: "Failed to generate AI insights.", details: error.message });
  }
});

async function startServer() {
  // Vite dev server mounting or Production static assets handling
  if (process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), "dist");
    app.use(express.static(distPath));
    app.get("*", (req, res) => {
      res.sendFile(path.join(distPath, "index.html"));
    });
  }

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`[SYS] Full-Stack CX Escalation Matrix running on Port ${PORT}`);
  });
}

startServer();
