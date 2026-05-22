export interface SLAConfig {
  targetHours: number;
  useBusinessHours: boolean;
  businessStart: string; // "09:00"
  businessEnd: string;   // "17:00"
  excludeWeekends: boolean;
  holidays: string[];    // YYYY-MM-DD format
}

export interface TransitionRecord {
  caseId: string;
  status: string;
  startTimestamp: string;
  endTimestamp?: string;
  owner: string;
  isEscalated?: boolean;
  priority?: string;
  queue?: string;
  origin?: string;
  customerLink?: string;
  notes?: string;
}

export interface CaseTransition {
  status: string;
  owner: string;
  startTimestamp: string;
  endTimestamp: string;
  durationHours: number;
  isAutomation: boolean;
  gapWithNextHours: number;
  isOverlap: boolean;
}

export interface SupportCase {
  caseId: string;
  currentStatus: string;
  currentOwner: string;
  priority: string;
  queue: string;
  origin: string;
  customerLink: string;
  totalAgeHours: number;
  timeInCurrentStatusHours: number;
  slaStatus: "MET" | "AT_RISK" | "BREACHED";
  slaTimeLimitHours: number;
  slaTimeRemainingHours: number;
  transitions: CaseTransition[];
  escalationChain: string[]; // List of owners or events that experienced escalation
  automationPercentage: number;
  riskScore: number; // 0 to 100
  isValidTimeline: boolean;
  confidenceScore: number; // For reconstructed timelines
  lastUpdated: string;
  isClosed: boolean;
  idleHours: number;
}

export interface AuditLog {
  id: string;
  timestamp: string;
  action: string;
  user: string;
  role: "Leadership" | "Operations" | "Analyst";
  details: string;
}

export interface ColumnMapping {
  caseId: string;
  status: string;
  timestamp: string;
  endTimestamp: string;
  owner: string;
  isEscalated: string;
  priority: string;
  queue: string;
  origin: string;
  customerLink: string;
}

export interface FileParseResult {
  fileName: string;
  headers: string[];
  sampleRows: Record<string, any>[];
  totalRowsCount: number;
  detectedMappings: ColumnMapping;
}

export interface SmartInsights {
  anomalies: string[];
  suggestedBottleneckCauses: string[];
  escalationPatterns: string[];
  workloadSuggestions: string[];
  confidenceScore: number;
  executiveSummary: string;
}
