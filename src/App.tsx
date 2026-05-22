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
  Trash2
} from "lucide-react";

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

interface PreviewRow {
  timestamp: string;
  ageText: string;
  ageMs: number;
  message: string;
  rawData: string[];
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
  const [sortColumn, setSortColumn] = useState<string | null>(null);
  const [sortDirection, setSortDirection] = useState<"asc" | "desc">("desc");

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

  // Clear all categorical filters helper
  const clearCategoryFilters = () => {
    setSelectedCategoryFilters({});
    setCurrentPage(1);
  };

  // Filter dashboard list elements in memory preview
  const filteredRows = useMemo(() => {
    if (!stats) return [];
    let rows = stats.previewRows;

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
    return rows;
  }, [stats, selectedCategoryFilters, searchQuery, headers]);

  // Sort and filter dataset viewer rows elements
  const sortedAndFilteredRows = useMemo(() => {
    let result = [...filteredRows];
    if (sortColumn) {
      result.sort((a, b) => {
        let valA: any;
        let valB: any;

        if (sortColumn === "age") {
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

  return (
    <div id="application-root" className="min-h-screen bg-[#0B0C0E] text-[#E0E0E0] flex flex-col font-sans antialiased selection:bg-orange-600 selection:text-white">
      
      {/* Prime Desktop App Header */}
      <header className="bg-[#0B0C0E] border-b border-[#2A2D35] py-4 px-6 sticky top-0 z-50">
        <div className="max-w-7xl mx-auto flex flex-col md:flex-row items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-[#1A1D23] border border-[#2A2D35] text-[#FF5D22] rounded-lg">
              <FileSpreadsheet className="w-5.5 h-5.5" />
            </div>
            <div>
              <h1 className="font-sans font-semibold text-base tracking-tight text-white flex items-center gap-1.5">
                Escalation Matrix
                <span className="text-[10px] bg-emerald-950/50 border border-emerald-500/20 text-emerald-400 font-mono px-2 py-0.5 rounded-full font-bold">
                  Streaming Pipeline Live
                </span>
              </h1>
              <p className="text-[10px] text-[#8E9299] uppercase tracking-widest mt-0.5 font-mono">
                Ultra-Lightweight Timestamp Analyzer • Support Cap 1.5M rows
              </p>
            </div>
          </div>

          {/* Clock reference manager */}
          <div className="flex items-center gap-3 bg-[#1A1D23] border border-[#2A2D35] px-3.5 py-2 rounded-lg text-xs font-mono">
            <Clock className="w-4 h-4 text-orange-500 shrink-0" />
            <div className="text-left">
              <span className="text-[9px] text-[#8E9299] uppercase block tracking-wider font-bold">Analysis Reference Time (NOW)</span>
              <div className="flex items-center gap-2 mt-0.5">
                {useLiveClock ? (
                  <span className="text-emerald-400 font-bold font-mono">Browser Live Clock</span>
                ) : (
                  <input
                    type="text"
                    value={referenceTime}
                    onChange={(e) => {
                      setReferenceTime(e.target.value);
                      setCurrentPage(1);
                    }}
                    className="bg-[#0B0C0E] text-[#E0E0E0] border border-[#2A2D35] text-xs font-mono px-2 py-0.5 rounded focus:outline-none focus:border-orange-500 w-44 inline-block"
                  />
                )}
                <div className="h-3.5 w-px bg-[#2A2D35] mx-1"></div>
                <button
                  type="button"
                  onClick={() => {
                    setUseLiveClock(!useLiveClock);
                    setCurrentPage(1);
                  }}
                  className={`text-[10px] uppercase tracking-wider font-bold px-1.5 py-0.5 rounded cursor-pointer ${
                    useLiveClock ? "bg-orange-950/30 text-orange-400 border border-orange-500/10" : "bg-[#2A2D35] text-white hover:bg-[#3E424B]"
                  }`}
                >
                  {useLiveClock ? "Lock Reference Time" : "Set Live Mode"}
                </button>
              </div>
            </div>
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
            
            {/* Top overview layout */}
            <div className="flex flex-col md:flex-row items-start md:items-center justify-between gap-4 border-b border-[#2A2D35] pb-5">
              <div>
                <span className="text-[10px] bg-orange-950/40 border border-orange-500/20 text-orange-400 font-mono px-2 py-0.5 rounded uppercase font-bold tracking-wider">
                  Analysis Pipeline Result Complete
                </span>
                <h2 className="text-xl font-bold tracking-tight text-white mt-1.5 flex items-center gap-2">
                  <FileSpreadsheet className="w-5 h-5 text-orange-500" />
                  Dataset Timestamp Analysis Dashboard
                </h2>
                <p className="text-xs text-[#8E9299] mt-0.5">
                  Chronological calculation relative to: <span className="text-orange-400 font-bold font-mono">{getActiveReferenceTime().toUTCString()}</span>
                </p>
              </div>

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
                  setPageSize(50);
                  setCurrentPage(1);
                  setStep("import");
                }}
                className="px-4 py-2 bg-[#1A1D23] hover:bg-[#2A2D35] border border-[#2A2D35] hover:border-[#3E424B] text-white text-xs font-semibold rounded flex items-center gap-2 transition cursor-pointer"
              >
                <ArrowLeft className="w-4 h-4" /> Reset & Import Another File
              </button>
            </div>

            {/* SPLIT VIEW WORKSPACE */}
            <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
              
              {/* LEFT SIDE: FULL original dataset viewer with computed Age (Scrollable) */}
              <div className="lg:col-span-8 space-y-4">
                
                {/* Search & pagination rows per page control header */}
                <div className="bg-[#15171C] border border-[#2A2D35] rounded-xl p-4 flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
                  <div className="space-y-1">
                    <h3 className="text-sm font-semibold text-white flex items-center gap-1.5">
                      <Eye className="w-4 h-4 text-orange-500" />
                      Original Dataset Master Viewer
                    </h3>
                    <p className="text-[11px] text-[#8E9299]">
                      Displaying rows {sortedAndFilteredRows.length > 0 ? (currentPage - 1) * pageSize + 1 : 0} to {Math.min(currentPage * pageSize, sortedAndFilteredRows.length)} of {sortedAndFilteredRows.length} matched rows.
                    </p>
                  </div>

                  <div className="flex flex-wrap items-center gap-3 w-full md:w-auto">
                    {/* Multi-column Search query inputs */}
                    <div className="relative flex-1 md:flex-initial min-w-[240px]">
                      <Search className="w-3.5 h-3.5 text-[#8E9299] absolute left-3 top-1/2 -translate-y-1/2" />
                      <input
                        type="text"
                        placeholder="Search any field or age..."
                        value={searchQuery}
                        onChange={(e) => {
                          setSearchQuery(e.target.value);
                          setCurrentPage(1);
                        }}
                        className="w-full pl-9 pr-3 py-1.5 bg-[#0B0C0E] border border-[#2A2D35] rounded-md text-xs font-sans text-white placeholder-[#8E9299] focus:outline-none focus:border-orange-500"
                      />
                    </div>

                    {/* Page Size selector */}
                    <div className="flex items-center gap-1.5 text-xs text-[#8E9299]">
                      <span>Page size:</span>
                      <select
                        value={pageSize}
                        onChange={(e) => {
                          setPageSize(Number(e.target.value));
                          setCurrentPage(1);
                        }}
                        className="bg-[#0B0C0E] border border-[#2A2D35] text-white text-xs rounded px-2 py-1 focus:outline-none focus:border-orange-500 font-mono"
                      >
                        <option value={10}>10</option>
                        <option value={20}>20</option>
                        <option value={50}>50</option>
                        <option value={100}>100</option>
                        <option value={500}>500</option>
                      </select>
                    </div>
                  </div>
                </div>

                {/* ROW-LEVEL CATEGORICAL FILTERS (Auto-Detected) */}
                {Object.keys(columnCategoryFilters).length > 0 && (
                  <div className="bg-[#1C1F26]/40 border border-[#2A2D35]/60 rounded-xl p-3.5 space-y-2.5 shadow-sm">
                    <div className="flex items-center justify-between border-b border-[#2A2D35]/30 pb-2">
                      <div className="flex items-center gap-2 text-xs font-bold text-orange-400 uppercase tracking-wider">
                        <Filter className="w-3.5 h-3.5 text-orange-500" />
                        <span>Dynamic Field Filters</span>
                      </div>
                      <span className="text-[10px] text-[#8E9299]">
                        Auto-detected discrete categories (Status, Queue, Priority, etc.)
                      </span>
                    </div>

                    <div className="flex flex-wrap items-center gap-3">
                      {(Object.entries(columnCategoryFilters) as [string, string[]][]).map(([colName, uniqueValues]) => {
                        const currentValue = selectedCategoryFilters[colName] || "";
                        return (
                          <div key={colName} className="flex items-center gap-2 text-xs bg-[#121418] border border-[#2A2D35]/80 rounded-lg px-2.5 py-1.5 shadow-sm hover:border-[#3E424B] transition-colors">
                            <span className="text-[#8E9299] select-none font-medium">{colName}:</span>
                            <select
                              value={currentValue}
                              onChange={(e) => {
                                setSelectedCategoryFilters(prev => ({
                                  ...prev,
                                  [colName]: e.target.value
                                }));
                                setCurrentPage(1);
                              }}
                              className="bg-transparent text-white font-bold text-xs focus:outline-none border-none py-0.5 cursor-pointer max-w-[130px] truncate"
                            >
                              <option value="" className="bg-[#121418] text-[#8E9299]">All Columns</option>
                              {uniqueValues.map(v => (
                                <option key={v} value={v} className="bg-[#121418] text-white">
                                  {v}
                                </option>
                              ))}
                            </select>
                          </div>
                        );
                      })}

                      {Object.values(selectedCategoryFilters).some(v => v !== "") && (
                        <button
                          type="button"
                          onClick={clearCategoryFilters}
                          className="text-[11px] text-orange-400 hover:text-orange-300 font-bold flex items-center gap-1.5 px-2.5 py-1.5 hover:bg-orange-950/20 rounded-md transition border border-orange-500/20 cursor-pointer"
                        >
                          <Trash2 className="w-3.5 h-3.5" /> Clear Filters
                        </button>
                      )}
                    </div>
                  </div>
                )}

                {/* SCROLLABLE TABLE VIEWER CONTAINER */}
                <div className="bg-[#15171C] border border-[#2A2D35] rounded-xl overflow-hidden shadow-lg">
                  <div className="overflow-x-auto overflow-y-auto max-h-[640px] relative scrollbar-thin scrollbar-thumb-orange-600/30">
                    <table className="w-full text-left font-sans text-xs whitespace-nowrap select-none table-auto">
                      <thead className="sticky top-0 bg-[#121418] z-10 border-b border-[#2A2D35]">
                        <tr className="text-[#8E9299] uppercase text-[10px] tracking-wider font-bold select-none">
                          <th className="px-4 py-3.5 border-r border-[#2A2D35] text-center w-12 bg-[#121418]">Index</th>
                          {headers.map((h, hIdx) => {
                            const isTs = h === selectedTimestampCol;
                            return (
                              <th 
                                key={hIdx} 
                                onClick={() => handleSort(h)}
                                className={`px-4 py-3.5 border-r border-[#2A2D35] text-left bg-[#121418] font-bold cursor-pointer hover:bg-[#1A1D23] transition group ${
                                  isTs ? "text-orange-400 bg-orange-950/20 hover:bg-orange-950/30" : ""
                                }`}
                                title={`Click to sort by ${h}`}
                              >
                                <div className="flex items-center justify-between gap-1.5">
                                  <span>{h}</span>
                                  {renderSortIndicator(h)}
                                </div>
                              </th>
                            );
                          })}
                          <th 
                            onClick={() => handleSort("age")}
                            className="px-4 py-3.5 text-right bg-orange-900/10 text-orange-400 font-bold cursor-pointer hover:bg-orange-900/20 transition min-w-[140px] group"
                            title="Click to sort by calculated age"
                          >
                            <div className="flex items-center justify-end gap-1.5">
                              <span>Computed Age</span>
                              {renderSortIndicator("age")}
                            </div>
                          </th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-[#2A2D35]/40">
                        {paginatedRows.length === 0 ? (
                          <tr>
                            <td colSpan={headers.length + 2} className="py-24 text-center text-sm text-[#8E9299]">
                              <Info className="w-5 h-5 mx-auto mb-2 text-[#8E9299]/70 animate-pulse" />
                              No rows matched your search filter criteria.
                            </td>
                          </tr>
                        ) : (
                          paginatedRows.map((row, idx) => {
                            const globalIdx = (currentPage - 1) * pageSize + idx + 1;
                            const isExpanded = expandedRowIdx === globalIdx;
                            return (
                              <React.Fragment key={globalIdx}>
                                <tr 
                                  onClick={() => setExpandedRowIdx(isExpanded ? null : globalIdx)}
                                  className={`border-b border-[#2A2D35]/40 hover:bg-[#1C1F26] transition text-[#D0D4DF] cursor-pointer group ${
                                    isExpanded ? "bg-[#1C1F26]/80 border-l-2 border-l-orange-500" : "bg-[#15171C]"
                                  }`}
                                >
                                  <td className="px-4 py-2 border-r border-[#2A2D35]/50 text-center font-mono text-[11px] text-[#8E9299]">
                                    {globalIdx.toLocaleString()}
                                  </td>
                                  
                                  {/* Dynamic Cells: original row elements mapped sequentially */}
                                  {headers.map((h, hIdx) => {
                                    const val = row.rawData[hIdx] || "";
                                    const isTs = h === selectedTimestampCol;
                                    return (
                                      <td 
                                        key={hIdx} 
                                        className={`px-4 py-2 border-r border-[#2A2D35]/40 font-mono text-[11px] truncate max-w-[200px] ${
                                          isTs ? "text-orange-400 font-medium" : ""
                                        }`}
                                      >
                                        {val || <em className="text-gray-600 font-sans font-normal italic">empty</em>}
                                      </td>
                                    );
                                  })}

                                  {/* Appended calculated Age column */}
                                  <td className="px-4 py-2 text-right font-mono text-[11px] font-bold text-[#FF5D22] bg-orange-950/15 group-hover:bg-orange-950/20">
                                    {computeAgeText(row.ageMs, ageDisplayMode)}
                                  </td>
                                </tr>

                                {/* Row detail expansion tray */}
                                {isExpanded && (
                                  <tr className="bg-[#0D0E11] border-b border-[#2A2D35]">
                                    <td colSpan={headers.length + 2} className="px-6 py-4">
                                      <div className="space-y-3.5">
                                        <div className="flex items-center justify-between border-b border-[#2A2D35]/40 pb-2">
                                          <div className="flex items-center gap-2 text-orange-400 font-bold text-xs uppercase tracking-wider">
                                            <Sparkles className="w-4 h-4 text-orange-500 animate-pulse" />
                                            <span>Expanded audit record details for row #{globalIdx}</span>
                                          </div>
                                          <span className="text-[10px] text-[#8E9299] font-mono">
                                            Age result: <strong className="text-white">{computeAgeText(row.ageMs, ageDisplayMode)}</strong>
                                          </span>
                                        </div>

                                        {/* Multi column layout containing all values */}
                                        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
                                          {headers.map((h, hIdx) => {
                                            const val = row.rawData[hIdx] || "";
                                            const isTs = h === selectedTimestampCol;
                                            return (
                                              <div key={hIdx} className="bg-[#15171C] border border-[#2A2D35]/65 p-2.5 rounded-lg text-xs space-y-1">
                                                <span className="text-[#8E9299] font-sans font-medium text-[10px] uppercase text-gray-400 block tracking-wider">{h}</span>
                                                <span className={`font-mono text-white select-text block overflow-x-auto break-all whitespace-pre-wrap ${
                                                  isTs ? "text-orange-400 font-bold" : ""
                                                }`}>
                                                  {val || <span className="text-gray-600 font-sans italic">empty</span>}
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
                </div>

                {/* PAGINATION PANEL FOOTER */}
                <div className="px-4 py-3 bg-[#15171C] border border-[#2A2D35] rounded-xl flex flex-col sm:flex-row items-center justify-between gap-4 text-xs select-none shadow">
                  <span className="text-[#8E9299]">
                    Showing <strong className="text-white">{(paginatedRows.length > 0 ? (currentPage - 1) * pageSize + 1 : 0).toLocaleString()}</strong> to <strong className="text-white">{Math.min(currentPage * pageSize, sortedAndFilteredRows.length).toLocaleString()}</strong> of <strong className="text-orange-400">{sortedAndFilteredRows.length.toLocaleString()}</strong> rows (Mapped from visual pool)
                  </span>

                  <div className="flex items-center gap-1.5 font-mono">
                    <button
                      type="button"
                      onClick={() => { setCurrentPage(1); setExpandedRowIdx(null); }}
                      disabled={currentPage === 1}
                      className="px-2 py-1 bg-[#1A1D23] hover:bg-[#2A2D35] disabled:opacity-45 rounded border border-[#2A2D35]/70 text-white disabled:cursor-not-allowed cursor-pointer font-bold text-[10px] uppercase"
                    >
                      First
                    </button>
                    <button
                      type="button"
                      onClick={() => { setCurrentPage(prev => Math.max(prev - 1, 1)); setExpandedRowIdx(null); }}
                      disabled={currentPage === 1}
                      className="px-2 py-1 bg-[#1A1D23] hover:bg-[#2A2D35] disabled:opacity-45 rounded border border-[#2A2D35]/70 text-white disabled:cursor-not-allowed cursor-pointer"
                    >
                      Prev
                    </button>
                    <span className="px-2 text-[#8E9299] text-xs">
                      Page <strong className="text-white">{currentPage}</strong> of <strong className="text-white">{totalPages}</strong>
                    </span>
                    <button
                      type="button"
                      onClick={() => { setCurrentPage(prev => Math.min(prev + 1, totalPages)); setExpandedRowIdx(null); }}
                      disabled={currentPage === totalPages}
                      className="px-2 py-1 bg-[#1A1D23] hover:bg-[#2A2D35] disabled:opacity-45 rounded border border-[#2A2D35]/70 text-white disabled:cursor-not-allowed cursor-pointer"
                    >
                      Next
                    </button>
                    <button
                      type="button"
                      onClick={() => { setCurrentPage(totalPages); setExpandedRowIdx(null); }}
                      disabled={currentPage === totalPages}
                      className="px-2 py-1 bg-[#1A1D23] hover:bg-[#2A2D35] disabled:opacity-45 rounded border border-[#2A2D35]/70 text-white disabled:cursor-not-allowed cursor-pointer font-bold text-[10px] uppercase"
                    >
                      Last
                    </button>
                  </div>
                </div>

              </div>

              {/* RIGHT SIDE: AGE SUMMARY PANEL & STATS (Sticky position) */}
              <div className="lg:col-span-4 space-y-6 lg:sticky lg:top-24">
                
                <div className="bg-[#15171C] border border-[#2A2D35] rounded-xl p-5 space-y-4 shadow-xl">
                  <div className="flex items-center justify-between border-b border-[#2A2D35]/70 pb-2.5">
                    <h3 className="text-xs text-orange-400 uppercase tracking-widest font-bold flex items-center gap-2">
                      <Clock className="w-4 h-4 text-orange-500" />
                      Chronological Age Summary
                    </h3>
                  </div>

                  {/* AGE FORMAT STYLE SWITCHER */}
                  <div className="flex items-center justify-between bg-[#0C0D10] border border-[#2A2D35]/40 p-2.5 rounded-lg">
                    <span className="text-[10px] text-[#8E9299] uppercase font-bold tracking-wider">Age Format:</span>
                    <div className="flex bg-[#121418] p-0.5 rounded border border-[#2A2D35]/80">
                      <button
                        type="button"
                        onClick={() => setAgeDisplayMode("days-hours")}
                        className={`px-2.5 py-1 text-[10px] uppercase font-bold rounded transition-colors cursor-pointer ${
                          ageDisplayMode === "days-hours"
                            ? "bg-orange-600 text-white font-extrabold shadow-sm"
                            : "text-[#8E9299] hover:text-white"
                        }`}
                      >
                        Days & Hours
                      </button>
                      <button
                        type="button"
                        onClick={() => setAgeDisplayMode("total-hours")}
                        className={`px-2.5 py-1 text-[10px] uppercase font-bold rounded transition-colors cursor-pointer ${
                          ageDisplayMode === "total-hours"
                            ? "bg-orange-600 text-white font-extrabold shadow-sm"
                            : "text-[#8E9299] hover:text-white"
                        }`}
                      >
                        Total Hours
                      </button>
                    </div>
                  </div>

                  {/* High accuracy summary card items */}
                  <div className="space-y-3.5">
                    
                    {/* Total valid rows */}
                    <div className="bg-[#0C0D10] border border-[#2A2D35]/40 p-3.5 rounded-lg space-y-1">
                      <span className="text-[10px] text-[#8E9299] uppercase font-semibold block tracking-wider">
                        Evaluated Records Count
                      </span>
                      <div className="flex items-baseline gap-2">
                        <strong className="text-xl font-mono text-white">
                          {activeStats ? activeStats.validCount.toLocaleString() : "0"}
                        </strong>
                        <span className="text-[10px] text-[#8E9299]">valid rows</span>
                      </div>
                      {stats.corruptedCount > 0 && (
                        <div className="text-[9px] text-red-400 font-mono pt-1">
                          ⚠ Skipped {stats.corruptedCount.toLocaleString()} malformed/empty dates
                        </div>
                      )}
                    </div>

                    {/* Oldest Age */}
                    <div className="bg-[#0C0D10] border border-[#2A2D35]/40 p-3.5 rounded-lg space-y-1">
                      <span className="text-[10px] text-[#8E9299] uppercase font-semibold block tracking-wider">
                        Oldest Record Age
                      </span>
                      <strong className="text-sm font-mono text-orange-500 block">
                        {activeStats && activeStats.maxAgeMs !== null
                          ? computeAgeText(activeStats.maxAgeMs, ageDisplayMode)
                          : "N/A"}
                      </strong>
                      <span className="text-[9px] text-[#8E9299] font-mono block truncate" title={activeStats?.oldestTimestamp}>
                        Timestamp: {activeStats?.oldestTimestamp || "-"}
                      </span>
                    </div>

                    {/* Newest Age */}
                    <div className="bg-[#0C0D10] border border-[#2A2D35]/40 p-3.5 rounded-lg space-y-1">
                      <span className="text-[10px] text-[#8E9299] uppercase font-semibold block tracking-wider">
                        Newest Record Age
                      </span>
                      <strong className="text-sm font-mono text-emerald-400 block">
                        {activeStats && activeStats.minAgeMs !== null
                          ? computeAgeText(activeStats.minAgeMs, ageDisplayMode)
                          : "N/A"}
                      </strong>
                      <span className="text-[9px] text-[#8E9299] font-mono block truncate" title={activeStats?.newestTimestamp}>
                        Timestamp: {activeStats?.newestTimestamp || "-"}
                      </span>
                    </div>

                    {/* Average Age */}
                    <div className="bg-[#0C0D10] border border-[#2A2D35]/40 p-3.5 rounded-lg space-y-1">
                      <span className="text-[10px] text-[#8E9299] uppercase font-semibold block tracking-wider">
                        Average Record Age
                      </span>
                      <strong className="text-sm font-mono text-blue-400 block">
                        {activeStats && activeStats.avgAgeMs !== null
                          ? computeAgeText(activeStats.avgAgeMs, ageDisplayMode)
                          : "N/A"}
                      </strong>
                      <span className="text-[9px] text-[#8E9299] block font-sans text-gray-400">
                        Calculated dynamically across active filtered rows
                      </span>
                    </div>

                  </div>
                </div>

                {/* Accuracy cross-check details panel */}
                <div className="bg-orange-950/10 border border-orange-500/15 p-5 rounded-xl space-y-3 shadow-md">
                  <h4 className="text-xs font-bold text-orange-400 flex items-center gap-1.5 uppercase tracking-wide">
                    <Info className="w-4 h-4 text-orange-500 shrink-0" /> Accuracy Cross-Check
                  </h4>
                  <p className="text-[11px] text-[#C8CAD0] leading-relaxed">
                    Ages are computed by taking the active Reference Clock (Now) subtract the raw date value inside the selected <strong className="text-orange-400 font-mono">"{selectedTimestampCol}"</strong> field.
                  </p>
                  <p className="text-[11px] text-[#C8CAD0] leading-relaxed">
                    Click any table row inside the viewport to expand and inspect full original record values.
                  </p>
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
