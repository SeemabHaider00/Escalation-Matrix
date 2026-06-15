import React, { useState, useRef, useMemo } from "react";
import * as XLSX from "xlsx";
import { 
  Upload, 
  FileSpreadsheet, 
  HelpCircle, 
  CheckCircle, 
  AlertTriangle, 
  RefreshCw, 
  Eye, 
  Clock, 
  ArrowRight, 
  ArrowLeft, 
  Check, 
  Sparkles, 
  Cpu, 
  Database, 
  Info, 
  Search,
  Calendar,
  Filter,
  Trash2,
  Sun,
  Moon
} from "lucide-react";

import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Cell,
  PieChart,
  Pie,
  Legend
} from "recharts";

// Types for processed metrics and tabular structures
export const computeAgeText = (ms: number, formatMode: "days-hours" | "total-hours" = "days-hours"): string => {
  if (ms < 0 || isNaN(ms)) {
    return formatMode === "days-hours" ? "0 days 0 hours" : "0 hours";
  }
  const totalHours = Math.floor(ms / (1000 * 60 * 60));
  if (formatMode === "total-hours") {
    return `${totalHours} hours`;
  }
  const days = Math.floor(totalHours / 24);
  const hours = totalHours % 24;
  return `${days} days ${hours} hours`;
};

// BUSINESS HOURS ESCALATION helpers
export function computeWorkingAgeMs(start: Date, end: Date, excludeDays: number[]): number {
  if (start >= end) return 0;
  
  let workingMs = 0;
  const startMs = start.getTime();
  const endMs = end.getTime();
  const current = new Date(startMs);
  
  while (current.getTime() < endMs) {
    const currentDay = current.getDay(); // 0 indicates Sunday, 6 indicates Saturday
    const isExcluded = excludeDays.includes(currentDay);
    
    const nextDay = new Date(current);
    nextDay.setHours(24, 0, 0, 0); // start of next calendar day
    
    const blockEnd = Math.min(nextDay.getTime(), endMs);
    const blockStart = current.getTime();
    
    if (!isExcluded) {
      workingMs += (blockEnd - blockStart);
    }
    
    current.setTime(blockEnd);
  }
  
  return workingMs;
}

export const formatWorkingAgeHours = (hours: number): string => {
  if (hours < 0 || isNaN(hours)) return "0 Days 0 Hours";
  const d = Math.floor(hours / 24);
  const h = Math.floor(hours % 24);
  return `${d} Days ${h} Hours`;
};

export const formatRemainingWorkingTime = (hours: number): string => {
  if (hours <= 0 || isNaN(hours)) return "0 Hours Remaining";
  const days = Math.floor(hours / 24);
  const remHours = Math.ceil(hours % 24);
  
  if (days >= 1) {
    if (remHours === 0) {
      return `${days} Day${days === 1 ? "" : "s"} Remaining`;
    }
    return `${days} Day${days === 1 ? "" : "s"} ${remHours} Hour${remHours === 1 ? "" : "s"} Remaining`;
  }
  return `${Math.ceil(hours)} Hours Remaining`;
};

export const targetStatusLabels = [
  "Pending at Finance End",
  "Pending at Warehouse End",
  "Pending at Logistic End",
  "Pending at E-Com End",
  "Pending at Retail Store End",
  "Pending at Courier End",
  "CX-Backend"
];

export const matchRowToStatusLabel = (rawStatus: string): string => {
  const s = rawStatus.toLowerCase().trim();
  if (s.includes("finance")) return "Pending at Finance End";
  if (s.includes("warehouse")) return "Pending at Warehouse End";
  if (s.includes("logistic")) return "Pending at Logistic End";
  if (s.includes("e-com") || s.includes("ecom")) return "Pending at E-Com End";
  if (s.includes("retail")) return "Pending at Retail Store End";
  if (s.includes("courier")) return "Pending at Courier End";
  if (s.includes("cx") || s.includes("backend")) return "CX-Backend";
  return "CX-Backend"; // Default fallback to CX-Backend or keep as is
};

export const getStatusGroupInfo = (status: string) => {
  const s = status.toLowerCase();
  if (s.includes("finance")) {
    return {
      groupName: "Pending at Finance End",
      excludeDays: [0, 6], // Monday to Friday ONLY
      rules: [
        { level: "Level 1", min: 72, max: 96, threshold: 72 },
        { level: "Level 2", min: 96, max: 120, threshold: 96 },
        { level: "Level 3", min: 120, max: Infinity, threshold: 120 }
      ],
      defaultThreshold: 72
    };
  } else if (s.includes("warehouse") || s.includes("logistic")) {
    return {
      groupName: s.includes("warehouse") ? "Pending at Warehouse End" : "Pending at Logistic End",
      excludeDays: [0], // Monday to Saturday
      rules: [
        { level: "Level 1", min: 96, max: 120, threshold: 96 },
        { level: "Level 2", min: 120, max: 168, threshold: 120 },
        { level: "Level 3", min: 168, max: Infinity, threshold: 168 }
      ],
      defaultThreshold: 96
    };
  } else {
    // Group 3: Pending at E-Com End, Pending at Retail Store End, CX-Backend, Pending at Courier End
    let groupLabel = "CX-Backend";
    if (s.includes("e-com") || s.includes("ecom")) groupLabel = "Pending at E-Com End";
    else if (s.includes("retail")) groupLabel = "Pending at Retail Store End";
    else if (s.includes("courier")) groupLabel = "Pending at Courier End";
    
    return {
      groupName: groupLabel,
      excludeDays: [0], // Monday to Saturday
      rules: [
        { level: "Level 1", min: 72, max: 96, threshold: 72 },
        { level: "Level 2", min: 96, max: 120, threshold: 96 },
        { level: "Level 3", min: 120, max: Infinity, threshold: 120 }
      ],
      defaultThreshold: 72
    };
  }
};

interface PreviewRow {
  timestamp: string;
  ageText: string;
  ageMs: number;
  message: string;
  rawData: string[];
  // SLA specific additions
  workingAgeMs?: number;
  workingAgeHours?: number;
  workingAgeText?: string;
  escalationLevel?: "Within SLA" | "Level 1" | "Level 2" | "Level 3";
  slaThreshold?: string;
  remainingTimeText?: string;
  rawStatus?: string;
}

interface RunStats {
  totalCount: number;
  validCount: number;
  corruptedCount: number;
  minAgeMs: number; // Shortest age (newest record)
  maxAgeMs: number; // Longest age (oldest record)
  sumAgeMs: number;
  oldestTimestamp: string;
  newestTimestamp: string;
  previewRows: PreviewRow[];
}

export default function App() {
  // Theme state with localStorage persistence
  const [theme, setTheme] = useState<"light" | "dark">(() => {
    try {
      const saved = localStorage.getItem("escalation_theme");
      return (saved === "light" || saved === "dark") ? saved : "dark";
    } catch {
      return "dark";
    }
  });

  const activeTheme = theme || "dark";

  const toggleTheme = () => {
    const next = activeTheme === "dark" ? "light" : "dark";
    setTheme(next);
    try {
      localStorage.setItem("escalation_theme", next);
    } catch (e) {
      console.error(e);
    }
  };

  // Navigation & Step Wizard: "import" -> "column_mapping" -> "processing" -> "dashboard"
  const [step, setStep] = useState<"import" | "column_mapping" | "processing" | "dashboard">("import");
  
  // Data ingestion states
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [headers, setHeaders] = useState<string[]>([]);
  const [sampleRows, setSampleRows] = useState<any[]>([]);
  const [selectedTimestampCol, setSelectedTimestampCol] = useState<string>("");
  const [selectedMessageCol, setSelectedMessageCol] = useState<string>("");
  const [hasHeaders, setHasHeaders] = useState<boolean>(true);
  
  // High-performance analysis variables
  const [linesProcessed, setLinesProcessed] = useState<number>(0);
  const [progress, setProgress] = useState<number>(0);
  const [parseError, setParseError] = useState<string | null>(null);
  
  // Result dataset statistics
  const [stats, setStats] = useState<RunStats | null>(null);

  // Time context alignment (using the Workspace Time from Metadata by default: May 22, 2026)
  const defaultReferenceDate = "2026-05-22T08:44:45Z";
  const [referenceTime, setReferenceTime] = useState<string>(defaultReferenceDate);
  const [useLiveClock, setUseLiveClock] = useState<boolean>(false);
  
  // Active clock resolution helper
  const getActiveReferenceTime = (): Date => {
    if (useLiveClock) {
      return new Date();
    }
    const d = new Date(referenceTime);
    return isNaN(d.getTime()) ? new Date(defaultReferenceDate) : d;
  };

  // Dashboard pagination and matching controls
  const [searchQuery, setSearchQuery] = useState<string>("");
  const [pageSize, setPageSize] = useState<number>(50);
  const [currentPage, setCurrentPage] = useState<number>(1);
  const [expandedRowIdx, setExpandedRowIdx] = useState<number | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // New settings & filter/sorting capabilities
  const [ageDisplayMode, setAgeDisplayMode] = useState<"days-hours" | "total-hours">("days-hours");
  const [selectedCategoryFilters, setSelectedCategoryFilters] = useState<Record<string, string>>({});
  const [selectedEscalationFilter, setSelectedEscalationFilter] = useState<string>("");
  const [sortColumn, setSortColumn] = useState<string | null>(null);
  const [sortDirection, setSortDirection] = useState<"asc" | "desc">("desc");
  
  // Collapsible dropdown filter panel states
  const [isFilterOpen, setIsFilterOpen] = useState<boolean>(false);
  const [dateStartFilter, setDateStartFilter] = useState<string>("");
  const [dateEndFilter, setDateEndFilter] = useState<string>("");
  const [minAgeHours, setMinAgeHours] = useState<string>("");
  const [maxAgeHours, setMaxAgeHours] = useState<string>("");

  // Helper parser: Splits raw CSV rows while safely disregarding commas enveloped inside tags
  const parseCSVLine = (line: string): string[] => {
    const result: string[] = [];
    let current = "";
    let inQuotes = false;
    for (let i = 0; i < line.length; i++) {
      const char = line[i];
      if (char === '"' || char === "'") {
        inQuotes = !inQuotes;
      } else if (char === ',' && !inQuotes) {
        result.push(current.trim());
        current = "";
      } else {
        current += char;
      }
    }
    result.push(current.trim());
    return result;
  };

  // File loading router - checks constraints & reads headers safely before heavy stream processing
  const handleFileChange = async (file: File) => {
    if (!file) return;
    
    // Exception 8. ONLY FAIL IF FILE SIZE = 0 BYTES
    if (file.size === 0) {
      setParseError("File Ingestion Failure: Selected file is empty (0 bytes / contains no data)");
      setStep("import");
      return;
    }

    setSelectedFile(file);
    setParseError(null);
    setStep("column_mapping");

    // Extract first 100KB of metadata to preview structure and capture column headers
    try {
      const isCSV = file.name.toLowerCase().endsWith(".csv") || file.type === "text/csv";
      if (isCSV) {
        const slice = file.slice(0, 100000);
        const text: string = await new Promise((resolve, reject) => {
          const reader = new FileReader();
          reader.onload = () => resolve(reader.result as string);
          reader.onerror = () => reject(reader.error);
          reader.readAsText(slice, "utf-8");
        });

        // Split text chunk by lines
        const lines = text.split(/\r?\n/).map(l => l.trim()).filter(l => l.length > 0);
        if (lines.length === 0) {
          throw new Error("No readable text structures found. Header parse failed.");
        }

        const detectedHeaders = parseCSVLine(lines[0]);
        setHeaders(detectedHeaders);

        // Feed up to 10 sample preview lines to the mapping stage
        const sample: any[] = [];
        for (let i = 1; i < Math.min(10, lines.length); i++) {
          const cols = parseCSVLine(lines[i]);
          const rowObj: Record<string, string> = {};
          detectedHeaders.forEach((hdr, idx) => {
            rowObj[hdr] = cols[idx] || "";
          });
          sample.push(rowObj);
        }
        setSampleRows(sample);

        // Smart Mapping Auto-Detect Rules
        let tsMatch = "";
        let msgMatch = "";
        detectedHeaders.forEach((hdr) => {
          const l = hdr.toLowerCase().replace(/[\s_-]/g, "");
          if ((l.includes("time") || l.includes("date") || l.includes("created") || l.includes("timestamp") || l.includes("opened") || l.includes("epoch")) && !tsMatch) {
            tsMatch = hdr;
          }
          if ((l.includes("msg") || l.includes("text") || l.includes("note") || l.includes("body") || l.includes("message") || l.includes("descr") || l.includes("log")) && !msgMatch) {
            msgMatch = hdr;
          }
        });

        setSelectedTimestampCol(tsMatch || detectedHeaders[0] || "");
        setSelectedMessageCol(msgMatch || "");
      } else {
        // XLSX/XLS binary Excel reader route fallback
        const slice = file.slice(0, 500000);
        const arrayBuffer = await slice.arrayBuffer();
        const workbook = XLSX.read(new Uint8Array(arrayBuffer), { type: "array" });
        const firstSheet = workbook.SheetNames[0];
        const worksheet = workbook.Sheets[firstSheet];
        
        const jsonData: any[][] = XLSX.utils.sheet_to_json(worksheet, { header: 1 });
        if (!jsonData || jsonData.length === 0) {
          throw new Error("excel sheet appears empty");
        }

        const detectedHeaders = jsonData[0].map(String);
        setHeaders(detectedHeaders);

        // Feed samples
        const sample: any[] = [];
        for (let i = 1; i < Math.min(10, jsonData.length); i++) {
          const rowObj: Record<string, string> = {};
          detectedHeaders.forEach((hdr, idx) => {
            rowObj[hdr] = String(jsonData[i][idx] || "");
          });
          sample.push(rowObj);
        }
        setSampleRows(sample);

        let tsMatch = "";
        let msgMatch = "";
        detectedHeaders.forEach((hdr) => {
          const l = hdr.toLowerCase().replace(/[\s_-]/g, "");
          if ((l.includes("time") || l.includes("date") || l.includes("created") || l.includes("timestamp") || l.includes("opened")) && !tsMatch) {
            tsMatch = hdr;
          }
          if ((l.includes("msg") || l.includes("text") || l.includes("note") || l.includes("body") || l.includes("message") || l.includes("descr")) && !msgMatch) {
            msgMatch = hdr;
          }
        });

        setSelectedTimestampCol(tsMatch || detectedHeaders[0] || "");
        setSelectedMessageCol(msgMatch || "");
      }
    } catch (e: any) {
      console.warn("Fast header analysis failed. Presenting default column layouts.", e);
      // Generate default fallbacks to prevent freezing UI
      setHeaders(["Column1", "Column2", "Column3"]);
      setSelectedTimestampCol("Column1");
      setSelectedMessageCol("");
    }
  };

  // Asynchronous memory-safe chunk generator that parses CSV lines in blocks
  const parseCSVFileStreaming = async (file: File) => {
    const CHUNK_SIZE = 1024 * 1024 * 2; // 2MB stream windows
    const fileSize = file.size;
    let offset = 0;
    let carryOver = "";
    let isFirstChunk = true;

    // Running calculations variables (zero heavy array memory allocations)
    let totalCount = 0;
    let validCount = 0;
    let corruptedCount = 0;

    const baseNowDate = getActiveReferenceTime();
    const nowMs = baseNowDate.getTime();

    let minAgeMs = Infinity;  // newest record age (shortest interval)
    let maxAgeMs = -Infinity; // oldest record age (longest interval)
    let sumAgeMs = 0;
    let oldestTimestampStr = "";
    let newestTimestampStr = "";

    // Retain a visual preview of lines in memory
    const previewPool: PreviewRow[] = [];
    const MAX_PREVIEW_SIZE = 10000; // Limit memory preview pool

    // Indices corresponding to headers
    const tsIdx = headers.indexOf(selectedTimestampCol);
    const msgIdx = selectedMessageCol ? headers.indexOf(selectedMessageCol) : -1;

    try {
      while (offset < fileSize) {
        const slice = file.slice(offset, offset + CHUNK_SIZE);
        const text: string = await new Promise((resolve, reject) => {
          const reader = new FileReader();
          reader.onload = () => resolve(reader.result as string);
          reader.onerror = () => reject(reader.error);
          reader.readAsText(slice, "utf-8");
        });

        offset += CHUNK_SIZE;
        const combined = carryOver + text;
        const lines = combined.split(/\r?\n/);
        
        // Pop the last incomplete line to append to downstream chunks
        carryOver = lines.pop() || "";

        const startingLine = (isFirstChunk && hasHeaders) ? 1 : 0;
        isFirstChunk = false;

        for (let i = startingLine; i < lines.length; i++) {
          const rawLine = lines[i].trim();
          if (!rawLine) continue;

          totalCount++;

          const cols = parseCSVLine(rawLine);
          const rawTimestamp = tsIdx >= 0 ? cols[tsIdx] : "";
          const msgValue = msgIdx >= 0 ? cols[msgIdx] : "";

          if (!rawTimestamp) {
            corruptedCount++;
            continue;
          }

          // Evaluate timestamp validity
          const timestampObj = new Date(rawTimestamp);
          if (isNaN(timestampObj.getTime())) {
            corruptedCount++;
            continue;
          }

          validCount++;
          const recMs = timestampObj.getTime();
          const ageMs = nowMs - recMs;

          // Aggregation running calculus
          if (ageMs < minAgeMs) {
            minAgeMs = ageMs;
            newestTimestampStr = rawTimestamp;
          }
          if (ageMs > maxAgeMs) {
            maxAgeMs = ageMs;
            oldestTimestampStr = rawTimestamp;
          }
          sumAgeMs += ageMs;

          // Push to sample review page if under limit
          if (previewPool.length < MAX_PREVIEW_SIZE) {
            previewPool.push({
              timestamp: rawTimestamp,
              ageText: computeAgeText(ageMs),
              ageMs: ageMs,
              message: msgValue || "",
              rawData: cols
            });
          }
        }

        // Live stream update callbacks
        setLinesProcessed(totalCount);
        setProgress(Math.round((Math.min(offset, fileSize) / fileSize) * 100));

        // Let the web browser refresh layout cycle
        await new Promise((resolve) => setTimeout(resolve, 0));
      }

      // Read remainder
      if (carryOver.trim()) {
        const rawLine = carryOver.trim();
        totalCount++;
        const cols = parseCSVLine(rawLine);
        const rawTimestamp = tsIdx >= 0 ? cols[tsIdx] : "";
        const msgValue = msgIdx >= 0 ? cols[msgIdx] : "";

        if (rawTimestamp) {
          const timestampObj = new Date(rawTimestamp);
          if (!isNaN(timestampObj.getTime())) {
            validCount++;
            const recMs = timestampObj.getTime();
            const ageMs = nowMs - recMs;

            if (ageMs < minAgeMs) {
              minAgeMs = ageMs;
              newestTimestampStr = rawTimestamp;
            }
            if (ageMs > maxAgeMs) {
              maxAgeMs = ageMs;
              oldestTimestampStr = rawTimestamp;
            }
            sumAgeMs += ageMs;

            if (previewPool.length < MAX_PREVIEW_SIZE) {
              previewPool.push({
                timestamp: rawTimestamp,
                ageText: computeAgeText(ageMs),
                ageMs: ageMs,
                message: msgValue || "",
                rawData: cols
              });
            }
          } else {
            corruptedCount++;
          }
        } else {
          corruptedCount++;
        }
      }

      // Compute aggregates
      const avgAgeMs = validCount > 0 ? (sumAgeMs / validCount) : 0;
      
      // Chronological sort ascending logic (oldest record first)
      previewPool.sort((a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime());

      setStats({
        totalCount,
        validCount,
        corruptedCount,
        minAgeMs: isFinite(minAgeMs) ? minAgeMs : 0,
        maxAgeMs: isFinite(maxAgeMs) ? maxAgeMs : 0,
        sumAgeMs,
        oldestTimestamp: oldestTimestampStr,
        newestTimestamp: newestTimestampStr,
        previewRows: previewPool
      });
      setStep("dashboard");

    } catch (err: any) {
      console.error(err);
      setParseError(err.message || "Failed during streaming operations.");
      setStep("import");
    }
  };

  // High velocity dataset ingestion processor - supports CSV streaming streams & Excel fallbacks
  const startProcessingWorkflow = async () => {
    if (!selectedFile) return;

    setStep("processing");
    setProgress(0);
    setLinesProcessed(0);

    const isCSV = selectedFile.name.toLowerCase().endsWith(".csv") || selectedFile.type === "text/csv";
    
    if (isCSV) {
      await parseCSVFileStreaming(selectedFile);
    } else {
      // Invalidation guard - Excel XLSX loading segment
      try {
        const data = await selectedFile.arrayBuffer();
        const workbook = XLSX.read(new Uint8Array(data), { type: "array", cellDates: true });
        const sheetName = workbook.SheetNames[0];
        const worksheet = workbook.Sheets[sheetName];
        if (!worksheet) {
          throw new Error("worksheet appears empty");
        }

        const rows: any[] = XLSX.utils.sheet_to_json(worksheet, { defval: "" });
        if (rows.length === 0) {
          throw new Error("worksheet appears empty");
        }

        const baseNowDate = getActiveReferenceTime();
        const nowMs = baseNowDate.getTime();

        let validCount = 0;
        let corruptedCount = 0;
        let minAgeMs = Infinity;
        let maxAgeMs = -Infinity;
        let sumAgeMs = 0;
        let oldestTimestampStr = "";
        let newestTimestampStr = "";

        const previewPool: PreviewRow[] = [];

        rows.forEach((row) => {
          const rawTimestamp = row[selectedTimestampCol] || "";
          const msgValue = selectedMessageCol ? row[selectedMessageCol] : "";

          if (!rawTimestamp) {
            corruptedCount++;
            return;
          }

          const timestampObj = new Date(rawTimestamp);
          if (isNaN(timestampObj.getTime())) {
            corruptedCount++;
            return;
          }

          validCount++;
          const recMs = timestampObj.getTime();
          const ageMs = nowMs - recMs;

          if (ageMs < minAgeMs) {
            minAgeMs = ageMs;
            newestTimestampStr = String(rawTimestamp);
          }
          if (ageMs > maxAgeMs) {
            maxAgeMs = ageMs;
            oldestTimestampStr = String(rawTimestamp);
          }
          sumAgeMs += ageMs;

          if (previewPool.length < 10000) {
            const rawData = headers.map(hdr => {
              const val = row[hdr];
              if (val === undefined || val === null) return "";
              if (val instanceof Date) return val.toISOString();
              return String(val);
            });

            previewPool.push({
              timestamp: String(rawTimestamp),
              ageText: computeAgeText(ageMs),
              ageMs: ageMs,
              message: String(msgValue || ""),
              rawData: rawData
            });
          }
        });

        // Trigger sort by historical timestamp date
        previewPool.sort((a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime());

        setStats({
          totalCount: rows.length,
          validCount,
          corruptedCount,
          minAgeMs: isFinite(minAgeMs) ? minAgeMs : 0,
          maxAgeMs: isFinite(maxAgeMs) ? maxAgeMs : 0,
          sumAgeMs,
          oldestTimestamp: oldestTimestampStr,
          newestTimestamp: newestTimestampStr,
          previewRows: previewPool
        });
        setStep("dashboard");

      } catch (excelErr: any) {
        console.warn("Excel parsing issue, pivoting seamlessly to raw line CSV streaming reader:", excelErr);
        // Error handling 8 & 9. Try alternative CSV stream parse route
        await parseCSVFileStreaming(selectedFile);
      }
    }
  };

  // Helper formatting for ages on Summary Dashboard cards
  const formatAgeValue = (ms: number): { value: string; unit: string } => {
    if (ms <= 0) return { value: "0", unit: "mins" };
    const mins = ms / (1000 * 60);
    const hours = mins / 60;
    const days = hours / 24;

    if (days >= 1) {
      return { value: days.toFixed(2), unit: "days" };
    } else if (hours >= 1) {
      return { value: hours.toFixed(2), unit: "hours" };
    } else {
      return { value: mins.toFixed(1), unit: "mins" };
    }
  };

  // Dynamic Categorical Column Filter Detection (e.g. status, queue, priority, etc.)
  const columnCategoryFilters = useMemo((): Record<string, string[]> => {
    if (!stats || !stats.previewRows.length) return {};
    const categories: Record<string, string[]> = {};
    
    headers.forEach((h, hIdx) => {
      const values = stats.previewRows.map(r => r.rawData[hIdx] || "").filter(v => v.trim() !== "");
      const uniqueVals: string[] = Array.from(new Set(values)) as string[];
      const lowerHeader = h.toLowerCase().replace(/[\s_-]/g, "");
      
      const isLikelyCategorical = 
        uniqueVals.length > 0 && 
        (uniqueVals.length <= 15 || 
         lowerHeader.includes("status") || 
         lowerHeader.includes("priority") || 
         lowerHeader.includes("queue") || 
         lowerHeader.includes("channel") || 
         lowerHeader.includes("severity") || 
         lowerHeader.includes("type"));
         
      // Exclude obviously unique or timestamp columns
      if (isLikelyCategorical && uniqueVals.length <= 35 && h !== selectedTimestampCol) {
        categories[h] = uniqueVals.sort();
      }
    });
    return categories;
  }, [stats, headers, selectedTimestampCol]);

  // Clear all filters helper
  const clearCategoryFilters = () => {
    setSelectedCategoryFilters({});
    setSelectedEscalationFilter("");
    setDateStartFilter("");
    setDateEndFilter("");
    setMinAgeHours("");
    setMaxAgeHours("");
    setSearchQuery("");
    setCurrentPage(1);
  };

  // Dynamically detected columns for simplified table and metrics mapping
  const detectedStatusColName = useMemo<string>(() => {
    if (!headers || headers.length === 0) return "";
    return headers.find(h => {
      const l = h.toLowerCase();
      return l.includes("status") || l.includes("state");
    }) || "";
  }, [headers]);

  const detectedNetworkColName = useMemo<string>(() => {
    if (!headers || headers.length === 0) return "";
    return headers.find(h => {
      const l = h.toLowerCase();
      return l.includes("network") || l.includes("channel") || l.includes("source") || l.includes("platform") || l.includes("media");
    }) || "";
  }, [headers]);

  const detectedMessageColName = useMemo<string>(() => {
    return selectedMessageCol || headers.find(h => {
      const l = h.toLowerCase();
      return l.includes("message") || l.includes("text") || l.includes("desc") || l.includes("body") || l.includes("content");
    }) || "";
  }, [headers, selectedMessageCol]);

  // Mapped SLA Rows using Reactive Working Hours Logic
  const slaProcessedRows = useMemo(() => {
    if (!stats || !stats.previewRows) return [];
    const statusColIdx = detectedStatusColName ? headers.indexOf(detectedStatusColName) : -1;
    const refDate = getActiveReferenceTime();
    
    return stats.previewRows.map(row => {
      const rawStatus = statusColIdx !== -1 ? (row.rawData[statusColIdx] || "") : "";
      const groupInfo = getStatusGroupInfo(rawStatus);
      const start = new Date(row.timestamp);
      
      const workingAgeMs = computeWorkingAgeMs(start, refDate, groupInfo.excludeDays);
      const workingAgeHours = workingAgeMs / (1000 * 60 * 60);
      
      const workingAgeText = formatWorkingAgeHours(workingAgeHours);
      
      let escalationLevel: "Within SLA" | "Level 1" | "Level 2" | "Level 3" = "Within SLA";
      let slaThreshold = `${groupInfo.defaultThreshold} Hours`;
      let remainingHours = 0;
      let remainingTimeText = "";

      // Evaluate level
      if (workingAgeHours >= groupInfo.rules[2].min) {
        escalationLevel = "Level 3";
      } else if (workingAgeHours >= groupInfo.rules[1].min) {
        escalationLevel = "Level 2";
      } else if (workingAgeHours >= groupInfo.rules[0].min) {
        escalationLevel = "Level 1";
      } else {
        escalationLevel = "Within SLA";
      }

      // Map SLA Threshold & Remaining Time:
      if (escalationLevel === "Within SLA") {
        slaThreshold = `${groupInfo.rules[0].min} Hours`;
        remainingHours = groupInfo.rules[0].min - workingAgeHours;
        remainingTimeText = formatRemainingWorkingTime(remainingHours);
      } else if (escalationLevel === "Level 1") {
        slaThreshold = `${groupInfo.rules[1].min} Hours`;
        remainingHours = groupInfo.rules[1].min - workingAgeHours;
        remainingTimeText = formatRemainingWorkingTime(remainingHours);
      } else if (escalationLevel === "Level 2") {
        slaThreshold = `${groupInfo.rules[2].min} Hours`;
        remainingHours = groupInfo.rules[2].min - workingAgeHours;
        remainingTimeText = formatRemainingWorkingTime(remainingHours);
      } else {
        slaThreshold = `${groupInfo.rules[2].min} Hours`;
        remainingHours = 0;
        remainingTimeText = "Max Level";
      }

      return {
        ...row,
        workingAgeMs,
        workingAgeHours,
        workingAgeText,
        escalationLevel,
        slaThreshold,
        remainingTimeText,
        rawStatus
      };
    });
  }, [stats, headers, detectedStatusColName, referenceTime, useLiveClock]);

  // First-stage Filtered Row Dataset WITHOUT Escalation selection filter (for SLA counts)
  const filteredRowsWithoutEscalation = useMemo(() => {
    if (!stats) return [];
    let rows = slaProcessedRows;

    // Apply categorical filters
    Object.entries(selectedCategoryFilters).forEach(([col, val]) => {
      if (!val) return;
      const hIdx = headers.indexOf(col);
      if (hIdx >= 0) {
        rows = rows.filter(r => (r.rawData[hIdx] || "").toLowerCase() === (val as string).toLowerCase());
      }
    });

    // Apply search query
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      rows = rows.filter(r => 
        r.timestamp.toLowerCase().includes(q) || 
        r.message.toLowerCase().includes(q) ||
        r.rawData.some(cell => String(cell).toLowerCase().includes(q))
      );
    }

    // Apply date range filter
    if (dateStartFilter) {
      const startMs = new Date(dateStartFilter).getTime();
      if (!isNaN(startMs)) {
        rows = rows.filter(r => new Date(r.timestamp).getTime() >= startMs);
      }
    }
    if (dateEndFilter) {
      const endMs = new Date(dateEndFilter).getTime() + 24 * 60 * 60 * 1000 - 1; // inclusive end of day
      if (!isNaN(endMs)) {
        rows = rows.filter(r => new Date(r.timestamp).getTime() <= endMs);
      }
    }

    // Apply age range filter (hours)
    if (minAgeHours.trim() !== "") {
      const minMs = parseFloat(minAgeHours) * 60 * 60 * 1000;
      if (!isNaN(minMs)) {
        rows = rows.filter(r => r.ageMs >= minMs);
      }
    }
    if (maxAgeHours.trim() !== "") {
      const maxMs = parseFloat(maxAgeHours) * 60 * 60 * 1000;
      if (!isNaN(maxMs)) {
        rows = rows.filter(r => r.ageMs <= maxMs);
      }
    }

    return rows;
  }, [slaProcessedRows, selectedCategoryFilters, searchQuery, headers, dateStartFilter, dateEndFilter, minAgeHours, maxAgeHours]);

  // Second-stage: Active Filtered Rows incorporating Selected Escalation Level (toggled by users)
  const filteredRows = useMemo(() => {
    let rows = [...filteredRowsWithoutEscalation];
    if (selectedEscalationFilter) {
      rows = rows.filter(r => r.escalationLevel === selectedEscalationFilter);
    }
    return rows;
  }, [filteredRowsWithoutEscalation, selectedEscalationFilter]);

  // SLA totals based on un-escalation filtered stage (strictly respecting active search & status filters)
  const slaCounts = useMemo(() => {
    let withinSLA = 0;
    let level1 = 0;
    let level2 = 0;
    let level3 = 0;

    filteredRowsWithoutEscalation.forEach(row => {
      if (row.escalationLevel === "Within SLA") withinSLA++;
      else if (row.escalationLevel === "Level 1") level1++;
      else if (row.escalationLevel === "Level 2") level2++;
      else if (row.escalationLevel === "Level 3") level3++;
    });

    return { withinSLA, level1, level2, level3 };
  }, [filteredRowsWithoutEscalation]);

  // Sort and filter dataset viewer rows elements
  const sortedAndFilteredRows = useMemo(() => {
    let result = [...filteredRows];
    if (sortColumn) {
      result.sort((a, b) => {
        let valA: any;
        let valB: any;

        if (sortColumn === "workingAge") {
          valA = a.workingAgeMs;
          valB = b.workingAgeMs;
        } else if (sortColumn === "escalationLevel") {
          const priority: Record<string, number> = { "Within SLA": 1, "Level 1": 2, "Level 2": 3, "Level 3": 4 };
          valA = priority[a.escalationLevel || ""] || 0;
          valB = priority[b.escalationLevel || ""] || 0;
        } else if (sortColumn === "slaThreshold") {
          valA = parseFloat(a.slaThreshold || "0") || 0;
          valB = parseFloat(b.slaThreshold || "0") || 0;
        } else if (sortColumn === "remainingTime") {
          const getRemHours = (row: any) => {
            if (row.escalationLevel === "Level 3") return -1;
            const match = row.remainingTimeText?.match(/(\d+)\s*Hour/);
            const daysMatch = row.remainingTimeText?.match(/(\d+)\s*Day/);
            let h = 0;
            if (daysMatch) h += parseInt(daysMatch[1]) * 24;
            if (match) h += parseInt(match[1]);
            return h;
          };
          valA = getRemHours(a);
          valB = getRemHours(b);
        } else if (sortColumn === "age") {
          valA = a.ageMs;
          valB = b.ageMs;
        } else if (sortColumn === "timestamp" || sortColumn === selectedTimestampCol) {
          const timeA = new Date(a.timestamp).getTime();
          const timeB = new Date(b.timestamp).getTime();
          valA = isNaN(timeA) ? 0 : timeA;
          valB = isNaN(timeB) ? 0 : timeB;
        } else {
          const hIdx = headers.indexOf(sortColumn);
          if (hIdx >= 0) {
            valA = a.rawData[hIdx] || "";
            valB = b.rawData[hIdx] || "";
            const numA = Number(valA);
            const numB = Number(valB);
            if (!isNaN(numA) && !isNaN(numB) && valA !== "" && valB !== "") {
              valA = numA;
              valB = numB;
            } else {
              valA = String(valA).toLowerCase();
              valB = String(valB).toLowerCase();
            }
          } else {
            valA = "";
            valB = "";
          }
        }

        if (valA < valB) return sortDirection === "asc" ? -1 : 1;
        if (valA > valB) return sortDirection === "asc" ? 1 : -1;
        return 0;
      });
    }
    return result;
  }, [filteredRows, sortColumn, sortDirection, selectedTimestampCol, headers]);

  // Synchronized active dataset statistics computed instantly on currently active filters
  const activeStats = useMemo(() => {
    if (!stats) return null;
    const dataset = filteredRows;
    const count = dataset.length;

    if (count === 0) {
      return {
        validCount: 0,
        minAgeMs: null,
        maxAgeMs: null,
        avgAgeMs: null,
        oldestTimestamp: "N/A",
        newestTimestamp: "N/A"
      };
    }

    let minAge = Infinity;
    let maxAge = -Infinity;
    let ageSum = 0;
    let oldestTS = "";
    let newestTS = "";

    dataset.forEach((row) => {
      const ageMs = row.ageMs;
      if (ageMs < minAge) {
        minAge = ageMs;
        newestTS = row.timestamp;
      }
      if (ageMs > maxAge) {
        maxAge = ageMs;
        oldestTS = row.timestamp;
      }
      ageSum += ageMs;
    });

    return {
      validCount: count,
      minAgeMs: isFinite(minAge) ? minAge : null,
      maxAgeMs: isFinite(maxAge) ? maxAge : null,
      avgAgeMs: ageSum / count,
      oldestTimestamp: oldestTS || "N/A",
      newestTimestamp: newestTS || "N/A"
    };
  }, [filteredRows, stats]);

  // Paginated elements mapping
  const paginatedRows = useMemo(() => {
    const startIdx = (currentPage - 1) * pageSize;
    return sortedAndFilteredRows.slice(startIdx, startIdx + pageSize);
  }, [sortedAndFilteredRows, currentPage, pageSize]);

  const totalPages = Math.ceil(sortedAndFilteredRows.length / pageSize) || 1;

  // Dashboard Summary metrics
  const dashboardMetrics = useMemo(() => {
    const totalCount = filteredRows.length;
    let openCount = 0;
    let closedCount = 0;
    let criticalCount = 0;
    let resolvedToday = 0;

    const statusColIdx = detectedStatusColName ? headers.indexOf(detectedStatusColName) : -1;
    const msInDay = 24 * 60 * 60 * 1000;
    const criticalThresholdMs = 3 * msInDay; // 3 days

    // Find latest timestamp for "today" calculation
    let maxTimeMs = 0;
    filteredRows.forEach(row => {
      const t = new Date(row.timestamp).getTime();
      if (t > maxTimeMs) maxTimeMs = t;
    });
    const todayCutoffMs = maxTimeMs - msInDay;

    filteredRows.forEach(row => {
      // 1. Open/Closed calculations
      let isOpen = true;
      let isClosed = false;
      if (statusColIdx !== -1) {
        const s = (row.rawData[statusColIdx] || "").toLowerCase();
        isClosed = s.includes("close") || s.includes("resolve") || s.includes("complete") || s.includes("done");
        isOpen = s.includes("open") || s.includes("new") || s.includes("active") || s.includes("pending") || s.includes("escalat") || !isClosed;
      } else {
        // Fallback: if age is > 24h, treat as open, else resolved
        isOpen = row.ageMs > msInDay;
        isClosed = !isOpen;
      }

      if (isOpen) openCount++;
      if (isClosed) closedCount++;

      // 2. Critical cases (> 3 days aging)
      if (row.ageMs >= criticalThresholdMs && isOpen) {
        criticalCount++;
      }

      // 3. Resolved today
      if (isClosed) {
        const t = new Date(row.timestamp).getTime();
        if (t >= todayCutoffMs) {
          resolvedToday++;
        }
      }
    });

    return {
      totalCount,
      openCount,
      closedCount,
      avgAgingMs: activeStats?.avgAgeMs || 0,
      criticalCount,
      resolvedToday
    };
  }, [filteredRows, headers, detectedStatusColName, activeStats]);

  // Aging distribution segmented by days
  const agingDistribution = useMemo(() => {
    let g1 = 0; // 0-1 days
    let g2 = 0; // 1-3 days
    let g3 = 0; // 3-7 days
    let g4 = 0; // 7+ days

    const msInDay = 24 * 60 * 60 * 1000;
    filteredRows.forEach(row => {
      const d = row.ageMs / msInDay;
      if (d <= 1) g1++;
      else if (d <= 3) g2++;
      else if (d <= 7) g3++;
      else g4++;
    });

    const total = filteredRows.length || 1;
    return [
      { label: "0–1 Days", count: g1, percentage: (g1 / total) * 100, color: "#10b981" },
      { label: "1–3 Days", count: g2, percentage: (g2 / total) * 100, color: "#3b82f6" },
      { label: "3–7 Days", count: g3, percentage: (g3 / total) * 100, color: "#f97316" },
      { label: "7+ Days", count: g4, percentage: (g4 / total) * 100, color: "#ef4444" }
    ];
  }, [filteredRows]);

  // Aging metrics computed dynamically by Status name or fallbacks
  const statusChartsData = useMemo(() => {
    const activeCategories = Object.keys(columnCategoryFilters);
    const groupbyCol = detectedStatusColName || activeCategories[0] || "";
    if (!stats || !groupbyCol) return [];

    const colIdx = headers.indexOf(groupbyCol);
    if (colIdx === -1) return [];

    const counts: Record<string, { count: number; sumAgeMs: number; maxAgeMs: number }> = {};
    
    filteredRows.forEach(row => {
      const rawVal = row.rawData[colIdx] || "Unknown";
      const statusVal = rawVal.trim() === "" ? "Empty" : rawVal;
      if (!counts[statusVal]) {
        counts[statusVal] = { count: 0, sumAgeMs: 0, maxAgeMs: 0 };
      }
      counts[statusVal].count += 1;
      counts[statusVal].sumAgeMs += row.ageMs;
      if (row.ageMs > counts[statusVal].maxAgeMs) {
        counts[statusVal].maxAgeMs = row.ageMs;
      }
    });

    return Object.entries(counts).map(([name, data]) => ({
      name,
      count: data.count,
      avgAgeMs: data.sumAgeMs / data.count,
      maxAgeMs: data.maxAgeMs
    })).sort((a, b) => b.count - a.count).slice(0, 5); // top 5 categories
  }, [filteredRows, headers, detectedStatusColName, columnCategoryFilters, stats]);

  // Escalation priority view: Top 5 unresolved cases sorting by highest ageing
  const priorityCases = useMemo(() => {
    let unresolved = [...filteredRows];
    if (detectedStatusColName) {
      const statusIdx = headers.indexOf(detectedStatusColName);
      if (statusIdx !== -1) {
        unresolved = unresolved.filter(row => {
          const s = (row.rawData[statusIdx] || "").toLowerCase();
          return !s.includes("close") && !s.includes("resolve") && !s.includes("complete") && !s.includes("done");
        });
      }
    }
    // Sort descending by age (oldest first)
    unresolved.sort((a, b) => b.ageMs - a.ageMs);
    return unresolved.slice(0, 5);
  }, [filteredRows, headers, detectedStatusColName]);

  // Status Wise Escalation Matrix memo computation
  const statusWiseSlaMatrix = useMemo(() => {
    const matrix: Record<string, Record<string, number>> = {};
    targetStatusLabels.forEach(label => {
      matrix[label] = {
        "Within SLA": 0,
        "Level 1": 0,
        "Level 2": 0,
        "Level 3": 0,
        "Total": 0
      };
    });

    filteredRowsWithoutEscalation.forEach(row => {
      const label = matchRowToStatusLabel(row.rawStatus || "");
      const lvl = row.escalationLevel || "Within SLA";
      if (matrix[label]) {
        matrix[label][lvl] += 1;
        matrix[label]["Total"] += 1;
      }
    });

    return targetStatusLabels.map(label => ({
      status: label,
      "Within SLA": matrix[label]["Within SLA"],
      "Level 1": matrix[label]["Level 1"],
      "Level 2": matrix[label]["Level 2"],
      "Level 3": matrix[label]["Level 3"],
      "Total": matrix[label]["Total"]
    }));
  }, [filteredRowsWithoutEscalation]);

  // Escalation Donut Data memo computation for interactive chart
  const escalationDonutData = useMemo(() => {
    const total = slaCounts.withinSLA + slaCounts.level1 + slaCounts.level2 + slaCounts.level3;
    const makePct = (val: number) => total > 0 ? (val / total) * 100 : 0;
    return [
      { label: "Within SLA", count: slaCounts.withinSLA, percentage: makePct(slaCounts.withinSLA), color: "#10b981" },
      { label: "Level 1", count: slaCounts.level1, percentage: makePct(slaCounts.level1), color: "#f59e0b" },
      { label: "Level 2", count: slaCounts.level2, percentage: makePct(slaCounts.level2), color: "#f97316" },
      { label: "Level 3", count: slaCounts.level3, percentage: makePct(slaCounts.level3), color: "#ef4444" }
    ];
  }, [slaCounts]);

  // Handle Export Excel Sheet strictly from currently filtered rows
  const handleExportExcel = () => {
    if (!stats || sortedAndFilteredRows.length === 0) return;
    
    const dataToExport = sortedAndFilteredRows.map((row, idx) => {
      const item: Record<string, any> = {
        "Index": idx + 1,
        "Timestamp": row.timestamp,
        "Calendar Age (Days/Hours)": computeAgeText(row.ageMs, "days-hours"),
        "Working Age (Days Hours)": row.workingAgeText || "0 Days 0 Hours",
        "Escalation Level": row.escalationLevel || "Within SLA",
        "SLA Threshold": row.slaThreshold || "",
        "Remaining Time To Next Escalation": row.remainingTimeText || "",
        "Primary Msg": row.message,
      };
      // Append all other original parsed values
      headers.forEach((h, hIdx) => {
        item[h] = row.rawData[hIdx] || "";
      });
      return item;
    });

    const worksheet = XLSX.utils.json_to_sheet(dataToExport);
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, "Escalation Matrix Export");
    
    // Auto download
    XLSX.writeFile(workbook, `Sapphire_Escalation_Export_${new Date().toISOString().split('T')[0]}.xlsx`);
  };

  // Sorting handler helper
  const handleSort = (columnKey: string) => {
    if (sortColumn === columnKey) {
      setSortDirection(prev => (prev === "asc" ? "desc" : "asc"));
    } else {
      setSortColumn(columnKey);
      const isSpecialCol = columnKey === "age" || columnKey === "timestamp" || columnKey === selectedTimestampCol;
      setSortDirection(isSpecialCol ? "desc" : "asc");
    }
    setCurrentPage(1);
    setExpandedRowIdx(null);
  };

  // Light Sort arrow text indicators
  const renderSortIndicator = (columnKey: string) => {
    if (sortColumn !== columnKey) {
      return <span className="text-gray-600 group-hover:text-gray-400 transition-colors shrink-0 ml-1 font-mono text-[10px]">↕</span>;
    }
    return (
      <span className="text-orange-500 font-bold shrink-0 ml-1 font-mono text-[10px]">
        {sortDirection === "asc" ? "▲" : "▼"}
      </span>
    );
  };

  // Drag and drop handlers
  const [isDragOver, setIsDragOver] = useState<boolean>(false);
  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragOver(true);
  };
  const handleDragLeave = () => {
    setIsDragOver(false);
  };
  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragOver(false);
    if (e.dataTransfer.files && e.dataTransfer.files[0]) {
      handleFileChange(e.dataTransfer.files[0]);
    }
  };

  // Recharts Custom Tooltips
  const CustomTooltipStatus = ({ active, payload }: any) => {
    if (active && payload && payload.length) {
      const data = payload[0].payload;
      return (
        <div className={`p-3 rounded-xl border text-xs shadow-lg font-sans transition-colors duration-300 ${
          activeTheme === "dark" ? "bg-[#0c0d0f] border-[#1f2228] text-white" : "bg-white border-slate-200 text-slate-800"
        }`}>
          <p className="font-bold mb-1 font-sans">{data.name}</p>
          <div className="space-y-0.5 font-sans">
            <p className={activeTheme === "dark" ? "text-slate-300" : "text-slate-600"}>Cases: <strong className="text-orange-500 font-mono">{data.count}</strong></p>
            <p className={activeTheme === "dark" ? "text-slate-300" : "text-slate-600"}>Avg Age: <strong className="text-blue-500 font-mono">{computeAgeText(data.avgAgeMs, ageDisplayMode)}</strong></p>
          </div>
          <p className="text-red-500 font-semibold text-[9px] mt-2 font-mono">Click bar to toggle filter</p>
        </div>
      );
    }
    return null;
  };

  const CustomTooltipPie = ({ active, payload }: any) => {
    if (active && payload && payload.length) {
      const data = payload[0].payload;
      return (
        <div className={`p-3 rounded-xl border text-xs shadow-lg font-sans transition-colors duration-300 ${
          activeTheme === "dark" ? "bg-[#0c0d0f] border-[#1f2228] text-white" : "bg-white border-slate-200 text-slate-800"
        }`}>
          <p className="font-bold mb-1 font-sans" style={{ color: data.color }}>{data.name}</p>
          <div className="space-y-0.5 font-sans">
            <p className={activeTheme === "dark" ? "text-slate-300" : "text-slate-600"}>Cases: <strong className="font-mono" style={{ color: data.color }}>{data.value}</strong></p>
            <p className={activeTheme === "dark" ? "text-slate-300" : "text-slate-600"}>Share: <strong className="text-indigo-500 font-mono">{data.percentage.toFixed(1)}%</strong></p>
          </div>
          <p className="text-red-500 font-semibold text-[9px] mt-2 font-mono">Click slice to toggle filter</p>
        </div>
      );
    }
    return null;
  };

  return (
    <div id="application-root" className={`min-h-screen flex flex-col font-sans antialiased selection:bg-orange-600 selection:text-white transition-colors duration-300 ${
      activeTheme === "dark" 
        ? "bg-[#07080a] text-[#E2E8F0]" 
        : "bg-[#F8FAFC] text-slate-900"
    }`}>
      
      {/* Premium Ambient Header */}
      <header className={`py-4 px-6 sticky top-0 z-50 shadow-sm transition-colors duration-300 ${
        activeTheme === "dark" ? "bg-[#0c0d0f] border-b border-[#1f2228]" : "bg-white border-b border-gray-200"
      }`}>
        <div className="max-w-7xl mx-auto flex flex-col md:flex-row items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="w-2.5 h-8 bg-orange-500 rounded-sm"></div>
            <div className="text-left">
              <h1 className={`text-base font-bold tracking-tight font-sans leading-tight transition-colors duration-300 ${
                activeTheme === "dark" ? "text-white" : "text-gray-950"
              }`}>
                Escalation Matrix App
              </h1>
              <div className={`text-[11px] font-medium transition-colors duration-300 ${
                activeTheme === "dark" ? "text-gray-400" : "text-gray-600"
              }`}>
                Sapphire Retail Limited <span className="mx-1.5">•</span> Customer Experience Department
              </div>
            </div>
          </div>

          <div className="flex items-center gap-4">
            {/* Clock reference manager */}
            <div className={`flex items-center gap-3 px-3.5 py-2 rounded-lg text-xs font-mono transition-colors duration-300 ${
              activeTheme === "dark" ? "bg-[#121418] border border-[#21242c]" : "bg-slate-50 border border-slate-200 text-slate-800"
            }`}>
              <Clock className="w-4 h-4 text-orange-400 shrink-0" />
              <div className="text-left">
                <span className={`text-[9px] uppercase block tracking-wider font-bold transition-colors duration-300 ${
                  activeTheme === "dark" ? "text-[#A0AEC0]" : "text-slate-500"
                }`}>Analysis Reference Time (NOW)</span>
                <div className="flex items-center gap-2 mt-0.5">
                  {useLiveClock ? (
                    <span className="text-emerald-505 font-bold font-mono text-[11px]">Browser Live Clock</span>
                  ) : (
                    <input
                      type="text"
                      value={referenceTime}
                      onChange={(e) => {
                        setReferenceTime(e.target.value);
                        setCurrentPage(1);
                      }}
                      className={`text-xs font-mono px-2 py-0.5 rounded focus:outline-none focus:border-orange-500 w-44 inline-block transition-colors duration-300 ${
                        activeTheme === "dark" ? "bg-[#0c0d0f] text-[#E2E8F0] border border-[#262a34]" : "bg-white text-slate-900 border-slate-300"
                      }`}
                    />
                  )}
                  <div className={`h-3.5 w-px mx-1 transition-colors duration-300 ${activeTheme === "dark" ? "bg-[#262a34]" : "bg-slate-200"}`}></div>
                  <button
                    type="button"
                    onClick={() => {
                      setUseLiveClock(!useLiveClock);
                      setCurrentPage(1);
                    }}
                    className={`text-[10px] uppercase tracking-wider font-bold px-1.5 py-0.5 rounded cursor-pointer transition-colors duration-300 ${
                      useLiveClock 
                        ? "bg-orange-950/20 text-orange-400 border border-orange-500/25" 
                        : activeTheme === "dark"
                          ? "bg-[#20232a] text-[#E2E8F0] hover:bg-[#2e323c]"
                          : "bg-white text-slate-700 hover:bg-slate-100 border border-slate-200 shadow-xs"
                    }`}
                  >
                    {useLiveClock ? "Lock Reference" : "Set Live Mode"}
                  </button>
                </div>
              </div>
            </div>

            {/* Premium Theme Toggle button */}
            <button
              type="button"
              onClick={toggleTheme}
              className={`p-2.5 rounded-lg border flex items-center justify-center transition-all cursor-pointer ${
                activeTheme === "dark"
                  ? "bg-[#121418] hover:bg-[#1C1F26] border-[#21242c] text-orange-400 hover:text-orange-300 hover:shadow-cyan-500/50"
                  : "bg-white hover:bg-slate-50 border-slate-200 text-slate-800 shadow-xs"
              }`}
              title={activeTheme === "dark" ? "Switch to Light Mode" : "Switch to Dark Mode"}
            >
              {activeTheme === "dark" ? (
                <Sun className="w-4.5 h-4.5 text-orange-400" />
              ) : (
                <Moon className="w-4.5 h-4.5 text-slate-750" />
              )}
            </button>
          </div>
        </div>
      </header>

      {/* Primary Workspace Window Container */}
      <main className="flex-1 w-full max-w-7xl mx-auto px-6 py-8 flex flex-col justify-start">
        
        {/* State Validation Alerts */}
        {parseError && (
          <div id="error-banner" className="mb-6 p-4 bg-red-950/40 border border-red-900/30 text-red-200 rounded-lg flex items-start gap-3 shadow-md max-w-4xl">
            <AlertTriangle className="w-5 h-5 text-red-400 shrink-0 mt-0.5 animate-bounce" />
            <div className="flex-1">
              <h4 className="font-bold text-sm text-red-300">File Ingestion Alert</h4>
              <p className="text-xs text-red-400/90 mt-1">{parseError}</p>
              <button 
                onClick={() => setParseError(null)} 
                className="mt-2 text-[10px] text-red-300/80 hover:text-red-200 underline uppercase tracking-wider font-bold"
              >
                Dismiss notification
              </button>
            </div>
          </div>
        )}

        {/* ==================== 1. IMPORT FILE SCREEN (DEFAULT HOME) ==================== */}
        {step === "import" && (
          <div id="step-import-view" className="space-y-6 max-w-4xl mx-auto w-full py-6">
            <div className="text-center space-y-2 max-w-xl mx-auto mb-4">
              <h2 className="text-xl font-bold tracking-tight text-white">
                Import Analytics Pipeline File
              </h2>
              <p className="text-xs text-[#8E9299]">
                Provide your support CRM logging export. Our high-performance stream analyzer executes immediate age conversions over up to 1.5 million system rows in-browser in mere seconds.
              </p>
            </div>

            {/* Main Interactive Drag Zone */}
            <div
              id="drag-and-drop-workspace"
              onDragOver={handleDragOver}
              onDragLeave={handleDragLeave}
              onDrop={handleDrop}
              className={`border-2 border-dashed rounded-xl p-12 flex flex-col items-center justify-center text-center transition-all cursor-pointer ${
                isDragOver
                  ? "border-[#FF5D22] bg-[#FF5D22]/5"
                  : "border-[#2A2D35] bg-[#121418] hover:border-[#3E424B]"
              }`}
              onClick={() => fileInputRef.current?.click()}
            >
              <Upload className="w-14 h-14 text-orange-500 mb-4 animate-pulse" />
              <h3 className="font-semibold text-white text-sm">
                Drag and drop your file here, or click to browse
              </h3>
              <p className="text-xs text-[#8E9299] mt-1.5 mb-6 max-w-xs">
                Supports Standard CSV datasets (.csv) or Excel spreadsheets (.xlsx, .xls)
              </p>
              
              <button
                type="button"
                className="px-6 py-2.5 bg-orange-600 hover:bg-orange-700 text-white font-semibold text-xs rounded transition shadow-sm border border-orange-500/25 cursor-pointer"
              >
                Choose Local Dataset File
              </button>
              
              <input
                ref={fileInputRef}
                type="file"
                accept=".csv,.xlsx,.xls"
                className="hidden"
                onChange={(e) => e.target.files && e.target.files[0] && handleFileChange(e.target.files[0])}
              />
            </div>

            {/* Error Handlers / Ingestion Logic Descriptions */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div className="bg-[#15171C] p-4 rounded-lg border border-[#2A2D35] flex gap-3">
                <div className="p-2 bg-[#0B0C0E] rounded text-orange-400 self-start">
                  <Database className="w-4 h-4" />
                </div>
                <div>
                  <h4 className="text-xs font-semibold text-white">Stream File Slicing</h4>
                  <p className="text-[11px] text-[#8E9299] mt-1">
                    Reads files incrementally in asynchronous 2MB chunks. Completely eliminates browser page freeze on million-record tables.
                  </p>
                </div>
              </div>

              <div className="bg-[#15171C] p-4 rounded-lg border border-[#2A2D35] flex gap-3">
                <div className="p-2 bg-[#0B0C0E] rounded text-orange-400 self-start">
                  <Cpu className="w-4 h-4" />
                </div>
                <div>
                  <h4 className="text-xs font-semibold text-white">Alternative Parsing fallback</h4>
                  <p className="text-[11px] text-[#8E9299] mt-1">
                    If workbook cells report empty arrays, the analyzer dynamically falls back on UTF-8 stream decoding automatically.
                  </p>
                </div>
              </div>

              <div className="bg-[#15171C] p-4 rounded-lg border border-[#2A2D35] flex gap-3">
                <div className="p-2 bg-[#0B0C0E] rounded text-orange-400 self-start">
                  <Check className="w-4 h-4" />
                </div>
                <div>
                  <h4 className="text-xs font-semibold text-white">Fault-Tolerant Skipping</h4>
                  <p className="text-[11px] text-[#8E9299] mt-1">
                    Instead of stopping the whole execution, invalid dates or split columns are transparently skipped in real-time.
                  </p>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* ==================== 2. COLUMN SELECTION WIZARD STEP ==================== */}
        {step === "column_mapping" && selectedFile && (
          <div id="step-column-mapping-view" className="space-y-6 max-w-4xl mx-auto w-full py-4">
            
            <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 bg-[#1A1D23] px-5 py-3.5 rounded-lg border border-[#2A2D35]">
              <div className="flex items-center gap-3">
                <FileSpreadsheet className="w-5.5 h-5.5 text-orange-500" />
                <div>
                  <span className="font-semibold text-white text-xs block truncate max-w-sm">{selectedFile.name}</span>
                  <span className="text-[10px] text-[#8E9299] block font-mono">
                    File size: {(selectedFile.size / 1024).toLocaleString(undefined, { maximumFractionDigits: 1 })} KB • Standard structure detected
                  </span>
                </div>
              </div>
              <button
                type="button"
                onClick={() => {
                  setSelectedFile(null);
                  setStep("import");
                }}
                className="text-xs text-red-400 hover:text-red-300 hover:underline flex items-center gap-1 cursor-pointer font-semibold"
              >
                <Trash2 className="w-3.5 h-3.5" /> Start Over
              </button>
            </div>

            <div className="bg-[#15171C] rounded-xl border border-[#2A2D35] overflow-hidden">
              <div className="border-b border-[#2A2D35] bg-[#1A1D23] px-6 py-4">
                <h3 className="text-sm font-semibold text-white flex items-center gap-2">
                  <Sparkles className="w-4 h-4 text-orange-500 animate-pulse" />
                  Smart Column Selection Wizard
                </h3>
                <p className="text-[11px] text-[#8E9299] mt-0.5">
                  The parser will index the file using only the selected inputs. All other variables in rows are bypassed for maximum performance.
                </p>
              </div>

              <div className="p-6 space-y-6">
                
                {/* Headers configuration block */}
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  
                  {/* Timestamp header pick */}
                  <div className="space-y-2">
                    <label className="text-white text-xs font-semibold block flex items-center justify-between">
                      Timestamp Track Column (REQUIRED)
                      <span className="text-[10px] text-orange-500 uppercase tracking-wider font-mono font-bold">CORE FIELD</span>
                    </label>
                    <p className="text-[11px] text-[#8E9299] leading-relaxed">
                      This column represents when the activity row took place. Standard Datetime strings, UTC values, or Local offsets are parsed.
                    </p>
                    <select
                      id="timestamp-col-dropdown"
                      value={selectedTimestampCol}
                      onChange={(e) => setSelectedTimestampCol(e.target.value)}
                      className="w-full text-xs font-mono border border-[#2A2D35] bg-[#0E1013] text-white rounded-lg px-3 py-3 focus:outline-none focus:border-orange-500"
                    >
                      <option value="">-- Choose Timestamp Column --</option>
                      {headers.map((h) => (
                        <option key={h} value={h}>{h}</option>
                      ))}
                    </select>
                  </div>

                  {/* Message/Log header pick */}
                  <div className="space-y-2">
                    <label className="text-white text-xs font-semibold block flex items-center justify-between">
                      Activity / Log Message Column (OPTIONAL FALLBACK)
                      <span className="text-[10px] text-[#8E9299] uppercase font-mono">SUPPLEMENTARY</span>
                    </label>
                    <p className="text-[11px] text-[#8E9299] leading-relaxed">
                      Optional text descriptions, notes fields, log contents, or statuses representing the record context.
                    </p>
                    <select
                      id="message-col-dropdown"
                      value={selectedMessageCol}
                      onChange={(e) => setSelectedMessageCol(e.target.value)}
                      className="w-full text-xs font-mono border border-[#2A2D35] bg-[#0E1013] text-white rounded-lg px-3 py-3 focus:outline-none focus:border-orange-500"
                    >
                      <option value="">-- Skip Log Messages (Analysis Mode Only) --</option>
                      {headers.map((h) => (
                        <option key={h} value={h}>{h}</option>
                      ))}
                    </select>
                  </div>

                </div>

                {/* Has headers toggle */}
                <div className="flex items-center gap-3 p-3 bg-[#0E1013] rounded-lg border border-[#2A2D35]/55">
                  <input
                    type="checkbox"
                    id="headers-checkbox"
                    checked={hasHeaders}
                    onChange={(e) => setHasHeaders(e.target.checked)}
                    className="rounded border-[#2A2D35] text-orange-600 focus:ring-0 cursor-pointer h-4 w-4 bg-[#15171C]"
                  />
                  <label htmlFor="headers-checkbox" className="text-xs text-[#E0E0E0] font-sans font-medium cursor-pointer select-none">
                    First line of the uploaded file contains variable labels (headers)
                  </label>
                </div>

                {/* Micro preview block */}
                {sampleRows.length > 0 && (
                  <div className="space-y-2">
                    <span className="text-[10px] text-[#8E9299] uppercase tracking-wider block font-bold">Sheet Structure Preview</span>
                    <div className="overflow-x-auto border border-[#2A2D35]/60 rounded-lg">
                      <table className="w-full text-left text-[10px] font-mono whitespace-nowrap">
                        <thead>
                          <tr className="bg-[#1A1D23] text-[#8E9299] border-b border-[#2A2D35]">
                            {headers.map(h => (
                              <th key={h} className={`px-3 py-2 border-r border-[#2A2D35] ${h === selectedTimestampCol ? "text-orange-400 bg-orange-950/20" : ""}`}>
                                {h}
                              </th>
                            ))}
                          </tr>
                        </thead>
                        <tbody>
                          {sampleRows.map((row, idx) => (
                            <tr key={idx} className="border-b border-[#2A2D35]/40 hover:bg-[#1A1D23]/25 bg-[#0B0C0E]/20 text-[#C0C0C0]">
                              {headers.map(h => (
                                <td key={h} className={`px-3 py-1.5 border-r border-[#2A2D35]/40 truncate max-w-[200px] ${h === selectedTimestampCol ? "bg-orange-950/5 font-semibold text-[#E0E0E0]" : ""}`}>
                                  {row[h] || "-"}
                                </td>
                              ))}
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </div>
                )}

              </div>

              {/* Action Nav block */}
              <div className="px-6 py-4 bg-[#1A1D23] border-t border-[#2A2D35] flex items-center justify-between">
                <button
                  type="button"
                  onClick={() => {
                    setSelectedFile(null);
                    setStep("import");
                  }}
                  className="px-4 py-2 border border-[#2A2D35] text-xs text-[#8E9299] hover:text-white rounded transition cursor-pointer"
                >
                  Choose Different File
                </button>

                <button
                  type="button"
                  onClick={startProcessingWorkflow}
                  disabled={!selectedTimestampCol}
                  className={`px-6 py-2 rounded text-xs font-semibold flex items-center gap-1.5 cursor-pointer border border-orange-500/20 transition-all ${
                    selectedTimestampCol
                      ? "bg-orange-600 hover:bg-orange-700 text-white"
                      : "bg-[#2A2D35] text-[#8E9299] cursor-not-allowed"
                  }`}
                >
                  Start Stream Analysis
                  <ArrowRight className="w-4 h-4" />
                </button>
              </div>

            </div>

          </div>
        )}

        {/* ==================== 3. PROCESSING LOADER ==================== */}
        {step === "processing" && (
          <div id="step-processing-view" className="py-20 flex flex-col items-center justify-center max-w-xl mx-auto text-center space-y-6">
            <div className="relative">
              <div className="w-16 h-16 border-4 border-orange-500/10 border-t-4 border-t-orange-500 rounded-full animate-spin"></div>
              <div className="absolute inset-0 flex items-center justify-center">
                <Cpu className="w-5 h-5 text-orange-500 animate-pulse" />
              </div>
            </div>

            <div className="space-y-2">
              <h3 className="font-sans font-bold text-white text-base">
                Streaming & Parsing Record Logs
              </h3>
              <p className="text-xs text-[#8E9299]">
                Reading file slices in 2MB asynchronous windows to conserve memory usage.
              </p>
            </div>

            {/* Custom high-tech progress bars */}
            <div className="w-full bg-[#1A1D23] border border-[#2A2D35] p-4 rounded-xl space-y-3.5">
              <div className="flex items-center justify-between text-xs font-mono">
                <span className="text-[#8E9299]">Overall Parsing Ratio</span>
                <span className="text-orange-400 font-bold">{progress}%</span>
              </div>
              <div className="w-full bg-[#0E1013] h-2.5 rounded-full overflow-hidden">
                <div 
                  className="bg-orange-500 h-2.5 rounded-full transition-all duration-150"
                  style={{ width: `${progress}%` }}
                ></div>
              </div>

              <div className="flex items-center justify-between text-xs pt-2.5 border-t border-[#2A2D35]/65">
                <div className="flex items-center gap-1.5 text-[#8E9299]">
                  <Database className="w-3.5 h-3.5 text-orange-500" />
                  <span>Total Parsed Rows:</span>
                </div>
                <strong className="font-mono text-white text-sm">
                  {linesProcessed.toLocaleString()}
                </strong>
              </div>
            </div>

            <span className="text-[10px] text-[#8E9299] font-mono tracking-widest uppercase">
              Thread Idle Time: 0ms • Buffered Stream Buffers active
            </span>
          </div>
        )}
        {/* ==================== 4 & 5. TIMESTAMP ANALYSIS + AGE SUMMARY DASHBOARD ==================== */}
        {step === "dashboard" && stats && (
          <div id="step-dashboard-view" className="space-y-6 animate-fadeIn w-full">
            
            {/* 1. TOP OVERVIEW / ACTION HEADER */}
            <div className={`flex flex-col md:flex-row items-start md:items-center justify-between gap-4 border-b pb-5 transition-colors duration-300 ${
              activeTheme === "dark" ? "border-slate-800" : "border-slate-250"
            }`}>
              <div>
                <h2 className={`text-2xl font-bold tracking-tight font-sans ${
                  activeTheme === "dark" ? "text-white" : "text-slate-900"
                }`}>
                  Dashboard
                </h2>
                <div className={`text-xs mt-1 font-medium font-sans ${
                  activeTheme === "dark" ? "text-slate-400" : "text-slate-600"
                }`}>
                  Sapphire Retail Limited <span className="mx-1.5">•</span> Customer Experience Department
                </div>
                <div className={`text-[11px] font-mono mt-1 ${
                  activeTheme === "dark" ? "text-slate-500" : "text-slate-500"
                }`}>
                  Date Calculation Based: {getActiveReferenceTime().toUTCString()}
                </div>
              </div>

              <div className="flex items-center gap-3">
                <button
                  type="button"
                  onClick={handleExportExcel}
                  className="px-4 py-2 bg-emerald-600 hover:bg-emerald-700 border border-emerald-500/10 text-white text-xs font-semibold rounded-lg flex items-center gap-2 transition cursor-pointer shadow-sm font-sans"
                >
                  <FileSpreadsheet className="w-4 h-4" /> Export Excel
                </button>

                <button
                  type="button"
                  onClick={() => {
                    setSelectedFile(null);
                    setStats(null);
                    setExpandedRowIdx(null);
                    setSelectedCategoryFilters({});
                    setSortColumn(null);
                    setSortDirection("desc");
                    setSearchQuery("");
                    setDateStartFilter("");
                    setDateEndFilter("");
                    setMinAgeHours("");
                    setMaxAgeHours("");
                    setPageSize(50);
                    setCurrentPage(1);
                    setStep("import");
                  }}
                  className={`px-4 py-2 border text-xs font-semibold rounded-lg flex items-center gap-2 transition cursor-pointer font-sans transition-colors duration-300 ${
                    activeTheme === "dark"
                      ? "bg-[#121418] hover:bg-[#1a1c22] border-[#21242c] text-white"
                      : "bg-white hover:bg-slate-50 border-slate-200 text-slate-800 shadow-xs"
                  }`}
                >
                  <ArrowLeft className="w-4 h-4" /> Reset Workspace
                </button>
              </div>
            </div>

            {/* 2. REQUIRED HORIZONTAL SUMMARY CARDS */}
            <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4">
              {/* Total Cases */}
              <div className={`p-4 rounded-xl space-y-1.5 transition-colors duration-300 border ${
                activeTheme === "dark" 
                  ? "bg-[#0c0d0f]/80 border-slate-800/80 text-white" 
                  : "bg-white border-slate-200 text-slate-900 shadow-xs"
              }`}>
                <span className={`text-[10px] uppercase font-bold block tracking-wider ${
                  activeTheme === "dark" ? "text-slate-400" : "text-slate-500"
                }`}>Total Active Cases</span>
                <div className="flex items-baseline gap-1.5">
                  <strong className={`text-2xl font-bold font-mono tracking-tight transition-colors duration-300 ${
                    activeTheme === "dark" ? "text-white" : "text-slate-990"
                  }`}>
                    {dashboardMetrics.totalCount.toLocaleString()}
                  </strong>
                  <span className={`text-[10px] font-sans ${activeTheme === "dark" ? "text-slate-500" : "text-slate-400"}`}>rows</span>
                </div>
              </div>

              {/* Open Cases */}
              <div className={`p-4 rounded-xl space-y-1.5 transition-colors duration-300 border ${
                activeTheme === "dark" 
                  ? "bg-[#0c0d0f]/80 border-slate-800/80" 
                  : "bg-white border-slate-200 text-slate-900 shadow-xs"
              }`}>
                <span className={`text-[10px] uppercase font-bold block tracking-wider ${
                  activeTheme === "dark" ? "text-slate-400" : "text-slate-500"
                }`}>Open Cases</span>
                <div className="flex items-baseline gap-1.5">
                  <strong className="text-2xl font-bold font-mono text-orange-550 tracking-tight">
                    {dashboardMetrics.openCount.toLocaleString()}
                  </strong>
                  <span className={`text-[10px] font-sans ${activeTheme === "dark" ? "text-slate-500" : "text-slate-400"}`}>pending</span>
                </div>
              </div>

              {/* Closed Cases */}
              <div className={`p-4 rounded-xl space-y-1.5 transition-colors duration-300 border ${
                activeTheme === "dark" 
                  ? "bg-[#0c0d0f]/80 border-slate-800/80" 
                  : "bg-white border-slate-200 text-slate-900 shadow-xs"
              }`}>
                <span className={`text-[10px] uppercase font-bold block tracking-wider ${
                  activeTheme === "dark" ? "text-slate-400" : "text-slate-500"
                }`}>Closed Cases</span>
                <div className="flex items-baseline gap-1.5">
                  <strong className="text-2xl font-bold font-mono text-emerald-555 tracking-tight">
                    {dashboardMetrics.closedCount.toLocaleString()}
                  </strong>
                  <span className={`text-[10px] font-sans ${activeTheme === "dark" ? "text-slate-500" : "text-slate-400"}`}>settled</span>
                </div>
              </div>

              {/* Avg Aging */}
              <div className={`p-4 rounded-xl space-y-1.5 transition-colors duration-300 border ${
                activeTheme === "dark" 
                  ? "bg-[#0c0d0f]/80 border-slate-800/80" 
                  : "bg-white border-slate-200 text-slate-900 shadow-xs"
              }`}>
                <span className={`text-[10px] uppercase font-bold block tracking-wider ${
                  activeTheme === "dark" ? "text-slate-400" : "text-slate-500"
                }`}>Avg Aging</span>
                <div className="flex items-baseline gap-1">
                  <strong className={`text-base font-bold font-mono tracking-tight leading-none truncate block max-w-full ${
                    activeTheme === "dark" ? "text-blue-400" : "text-blue-600"
                  }`}>
                    {computeAgeText(dashboardMetrics.avgAgingMs, ageDisplayMode)}
                  </strong>
                </div>
              </div>

              {/* Critical Aging Cases */}
              <div className={`p-4 rounded-xl space-y-1.5 transition-colors duration-300 border ${
                activeTheme === "dark" 
                  ? "bg-[#0c0d0f]/80 border-slate-800/80" 
                  : "bg-white border-slate-200 text-slate-900 shadow-xs"
              }`}>
                <span className={`text-[10px] uppercase font-bold block tracking-wider ${
                  activeTheme === "dark" ? "text-slate-400" : "text-slate-500"
                }`}>Critical Unresolved</span>
                <div className="flex items-baseline gap-1.5">
                  <strong className="text-2xl font-bold font-mono text-red-500 tracking-tight">
                    {dashboardMetrics.criticalCount.toLocaleString()}
                  </strong>
                  <span className="text-[10px] text-red-400/90 font-sans">&gt; 3d old</span>
                </div>
              </div>

              {/* Resolved Today */}
              <div className={`p-4 rounded-xl space-y-1.5 transition-colors duration-300 border ${
                activeTheme === "dark" 
                  ? "bg-[#0c0d0f]/80 border-slate-800/80" 
                  : "bg-white border-slate-200 text-slate-900 shadow-xs"
              }`}>
                <span className={`text-[10px] uppercase font-bold block tracking-wider ${
                  activeTheme === "dark" ? "text-slate-400" : "text-slate-500"
                }`}>Resolved Today</span>
                <div className="flex items-baseline gap-1.5">
                  <strong className="text-2xl font-bold font-mono text-indigo-500 tracking-tight">
                    {dashboardMetrics.resolvedToday.toLocaleString()}
                  </strong>
                  <span className={`text-[10px] font-sans ${activeTheme === "dark" ? "text-indigo-400/90" : "text-indigo-600/90"}`}>last 24h</span>
                </div>
              </div>
            </div>

            {/* Business Hours SLA Escalation priority cards */}
            <div className="space-y-2 mt-2">
              <span className={`text-[10px] uppercase font-bold block tracking-wider ${
                activeTheme === "dark" ? "text-[#E2E8F0]/50" : "text-slate-500"
              }`}>Active Business Hours SLA Escalation Matrix Deck</span>
              
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
                
                {/* Within SLA Card */}
                <button
                  type="button"
                  onClick={() => {
                    setSelectedEscalationFilter(prev => prev === "Within SLA" ? "" : "Within SLA");
                    setCurrentPage(1);
                  }}
                  className={`p-4 rounded-xl border text-left transition-all duration-350 relative cursor-pointer overflow-hidden ${
                    selectedEscalationFilter === "Within SLA"
                      ? "ring-2 ring-emerald-500 bg-emerald-950/15 border-emerald-500/70"
                      : activeTheme === "dark"
                        ? "bg-[#0c0d0f]/80 border-slate-800/80 hover:bg-slate-900/40 hover:border-slate-700 text-white"
                        : "bg-white border-slate-200 text-slate-900 hover:bg-slate-50 shadow-sm"
                  }`}
                >
                  <div className="flex justify-between items-start">
                    <span className={`text-[10px] uppercase font-bold block tracking-wider ${
                      activeTheme === "dark" ? "text-slate-400" : "text-slate-500"
                    }`}>Within SLA Cases</span>
                    <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 shrink-0 block mt-1" />
                  </div>
                  <div className="flex items-baseline gap-1.5 mt-2">
                    <strong className="text-3xl font-bold font-mono text-emerald-500 tracking-tight">
                      {slaCounts.withinSLA.toLocaleString()}
                    </strong>
                    <span className={`text-[10px] font-sans ${
                      activeTheme === "dark" ? "text-slate-500" : "text-slate-400"
                    }`}>cases</span>
                  </div>
                  <p className={`text-[10px] mt-1 font-sans ${
                    selectedEscalationFilter === "Within SLA" ? "text-emerald-400 font-semibold" : "text-slate-500"
                  }`}>
                    {selectedEscalationFilter === "Within SLA" ? "● Currently filtering list" : "Click to tag & filter table"}
                  </p>
                </button>

                {/* Level 1 Escalation Card */}
                <button
                  type="button"
                  onClick={() => {
                    setSelectedEscalationFilter(prev => prev === "Level 1" ? "" : "Level 1");
                    setCurrentPage(1);
                  }}
                  className={`p-4 rounded-xl border text-left transition-all duration-350 relative cursor-pointer overflow-hidden ${
                    selectedEscalationFilter === "Level 1"
                      ? "ring-2 ring-amber-500 bg-amber-950/15 border-amber-500/70"
                      : activeTheme === "dark"
                        ? "bg-[#0c0d0f]/80 border-slate-800/80 hover:bg-slate-900/40 hover:border-slate-700 text-white"
                        : "bg-white border-slate-200 text-slate-900 hover:bg-slate-50 shadow-sm"
                  }`}
                >
                  <div className="flex justify-between items-start">
                    <span className={`text-[10px] uppercase font-bold block tracking-wider ${
                      activeTheme === "dark" ? "text-slate-400" : "text-slate-500"
                    }`}>Level 1 Alert</span>
                    <span className="w-1.5 h-1.5 rounded-full bg-amber-550 shrink-0 block mt-1" />
                  </div>
                  <div className="flex items-baseline gap-1.5 mt-2">
                    <strong className="text-3xl font-bold font-mono text-amber-500 tracking-tight">
                      {slaCounts.level1.toLocaleString()}
                    </strong>
                    <span className={`text-[10px] font-sans ${
                      activeTheme === "dark" ? "text-slate-500" : "text-slate-400"
                    }`}>cases</span>
                  </div>
                  <p className={`text-[10px] mt-1 font-sans ${
                    selectedEscalationFilter === "Level 1" ? "text-amber-400 font-semibold" : "text-slate-500"
                  }`}>
                    {selectedEscalationFilter === "Level 1" ? "● Currently filtering list" : "Click to tag & filter table"}
                  </p>
                </button>

                {/* Level 2 Escalation Card */}
                <button
                  type="button"
                  onClick={() => {
                    setSelectedEscalationFilter(prev => prev === "Level 2" ? "" : "Level 2");
                    setCurrentPage(1);
                  }}
                  className={`p-4 rounded-xl border text-left transition-all duration-350 relative cursor-pointer overflow-hidden ${
                    selectedEscalationFilter === "Level 2"
                      ? "ring-2 ring-orange-500 bg-orange-950/15 border-orange-500/70"
                      : activeTheme === "dark"
                        ? "bg-[#0c0d0f]/80 border-slate-800/80 hover:bg-slate-900/40 hover:border-slate-700 text-white"
                        : "bg-white border-slate-200 text-slate-900 hover:bg-slate-50 shadow-sm"
                  }`}
                >
                  <div className="flex justify-between items-start">
                    <span className={`text-[10px] uppercase font-bold block tracking-wider ${
                      activeTheme === "dark" ? "text-slate-400" : "text-slate-500"
                    }`}>Level 2 Alert</span>
                    <span className="w-1.5 h-1.5 rounded-full bg-orange-500 shrink-0 block mt-1" />
                  </div>
                  <div className="flex items-baseline gap-1.5 mt-2">
                    <strong className="text-3xl font-bold font-mono text-orange-500 tracking-tight">
                      {slaCounts.level2.toLocaleString()}
                    </strong>
                    <span className={`text-[10px] font-sans ${
                      activeTheme === "dark" ? "text-slate-500" : "text-slate-400"
                    }`}>cases</span>
                  </div>
                  <p className={`text-[10px] mt-1 font-sans ${
                    selectedEscalationFilter === "Level 2" ? "text-orange-400 font-semibold" : "text-slate-500"
                  }`}>
                    {selectedEscalationFilter === "Level 2" ? "● Currently filtering list" : "Click to tag & filter table"}
                  </p>
                </button>

                {/* Level 3 Escalation Card */}
                <button
                  type="button"
                  onClick={() => {
                    setSelectedEscalationFilter(prev => prev === "Level 3" ? "" : "Level 3");
                    setCurrentPage(1);
                  }}
                  className={`p-4 rounded-xl border text-left transition-all duration-355 relative cursor-pointer overflow-hidden ${
                    selectedEscalationFilter === "Level 3"
                      ? "ring-2 ring-red-500 bg-red-950/15 border-red-500/70"
                      : activeTheme === "dark"
                        ? "bg-[#0c0d0f]/80 border-slate-800/80 hover:bg-slate-900/40 hover:border-slate-700 text-white"
                        : "bg-white border-slate-200 text-slate-900 hover:bg-slate-50 shadow-sm"
                  }`}
                >
                  <div className="flex justify-between items-start">
                    <span className={`text-[10px] uppercase font-bold block tracking-wider ${
                      activeTheme === "dark" ? "text-slate-400" : "text-slate-500"
                    }`}>Level 3 Alert</span>
                    <span className="w-1.5 h-1.5 rounded-full bg-red-500 shrink-0 block mt-1" />
                  </div>
                  <div className="flex items-baseline gap-1.5 mt-2">
                    <strong className="text-3xl font-bold font-mono text-red-500 tracking-tight">
                      {slaCounts.level3.toLocaleString()}
                    </strong>
                    <span className={`text-[10px] font-sans ${
                      activeTheme === "dark" ? "text-slate-500" : "text-slate-400"
                    }`}>cases</span>
                  </div>
                  <p className={`text-[10px] mt-1 font-sans ${
                    selectedEscalationFilter === "Level 3" ? "text-red-405 font-bold animate-pulse" : "text-slate-500"
                  }`}>
                    {selectedEscalationFilter === "Level 3" ? "● Currently filtering list" : "Click to tag & filter table"}
                  </p>
                </button>

              </div>
            </div>

            {/* 3. CHARTS GRID (Escalation Distribution Donut + Status wise Matrix Heatmap) */}
            <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 mt-2">
              
              {/* CHART 1: Escalation Distribution */}
              <div id="chart-escalation-donut" className={`lg:col-span-4 rounded-xl p-5 space-y-4 transition-colors duration-300 border ${
                activeTheme === "dark" 
                  ? "bg-[#0c0d0f]/80 border-slate-800/80 text-white" 
                  : "bg-white border-slate-200 text-slate-900 shadow-xs"
              }`}>
                <div className={`pb-3 border-b transition-colors duration-300 ${
                  activeTheme === "dark" ? "border-slate-800" : "border-slate-100"
                }`}>
                  <h3 className={`text-xs uppercase tracking-wider font-bold ${
                    activeTheme === "dark" ? "text-gray-200" : "text-slate-850"
                  }`}>
                    1. Escalation Level Distribution
                  </h3>
                </div>

                <div className="h-[210px] w-full relative flex items-center justify-center">
                  <ResponsiveContainer width="100%" height="100%">
                    <PieChart>
                      <Tooltip content={<CustomTooltipPie />} />
                      <Pie
                        data={escalationDonutData.map(item => ({
                          name: item.label,
                          value: item.count,
                          percentage: item.percentage,
                          color: item.color
                        }))}
                        innerRadius="58%"
                        outerRadius="82%"
                        paddingAngle={4}
                        dataKey="value"
                        className="cursor-pointer"
                        animationDuration={800}
                        onClick={(e) => {
                          if (e && e.name) {
                            setSelectedEscalationFilter(prev => prev === e.name ? "" : e.name);
                            setCurrentPage(1);
                          }
                        }}
                      >
                        {escalationDonutData.map((entry, index) => (
                          <Cell 
                            key={`cell-${index}`} 
                            fill={entry.color} 
                            stroke={activeTheme === "dark" ? "#07080a" : "#fff"}
                            strokeWidth={2.5}
                            className="hover:opacity-95 hover:scale-102 transition-transform duration-205 origin-center text-xs"
                          />
                        ))}
                      </Pie>
                    </PieChart>
                  </ResponsiveContainer>
                  
                  {/* Center Label */}
                  <div className="absolute flex flex-col items-center justify-center pointer-events-none">
                    <span className={`text-[9px] uppercase font-bold tracking-wider ${activeTheme === "dark" ? "text-slate-500" : "text-slate-400"}`}>Filtered Active</span>
                    <strong className={`text-xl font-bold font-mono tracking-tight ${activeTheme === "dark" ? "text-white" : "text-slate-800"}`}>
                      {filteredRows.length.toLocaleString()}
                    </strong>
                  </div>
                </div>

                {/* Interactive Legend Grid */}
                <div className="grid grid-cols-2 gap-2 pt-1 font-sans">
                  {escalationDonutData.map(seg => {
                    const isSelected = selectedEscalationFilter === seg.label;
                    return (
                      <button 
                        key={seg.label} 
                        type="button"
                        onClick={() => {
                          setSelectedEscalationFilter(prev => prev === seg.label ? "" : seg.label);
                          setCurrentPage(1);
                        }}
                        className={`p-1.5 rounded-lg border text-left flex items-center gap-2 transition cursor-pointer ${
                          isSelected 
                            ? "bg-orange-500/10 border-orange-500" 
                            : activeTheme === "dark" 
                              ? "bg-gray-950/45 border-slate-800 hover:border-slate-700" 
                              : "bg-slate-50 border-slate-200 hover:border-slate-300"
                        }`}
                      >
                        <span className="w-2 h-2 rounded-full shrink-0" style={{ backgroundColor: seg.color }} />
                        <div className="min-w-0">
                          <span className={`text-[9.5px] uppercase font-bold tracking-wider block ${
                            activeTheme === "dark" ? "text-gray-400" : "text-slate-500"
                          }`}>{seg.label}</span>
                          <span className={`font-mono text-[10.5px] font-bold block ${
                            activeTheme === "dark" ? "text-white" : "text-slate-850"
                          }`}>
                            {seg.count.toLocaleString()} <span className="font-sans font-normal text-gray-500 text-[9px]">({seg.percentage.toFixed(0)}%)</span>
                          </span>
                        </div>
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* CHART 2: Status Wise Escalation Heatmap Matrix */}
              <div id="chart-escalation-heatmap" className={`lg:col-span-8 rounded-xl p-5 space-y-4 transition-colors duration-300 border ${
                activeTheme === "dark" 
                  ? "bg-[#0c0d0f]/80 border-slate-800/80 text-white" 
                  : "bg-white border-slate-200 text-slate-900 shadow-xs"
              }`}>
                <div className={`pb-3 border-b transition-colors duration-300 ${
                  activeTheme === "dark" ? "border-slate-800" : "border-slate-100"
                }`}>
                  <h3 className={`text-xs uppercase tracking-wider font-bold ${
                    activeTheme === "dark" ? "text-gray-200" : "text-slate-855"
                  }`}>
                    2. Status Wise Escalation Heatmap (7x4 Matrix)
                  </h3>
                </div>

                <div className="space-y-2 pt-1">
                  {/* Heatmap header column names */}
                  <div className="grid grid-cols-12 gap-1.5 text-[9px] uppercase tracking-wider font-bold text-center text-slate-500 font-mono select-none">
                    <div className="col-span-4 text-left pl-1">Status Category</div>
                    <div className="col-span-2 text-emerald-500">Within SLA</div>
                    <div className="col-span-2 text-amber-500">L1 Alert</div>
                    <div className="col-span-2 text-orange-500">L2 Alert</div>
                    <div className="col-span-2 text-red-500">L3 Alert</div>
                  </div>

                  {/* Heatmap Matrix Rows */}
                  <div id="sla-heatmap-matrix" className="space-y-1.5">
                    {statusWiseSlaMatrix.map((row, rIdx) => {
                      const columnsList = ["Within SLA", "Level 1", "Level 2", "Level 3"] as const;
                      
                      return (
                        <div key={rIdx} className="grid grid-cols-12 gap-1.5 items-center">
                          {/* Row title status label */}
                          <div 
                            className={`col-span-4 text-[10px] font-sans truncate font-medium pr-1 select-none ${
                              activeTheme === "dark" ? "text-slate-350" : "text-slate-700"
                            }`}
                            title={row.status}
                          >
                            {row.status.replace("Pending at ", "")}
                          </div>

                          {/* Matrix cells */}
                          {columnsList.map((colKey) => {
                            const val = row[colKey];
                            
                            // Cell visual styling based on level and value
                            let cellStyle = "";
                            if (val === 0) {
                              cellStyle = activeTheme === "dark" 
                                ? "bg-transparent text-slate-800 border-slate-950" 
                                : "bg-slate-50/50 text-slate-240 border-slate-100/70";
                            } else {
                              if (colKey === "Within SLA") {
                                cellStyle = "bg-emerald-500/10 hover:bg-emerald-500/20 text-emerald-400 border-emerald-500/25";
                              } else if (colKey === "Level 1") {
                                cellStyle = "bg-amber-500/10 hover:bg-amber-500/20 text-amber-500 border-amber-500/25";
                              } else if (colKey === "Level 2") {
                                cellStyle = "bg-orange-500/10 hover:bg-orange-500/20 text-orange-400 border-orange-500/25";
                              } else if (colKey === "Level 3") {
                                cellStyle = "bg-red-500/15 hover:bg-red-500/25 text-red-400 border-red-500/35 font-bold";
                              }
                            }

                            // High-contrast neon frame for actively selected filters
                            const isCurrentStatusFiltered = detectedStatusColName && (() => {
                              const filterVal = selectedCategoryFilters[detectedStatusColName] || "";
                              if (!filterVal) return false;
                              return matchRowToStatusLabel(filterVal) === row.status;
                            })();
                            const isCellActivelyFiltered = isCurrentStatusFiltered && selectedEscalationFilter === colKey;

                            const cellHighlighter = isCellActivelyFiltered ? "ring-2 ring-orange-500 border-orange-500 scale-102 font-extrabold" : "border";

                            return (
                              <button
                                key={colKey}
                                type="button"
                                disabled={val === 0 && !isCellActivelyFiltered}
                                onClick={() => {
                                  // Map status cell target column filter index
                                  const statusColIdx = detectedStatusColName ? headers.indexOf(detectedStatusColName) : -1;
                                  if (statusColIdx === -1) return;
                                  
                                  const matchedRawStatus = stats?.previewRows.find(pr => matchRowToStatusLabel(pr.rawData[statusColIdx] || "") === row.status)?.rawData[statusColIdx] || row.status;
                                  
                                  setSelectedCategoryFilters(prev => {
                                    const currFilteredStatus = prev[detectedStatusColName];
                                    const isFilterActive = currFilteredStatus === matchedRawStatus && selectedEscalationFilter === colKey;
                                    
                                    if (isFilterActive) {
                                      setSelectedEscalationFilter("");
                                      return { ...prev, [detectedStatusColName]: "" };
                                    } else {
                                      setSelectedEscalationFilter(colKey);
                                      return { ...prev, [detectedStatusColName]: matchedRawStatus };
                                    }
                                  });
                                  setCurrentPage(1);
                                }}
                                className={`col-span-2 text-center text-[10px] font-mono py-1.5 rounded-md transition duration-200 select-none ${cellStyle} ${cellHighlighter} ${
                                  val > 0 ? "cursor-pointer" : "cursor-default"
                                }`}
                                title={`${row.status} • ${colKey}: ${val} Cases`}
                              >
                                {val}
                              </button>
                            );
                          })}
                        </div>
                      );
                    })}
                  </div>
                </div>

                <div className="flex items-center justify-between text-[9px] text-slate-500 font-mono pt-3 border-t border-slate-500/10 mb-0">
                  <span>* Click cell to filter status & escalation tag</span>
                  <div className="flex items-center gap-2">
                    <span className="flex items-center gap-1"><span className="w-1.5 h-1.5 rounded-full bg-emerald-500" /> Active SLA</span>
                    <span className="flex items-center gap-1"><span className="w-1.5 h-1.5 rounded-full bg-red-500" /> Incident SLA</span>
                  </div>
                </div>

              </div>

            </div>

            {/* 4. MASTER COMPACT DATA VIEWPORT ZONE */}
            <div className="space-y-4">
              
              {/* Dataset control panel containing search query and collapsible Dropdown filter trigger */}
              <div className="bg-[#0c0d0f] border border-[#1f2228] rounded-xl p-4 flex flex-col md:flex-row items-stretch md:items-center justify-between gap-4">
                <div className="space-y-1">
                  <h3 className="text-sm font-bold text-white flex items-center gap-2">
                    <Database className="w-4 h-4 text-orange-400" />
                    Operational Grid Table Room
                  </h3>
                  <p className="text-[11px] text-gray-400 leading-none font-sans">
                    Currently rendering <span className="text-white font-bold font-mono">{sortedAndFilteredRows.length}</span> active cases from master file stream
                  </p>
                </div>

                {/* Filters Trigger + Reset Action Panel */}
                <div className="flex flex-wrap items-center gap-3">
                  {/* Collapsible dropdown filter panel button trigger */}
                  <button
                    type="button"
                    onClick={() => setIsFilterOpen(!isFilterOpen)}
                    className={`px-4 py-2 text-xs font-bold rounded flex items-center gap-2 border transition-all cursor-pointer font-sans ${
                      isFilterOpen 
                        ? "bg-orange-600 border-orange-500 text-white shadow" 
                        : "bg-gray-950 border-[#1f2228] hover:border-gray-500 text-white hover:bg-gray-900"
                    }`}
                  >
                    <Filter className="w-4 h-4" /> 
                    <span>Filters Selection</span>
                    <span className="text-[10px] font-mono">{isFilterOpen ? "▲" : "▼"}</span>
                  </button>

                  <select
                    value={pageSize}
                    onChange={(e) => {
                      setPageSize(Number(e.target.value));
                      setCurrentPage(1);
                    }}
                    className="bg-gray-950 border border-[#1f2228] text-white text-xs rounded px-3 py-2 font-mono focus:outline-none focus:border-orange-500"
                  >
                    <option value={10}>Show 10 Rows</option>
                    <option value={20}>Show 20 Rows</option>
                    <option value={50}>Show 50 Rows</option>
                    <option value={100}>Show 100 Rows</option>
                    <option value={500}>Show 500 Rows</option>
                  </select>

                  <div className="flex bg-gray-950 p-0.5 rounded border border-[#1f2228] text-xs">
                    <button
                      type="button"
                      onClick={() => setAgeDisplayMode("days-hours")}
                      className={`px-3 py-1.5 text-[10px] uppercase font-bold rounded transition-colors cursor-pointer ${
                        ageDisplayMode === "days-hours"
                          ? "bg-[#21242c] text-white"
                          : "text-gray-450 hover:text-white"
                      }`}
                    >
                      Days & Hrs
                    </button>
                    <button
                      type="button"
                      onClick={() => setAgeDisplayMode("total-hours")}
                      className={`px-3 py-1.5 text-[10px] uppercase font-bold rounded transition-colors cursor-pointer ${
                        ageDisplayMode === "total-hours"
                          ? "bg-[#21242c] text-white"
                          : "text-gray-455 hover:text-white"
                      }`}
                    >
                      Total Hrs
                    </button>
                  </div>
                </div>
              </div>

              {/* Collapsible Dropdown Filter Smooth Panel containing Status, Date, Network, Message Type, Age, Search */}
              {isFilterOpen && (
                <div className="bg-[#0c0d0f] border border-[#1f2228] rounded-xl p-5 space-y-4 animate-slideDown shadow-lg">
                  <div className="flex items-center justify-between border-b border-[#1f2228] pb-2">
                    <span className="text-xs font-bold text-orange-400 uppercase tracking-widest font-sans">
                      Corporate Filters Configuration Dashboard
                    </span>
                    <button 
                      onClick={() => setIsFilterOpen(false)}
                      className="text-gray-400 hover:text-white text-xs font-bold font-mono"
                    >
                      [ Close Panel ✕ ]
                    </button>
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
                    {/* Filter 1: Universal Search input */}
                    <div className="space-y-1.5">
                      <label className="text-[10px] text-gray-400 font-bold uppercase tracking-wider block font-sans">
                        Search Log Records
                      </label>
                      <div className="relative">
                        <Search className="w-3.5 h-3.5 text-gray-500 absolute left-3 top-1/2 -translate-y-1/2" />
                        <input
                          type="text"
                          placeholder="Search any keyword or columns..."
                          value={searchQuery}
                          onChange={(e) => {
                            setSearchQuery(e.target.value);
                            setCurrentPage(1);
                          }}
                          className="w-full pl-9 pr-3 py-2 bg-gray-950 border border-[#1f2228] rounded text-xs text-white placeholder-gray-650 focus:outline-none focus:border-orange-500 font-mono"
                        />
                      </div>
                    </div>

                    {/* Filter 2: Custom Category filters (Status & Network) mapped cleanly */}
                    {(Object.entries(columnCategoryFilters) as [string, string[]][]).map(([colName, uniqueValues]) => {
                      const isStatusCol = colName === detectedStatusColName;
                      const isNetworkCol = colName === detectedNetworkColName;
                      const currentValue = selectedCategoryFilters[colName] || "";
                      
                      return (
                        <div key={colName} className="space-y-1.5">
                          <label className="text-[10px] text-gray-400 font-bold uppercase tracking-wider block truncate font-sans" title={colName}>
                            Filter by {colName} {isStatusCol ? "(Status)" : isNetworkCol ? "(Source Network)" : ""}
                          </label>
                          <select
                            value={currentValue}
                            onChange={(e) => {
                              setSelectedCategoryFilters(prev => ({
                                ...prev,
                                [colName]: e.target.value
                              }));
                              setCurrentPage(1);
                            }}
                            className="w-full py-2 bg-gray-950 border border-[#1f2228] rounded text-xs text-white focus:outline-none focus:border-orange-500 font-mono"
                          >
                            <option value="">-- All Mappings ({uniqueValues.length} discrete) --</option>
                            {uniqueValues.map(v => (
                              <option key={v} value={v}>{v}</option>
                            ))}
                          </select>
                        </div>
                      );
                    })}

                    {/* Filter 3: Date Timeline filter interval */}
                    <div className="space-y-1.5">
                      <label className="text-[10px] text-gray-400 font-bold uppercase tracking-wider block font-sans">
                        Timeline Interval (Start Date)
                      </label>
                      <div className="relative">
                        <Calendar className="w-3.5 h-3.5 text-gray-500 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
                        <input
                          type="date"
                          value={dateStartFilter}
                          onChange={(e) => {
                            setDateStartFilter(e.target.value);
                            setCurrentPage(1);
                          }}
                          className="w-full pl-9 pr-3 py-2 bg-gray-950 border border-[#1f2228] rounded text-xs text-white focus:outline-none focus:border-orange-500 font-mono cursor-pointer"
                        />
                      </div>
                    </div>

                    {/* Filter 4: Date Timeline filter interval (End) */}
                    <div className="space-y-1.5">
                      <label className="text-[10px] text-gray-400 font-bold uppercase tracking-wider block font-sans">
                        Timeline Interval (End Date)
                      </label>
                      <div className="relative">
                        <Calendar className="w-3.5 h-3.5 text-gray-500 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
                        <input
                          type="date"
                          value={dateEndFilter}
                          onChange={(e) => {
                            setDateEndFilter(e.target.value);
                            setCurrentPage(1);
                          }}
                          className="w-full pl-9 pr-3 py-2 bg-gray-950 border border-[#1f2228] rounded text-xs text-white focus:outline-none focus:border-orange-500 font-mono cursor-pointer"
                        />
                      </div>
                    </div>

                    {/* Filter 5: Numeric Age filter interval bounds (Min/Max Hours) */}
                    <div className="space-y-1.5 col-span-1 md:col-span-2 lg:col-span-1">
                      <label className="text-[10px] text-gray-400 font-bold uppercase tracking-wider block font-sans">
                        Computed Age limits (Hours interval)
                      </label>
                      <div className="grid grid-cols-2 gap-2">
                        <input
                          type="number"
                          placeholder="Min (hrs)"
                          value={minAgeHours}
                          onChange={(e) => {
                            setMinAgeHours(e.target.value);
                            setCurrentPage(1);
                          }}
                          className="w-full px-3 py-2 bg-gray-950 border border-[#1f2228] rounded text-xs text-white placeholder-gray-700 focus:outline-none focus:border-orange-500 font-mono animate-none"
                        />
                        <input
                          type="number"
                          placeholder="Max (hrs)"
                          value={maxAgeHours}
                          onChange={(e) => {
                            setMaxAgeHours(e.target.value);
                            setCurrentPage(1);
                          }}
                          className="w-full px-3 py-2 bg-gray-950 border border-[#1f2228] rounded text-xs text-white placeholder-gray-700 focus:outline-none focus:border-orange-500 font-mono animate-none"
                        />
                      </div>
                    </div>
                  </div>

                  <div className="pt-2.5 flex items-center justify-between border-t border-[#1f2228]/50">
                    <span className="text-[11px] text-gray-500 font-mono">
                      Calculations will auto-update across chronological charts and tables instantly
                    </span>
                    <button
                      type="button"
                      onClick={clearCategoryFilters}
                      className="text-xs text-orange-400 hover:text-orange-300 font-bold flex items-center gap-1.5 hover:underline cursor-pointer font-sans"
                    >
                      <Trash2 className="w-3.5 h-3.5" /> Clear All Filters
                    </button>
                  </div>
                </div>
              )}

              {/* ACTIVE FILTER BADGES ROW (Instagram, status level, etc.) */}
              {(searchQuery.trim() !== "" || 
                Object.values(selectedCategoryFilters).some(v => v !== "") ||
                dateStartFilter !== "" || 
                dateEndFilter !== "" || 
                minAgeHours !== "" || 
                maxAgeHours !== "") && (
                <div className="flex flex-wrap items-center gap-2 pt-1 font-mono">
                  <span className="text-[10px] text-gray-500 font-bold uppercase mr-1 font-sans">Active Filters:</span>
                  
                  {searchQuery.trim() !== "" && (
                    <span className="text-[10px] bg-gray-900 border border-[#1f2228] text-white pl-2.5 pr-1.5 py-1 rounded-full flex items-center gap-1.5">
                      <span>Search: "{searchQuery}"</span>
                      <button onClick={() => { setSearchQuery(""); setCurrentPage(1); }} className="hover:text-red-400 text-gray-500 font-bold text-[11px] leading-none px-1">✕</button>
                    </span>
                  )}

                  {Object.entries(selectedCategoryFilters).map(([col, val]) => (
                    val !== "" ? (
                      <span key={col} className="text-[10px] bg-orange-950/20 border border-orange-500/20 text-orange-400 pl-2.5 pr-1.5 py-1 rounded-full flex items-center gap-1.5">
                        <span>{val}</span>
                        <button onClick={() => {
                          setSelectedCategoryFilters(prev => ({ ...prev, [col]: "" }));
                          setCurrentPage(1);
                        }} className="hover:text-red-450 text-orange-300 font-bold text-[11px] leading-none px-1">✕</button>
                      </span>
                    ) : null
                  ))}

                  {dateStartFilter !== "" && (
                    <span className="text-[10px] bg-blue-950/20 border border-blue-500/20 text-blue-400 pl-2.5 pr-1.5 py-1 rounded-full flex items-center gap-1.5">
                      <span>After: {dateStartFilter}</span>
                      <button onClick={() => { setDateStartFilter(""); setCurrentPage(1); }} className="hover:text-red-405 text-gray-500 font-bold text-[11px] leading-none px-1">✕</button>
                    </span>
                  )}

                  {dateEndFilter !== "" && (
                    <span className="text-[10px] bg-blue-950/20 border border-blue-500/20 text-blue-400 pl-2.5 pr-1.5 py-1 rounded-full flex items-center gap-1.5">
                      <span>Before: {dateEndFilter}</span>
                      <button onClick={() => { setDateEndFilter(""); setCurrentPage(1); }} className="hover:text-red-405 text-gray-500 font-bold text-[11px] leading-none px-1">✕</button>
                    </span>
                  )}

                  {minAgeHours !== "" && (
                    <span className="text-[10px] bg-indigo-950/20 border border-indigo-500/20 text-indigo-400 pl-2.5 pr-1.5 py-1 rounded-full flex items-center gap-1.5">
                      <span>Age &gt;= {minAgeHours}h</span>
                      <button onClick={() => { setMinAgeHours(""); setCurrentPage(1); }} className="hover:text-red-405 text-gray-500 font-bold text-[11px] leading-none px-1">✕</button>
                    </span>
                  )}

                  {maxAgeHours !== "" && (
                    <span className="text-[10px] bg-indigo-950/20 border border-indigo-500/20 text-indigo-400 pl-2.5 pr-1.5 py-1 rounded-full flex items-center gap-1.5">
                      <span>Age &lt;= {maxAgeHours}h</span>
                      <button onClick={() => { setMaxAgeHours(""); setCurrentPage(1); }} className="hover:text-red-405 text-gray-500 font-bold text-[11px] leading-none px-1">✕</button>
                    </span>
                  )}

                  <button 
                    onClick={clearCategoryFilters}
                    className="text-[10px] text-red-400 hover:text-red-300 underline font-sans font-bold ml-1.5"
                  >
                    Clear All
                  </button>
                </div>
              )}

              {/* 5. DATA TABLE RENDER (Simplified columns layout) */}
              <div className="bg-[#0c0d0f] border border-[#1f2228] rounded-xl overflow-hidden shadow-sm">
                <div className="overflow-x-auto overflow-y-auto max-h-[580px] relative scrollbar-thin scrollbar-thumb-orange-600/20">
                  <table className="w-full text-left font-sans text-xs whitespace-nowrap table-auto select-none">
                    
                    {/* SLA Priority Aware Table Header */}
                    <thead className="sticky top-0 bg-[#0c0d0f] border-b border-[#1f2228] z-20">
                      <tr className="text-gray-400 uppercase text-[10px] tracking-wider font-bold">
                        <th className="px-4 py-3 border-r border-[#1f2228] text-center w-14 bg-[#0c0d0f]">No.</th>
                        
                        {/* Timestamp Header */}
                        <th 
                          onClick={() => handleSort("timestamp")}
                          className="px-4 py-3 border-r border-[#1f2228] text-left bg-[#0c0d0f] hover:bg-[#121418] transition cursor-pointer select-none group"
                        >
                          <div className="flex items-center justify-between gap-1.5 text-gray-100">
                            <span>Timestamp</span>
                            {renderSortIndicator("timestamp")}
                          </div>
                        </th>

                        {/* Status Header */}
                        <th 
                          onClick={() => handleSort(detectedStatusColName || "status")}
                          className="px-4 py-3 border-r border-[#1f2228] text-left bg-[#0c0d0f] hover:bg-[#121418] transition cursor-pointer select-none group"
                        >
                          <div className="flex items-center justify-between gap-1.5">
                            <span>Status</span>
                            {renderSortIndicator(detectedStatusColName || "status")}
                          </div>
                        </th>

                        {/* Primary message */}
                        <th className="px-4 py-3 border-r border-[#1f2228] text-left bg-[#0c0d0f] text-gray-300">
                          Primary Message
                        </th>

                        {/* Working Age Header (Business SLA Engine derived) */}
                        <th 
                          onClick={() => handleSort("workingAge")}
                          className="px-4 py-3 border-r border-[#1f2228] text-right bg-[#0c0d0f] hover:bg-[#121418] text-amber-450 font-bold cursor-pointer transition w-[140px] group select-none"
                        >
                          <div className="flex items-center justify-end gap-1.5 text-amber-400">
                            <span>Working Age</span>
                            {renderSortIndicator("workingAge")}
                          </div>
                        </th>

                        {/* Escalation Level Header */}
                        <th 
                          onClick={() => handleSort("escalationLevel")}
                          className="px-4 py-3 border-r border-[#1f2228] text-left bg-[#0c0d0f] hover:bg-[#121418] font-bold cursor-pointer transition w-[130px] group select-none"
                        >
                          <div className="flex items-center justify-between gap-1.5">
                            <span>SLA Status</span>
                            {renderSortIndicator("escalationLevel")}
                          </div>
                        </th>

                        {/* SLA Threshold Header */}
                        <th 
                          onClick={() => handleSort("slaThreshold")}
                          className="px-4 py-3 border-r border-[#1f2228] text-left bg-[#0c0d0f] hover:bg-[#121418] transition cursor-pointer select-none group"
                        >
                          <div className="flex items-center justify-between gap-1.5">
                            <span>SLA Threshold</span>
                            {renderSortIndicator("slaThreshold")}
                          </div>
                        </th>

                        {/* Remaining SLA Time Header */}
                        <th 
                          onClick={() => handleSort("remainingTime")}
                          className="px-4 py-3 border-r border-[#1f2228] text-left bg-[#0c0d0f] hover:bg-[#121418] transition cursor-pointer select-none group"
                        >
                          <div className="flex items-center justify-between gap-1.5">
                            <span>Remaining SLA</span>
                            {renderSortIndicator("remainingTime")}
                          </div>
                        </th>

                        {/* Calendar Age Header */}
                        <th 
                          onClick={() => handleSort("age")}
                          className="px-4 py-3 border-r border-[#1f2228] text-right bg-[#0c0d0f] hover:bg-[#121418] text-gray-400 cursor-pointer transition w-[120px] group select-none"
                        >
                          <div className="flex items-center justify-end gap-1.5 text-slate-400">
                            <span>Calendar Age</span>
                            {renderSortIndicator("age")}
                          </div>
                        </th>

                        {/* Details */}
                        <th className="px-4 py-3 text-center bg-[#0c0d0f] w-[110px] text-gray-400">
                          Details
                        </th>
                      </tr>
                    </thead>

                    <tbody className="divide-y divide-[#1f2228]">
                      {paginatedRows.length === 0 ? (
                        <tr>
                          <td colSpan={10} className="py-24 text-center text-sm text-gray-500">
                            <Info className="w-5 h-5 mx-auto mb-2 text-gray-600 animate-pulse" />
                            No rows matched your active filters or query parameters.
                          </td>
                        </tr>
                      ) : (
                        paginatedRows.map((row, idx) => {
                          const globalIdx = (currentPage - 1) * pageSize + idx + 1;
                          const isExpanded = expandedRowIdx === globalIdx;
                          
                          // Lookups
                          const statusColIdx = detectedStatusColName ? headers.indexOf(detectedStatusColName) : -1;
                          const messageColIdx = detectedMessageColName ? headers.indexOf(detectedMessageColName) : -1;
                          
                          const statusVal = statusColIdx !== -1 ? (row.rawData[statusColIdx] || "") : "";
                          const messageVal = messageColIdx !== -1 ? (row.rawData[messageColIdx] || "") : row.message;
                          
                          // Custom Badge styling per escalation level
                          let escalationBadgeStyle = "";
                          if (row.escalationLevel === "Level 3") {
                            escalationBadgeStyle = "bg-red-500/10 text-red-500 border-red-500/30 animate-pulse font-bold";
                          } else if (row.escalationLevel === "Level 2") {
                            escalationBadgeStyle = "bg-orange-500/10 text-orange-500 border-orange-500/20 font-bold";
                          } else if (row.escalationLevel === "Level 1") {
                            escalationBadgeStyle = "bg-amber-500/10 text-amber-550 border-amber-500/20 font-bold";
                          } else {
                            escalationBadgeStyle = "bg-emerald-500/10 text-emerald-400 border-emerald-500/20";
                          }

                          // Remaining time color helper
                          const isExpiringSoon = row.escalationLevel !== "Level 3" && row.remainingTimeText?.toLowerCase().includes("hour") && !row.remainingTimeText?.toLowerCase().includes("day");
                          const remainingTimeColor = isExpiringSoon 
                            ? "text-orange-400 font-semibold" 
                            : row.escalationLevel === "Level 3" 
                              ? "text-red-500 font-bold" 
                              : "text-emerald-400";

                          return (
                            <React.Fragment key={globalIdx}>
                              <tr 
                                onClick={() => setExpandedRowIdx(isExpanded ? null : globalIdx)}
                                className={`hover:bg-[#121418]/60 transition text-gray-300 font-mono text-[11px] cursor-pointer group ${
                                  isExpanded ? "bg-[#121418] border-l-4 border-l-orange-500" : "bg-transparent"
                                }`}
                              >
                                {/* Index */}
                                <td className="px-4 py-2.5 border-r border-[#1f2228]/50 text-center text-gray-550 select-none">
                                  {globalIdx.toLocaleString()}
                                </td>
                                
                                {/* Timestamp value */}
                                <td className="px-4 py-2.5 border-r border-[#1f2228]/40 text-gray-205">
                                  {row.timestamp}
                                </td>

                                {/* Custom target-mapped SLA categories & status badges */}
                                <td className="px-4 py-2.5 border-r border-[#1f2228]/40 font-sans">
                                  {statusVal ? (
                                    <span className="px-2 py-0.5 border text-[10px] rounded uppercase font-bold tracking-wider bg-gray-900 border-gray-800 text-slate-300">
                                      {statusVal}
                                    </span>
                                  ) : (
                                    <span className="text-gray-600 italic">N/A</span>
                                  )}
                                </td>

                                {/* Message Activity Text (truncated with tooltips) */}
                                <td className="px-4 py-2.5 border-r border-[#1f2228]/40 select-text max-w-xs truncate text-gray-400 font-sans" title={messageVal}>
                                  {messageVal || <em className="text-gray-700 italic">No activity message provided</em>}
                                </td>

                                {/* Working Age (Business hours SLA specific) */}
                                <td className="px-4 py-2.5 border-r border-[#1f2228]/40 text-right font-bold text-amber-400 font-mono">
                                  {row.workingAgeText || "0 Days 0 Hours"}
                                </td>

                                {/* SLA Escalation Level Pill Badge */}
                                <td className="px-4 py-2.5 border-r border-[#1f2228]/40 font-sans">
                                  <span className={`px-2 py-0.5 border text-[9.5px] rounded uppercase font-semibold tracking-wider ${escalationBadgeStyle}`}>
                                    {row.escalationLevel || "Within SLA"}
                                  </span>
                                </td>

                                {/* SLA Threshold limit */}
                                <td className="px-4 py-2.5 border-r border-[#1f2228]/40 text-gray-300 font-mono">
                                  {row.slaThreshold}
                                </td>

                                {/* Remaining SLA countdown hours */}
                                <td className={`px-4 py-2.5 border-r border-[#1f2228]/40 font-mono ${remainingTimeColor}`}>
                                  {row.remainingTimeText}
                                </td>

                                {/* Calendar Age (total clock age) */}
                                <td className="px-4 py-2.5 border-r border-[#1f2228]/40 text-right text-gray-500 font-mono">
                                  {computeAgeText(row.ageMs, ageDisplayMode)}
                                </td>

                                {/* VIEW DETAILS ACCORDION BUTTON FOOTER */}
                                <td className="px-4 py-2.5 text-center font-sans">
                                  <span className="text-[10px] text-gray-400 border border-[#1f2228] px-2 py-1 rounded bg-[#0c0d0f] font-bold group-hover:border-orange-500 transition-colors">
                                    {isExpanded ? "Hide ✕" : "Audit ☰"}
                                  </span>
                                </td>
                              </tr>

                              {/* Row detail expansion drawer drawer overlay */}
                              {isExpanded && (
                                <tr className="bg-gray-950 border-b border-[#1f2228]">
                                  <td 
                                    colSpan={10} 
                                    className="px-6 py-5 select-text"
                                  >
                                    <div className="space-y-4 animate-fadeIn">
                                      <div className="flex items-center justify-between border-b border-[#21242c] pb-2">
                                        <div className="flex items-center gap-2 text-white font-bold text-xs uppercase tracking-wider font-sans">
                                          <Sparkles className="w-4 h-4 text-orange-400" />
                                          <span>Detailed Audit Explorer (Imported Record Row Analysis #{globalIdx})</span>
                                        </div>
                                        <div className="flex items-center gap-3 text-[10px] font-mono text-gray-400">
                                          <span>SLA Level: <strong className={`border px-1.5 py-0.5 rounded ml-1 ${escalationBadgeStyle}`}>{row.escalationLevel}</strong></span>
                                          <span>Working Age: <strong className="text-amber-400 bg-orange-950/20 border border-orange-500/20 px-1.5 py-0.5 rounded ml-1">{row.workingAgeText}</strong></span>
                                          <span>Calendar Age: <strong className="text-white bg-slate-800 border border-slate-700 px-1.5 py-0.5 rounded ml-1">{computeAgeText(row.ageMs, ageDisplayMode)}</strong></span>
                                        </div>
                                      </div>

                                      {/* Full original conversations and structured grid mapping */}
                                      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
                                        {headers.map((h, hIdx) => {
                                          const val = row.rawData[hIdx] || "";
                                          const isTs = h === selectedTimestampCol;
                                          const isMsg = h === selectedMessageCol;
                                          return (
                                            <div key={hIdx} className="bg-[#0c0d0f] border border-[#1f2228] p-3 rounded text-xs space-y-1">
                                              <span className="text-gray-500 font-sans font-bold text-[9px] uppercase tracking-wider block">{h}</span>
                                              <span className={`font-mono text-gray-200 block overflow-x-auto whitespace-pre-wrap break-all ${
                                                isTs ? "text-orange-400 font-bold" : isMsg ? "text-white select-text font-sans" : ""
                                              }`}>
                                                {val || <span className="text-gray-700 italic font-sans text-[11px]">empty parameter</span>}
                                              </span>
                                            </div>
                                          );
                                        })}
                                      </div>
                                    </div>
                                  </td>
                                </tr>
                              )}
                            </React.Fragment>
                          );
                        })
                      )}
                    </tbody>

                  </table>
                </div>

                {/* PAGINATION PANEL FOOTER */}
                <div className="px-4 py-3 bg-[#0c0d0f] border-t border-[#1f2228] flex flex-col sm:flex-row items-center justify-between gap-4 text-xs select-none">
                  <span className="text-gray-400 font-sans">
                    Showing rows <strong className="text-white">{(paginatedRows.length > 0 ? (currentPage - 1) * pageSize + 1 : 0).toLocaleString()}</strong> to <strong className="text-white">{Math.min(currentPage * pageSize, sortedAndFilteredRows.length).toLocaleString()}</strong> of <strong className="text-orange-400 font-mono">{sortedAndFilteredRows.length.toLocaleString()}</strong> rows ({sortedAndFilteredRows.length === stats.previewRows.length ? "complete un-filtered set" : "custom active filters applied"})
                  </span>

                  <div className="flex items-center gap-1 font-mono">
                    <button
                      type="button"
                      onClick={() => { setCurrentPage(1); setExpandedRowIdx(null); }}
                      disabled={currentPage === 1}
                      className="px-2.5 py-1 bg-gray-950 hover:bg-[#121418] disabled:opacity-30 rounded border border-[#1f2228] text-white disabled:cursor-not-allowed cursor-pointer text-[10px] uppercase font-bold"
                    >
                      First
                    </button>
                    <button
                      type="button"
                      onClick={() => { setCurrentPage(prev => Math.max(prev - 1, 1)); setExpandedRowIdx(null); }}
                      disabled={currentPage === 1}
                      className="px-2.5 py-1 bg-gray-950 hover:bg-[#121418] disabled:opacity-30 rounded border border-[#1f2228] text-white disabled:cursor-not-allowed cursor-pointer text-[10px] uppercase font-bold"
                    >
                      Prev
                    </button>
                    <span className="px-2.5 text-gray-400 text-xs font-sans">
                      Page <strong className="text-white">{currentPage}</strong> of <strong className="text-white font-mono">{totalPages}</strong>
                    </span>
                    <button
                      type="button"
                      onClick={() => { setCurrentPage(prev => Math.min(prev + 1, totalPages)); setExpandedRowIdx(null); }}
                      disabled={currentPage === totalPages}
                      className="px-2.5 py-1 bg-gray-950 hover:bg-[#121418] disabled:opacity-30 rounded border border-[#1f2228] text-white disabled:cursor-not-allowed cursor-pointer text-[10px] uppercase font-bold"
                    >
                      Next
                    </button>
                    <button
                      type="button"
                      onClick={() => { setCurrentPage(totalPages); setExpandedRowIdx(null); }}
                      disabled={currentPage === totalPages}
                      className="px-2.5 py-1 bg-gray-950 hover:bg-[#121418] disabled:opacity-30 rounded border border-[#1f2228] text-white disabled:cursor-not-allowed cursor-pointer text-[10px] uppercase font-bold"
                    >
                      Last
                    </button>
                  </div>
                </div>
              </div>

            </div>

          </div>
        )}

      </main>

      {/* Humble literal footer */}
      <footer className="bg-[#0B0C0E] border-t border-[#2A2D35] py-4 px-6 text-center text-xs text-[#8E9299] select-none">
        <p className="max-w-7xl mx-auto flex flex-col md:flex-row items-center justify-between gap-2">
          <span>
            <strong className="text-[#E0E0E0]">Escalation Matrix v4.5</strong> — Built for high precision analytical workflows.
          </span>
          <span>
            Operator Scope: <strong className="text-orange-500 font-mono">Seemab.Haider00@gmail.com</strong>
          </span>
        </p>
      </footer>

    </div>
  );
}
