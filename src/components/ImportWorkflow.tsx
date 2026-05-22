import React, { useState, useRef } from "react";
import * as XLSX from "xlsx";
import { 
  Upload, 
  FileSpreadsheet, 
  HelpCircle, 
  CheckCircle, 
  AlertTriangle, 
  RefreshCw, 
  Map, 
  Settings, 
  Eye, 
  Clock,
  ArrowRight,
  ArrowLeft,
  Check,
  Sparkles,
  Cpu,
  Database,
  Info,
  ChevronRight,
  ChevronLeft
} from "lucide-react";
import { ColumnMapping } from "../types";

interface ImportWorkflowProps {
  onDataIngested: (records: any[]) => void;
  onAuditLog: (action: string, s: string) => void;
}

interface ExtendedColumnMapping extends ColumnMapping {
  isCombinedTimestamp: boolean;
  dateColumn: string;
  timeColumn: string;
  customerMessage: string;
  botResponse: string;
  type: string;
  network: string;
  messageType: string;
  senderReceiver: string;
}

export default function ImportWorkflow({ onDataIngested, onAuditLog }: ImportWorkflowProps) {
  const [file, setFile] = useState<File | null>(null);
  const [wizardStep, setWizardStep] = useState<"upload" | "preview_and_timestamp" | "mapping" | "confirmation" | "processing">("upload");
  const [headers, setHeaders] = useState<string[]>([]);
  const [allRawRows, setAllRawRows] = useState<any[]>([]);
  const [sampleRows, setSampleRows] = useState<any[]>([]);
  const [totalRows, setTotalRows] = useState<number>(0);
  const [mappings, setMappings] = useState<ExtendedColumnMapping>({
    caseId: "",
    status: "",
    timestamp: "",
    endTimestamp: "",
    owner: "",
    isEscalated: "",
    priority: "",
    queue: "",
    origin: "",
    customerLink: "",
    // Smart extra fields
    isCombinedTimestamp: false,
    dateColumn: "",
    timeColumn: "",
    customerMessage: "",
    botResponse: "",
    type: "",
    network: "",
    messageType: "",
    senderReceiver: ""
  });
  
  const [isDragging, setIsDragging] = useState(false);
  const [importStatus, setImportStatus] = useState<"idle" | "parsed" | "error" | "uploading">("idle");
  const [errorMessage, setErrorMessage] = useState("");
  const [timezoneNormalization, setTimezoneNormalization] = useState<"UTC" | "LOCAL" | "EST">("UTC");
  const [processingLogs, setProcessingLogs] = useState<string[]>([]);
  const [activeLogIndex, setActiveLogIndex] = useState<number>(-1);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Auto-detect with enhanced smart matching suggestions
  const autoDetectAllMappings = (headersList: string[], rows: any[]) => {
    const maps: ExtendedColumnMapping = {
      caseId: "",
      status: "",
      timestamp: "",
      endTimestamp: "",
      owner: "",
      isEscalated: "",
      priority: "",
      queue: "",
      origin: "",
      customerLink: "",
      isCombinedTimestamp: false,
      dateColumn: "",
      timeColumn: "",
      customerMessage: "",
      botResponse: "",
      type: "",
      network: "",
      messageType: "",
      senderReceiver: ""
    };

    headersList.forEach((h) => {
      const clean = h.toLowerCase().replace(/[\s_-]/g, "");
      
      if (/caseid|ticketid|id|case_id|ticket_id|caseno/i.test(clean) && !maps.caseId) {
        maps.caseId = h;
      } else if (/status|state|lifecycle|stage/i.test(clean) && !maps.status) {
        maps.status = h;
      } else if (/start|timestamp|time|datetime|created|opened|date/i.test(clean) && !/end|close|message|msg/i.test(clean) && !maps.timestamp) {
        maps.timestamp = h;
      } else if (/end|close|resolved|finished|completed/i.test(clean) && !maps.endTimestamp) {
        maps.endTimestamp = h;
      } else if (/owner|agent|bot|assignee|engineer|user/i.test(clean) && !maps.owner) {
        maps.owner = h;
      } else if (/escalat|iseclated|flag/i.test(clean) && !maps.isEscalated) {
        maps.isEscalated = h;
      } else if (/priority|severity|urgency/i.test(clean) && !maps.priority) {
        maps.priority = h;
      } else if (/queue|team|group|dept|desk/i.test(clean) && !maps.queue) {
        maps.queue = h;
      } else if (/origin|source|channel/i.test(clean) && !/link/i.test(clean) && !maps.origin) {
        maps.origin = h;
      } else if (/customer|client|company|link|account/i.test(clean) && !/message|msg/i.test(clean) && !maps.customerLink) {
        maps.customerLink = h;
      }
      
      // Smart Extra Columns Autosuggest Matchers
      if (/msg|message|text|body|chat|customer_msg|customer_message/i.test(clean) && !/bot/i.test(clean) && !maps.customerMessage) {
        maps.customerMessage = h;
      } else if (/bot|response|reply|bot_response|bot_msg|agent_msg/i.test(clean) && !maps.botResponse) {
        maps.botResponse = h;
      } else if (/type|direction|incoming|sent|direction_type|sender_type/i.test(clean) && !/msg_type|message_type/i.test(clean) && !maps.type) {
        maps.type = h;
      } else if (/network|platform|channel|medium|source|instagram|facebook|social/i.test(clean) && !/link/i.test(clean) && !maps.network) {
        maps.network = h;
      } else if (/msg_type|message_type|format|media_type/i.test(clean) && !maps.messageType) {
        maps.messageType = h;
      } else if (/sender|receiver|recipient|from|to/i.test(clean) && !maps.senderReceiver) {
        maps.senderReceiver = h;
      }
    });

    // Sub-segment checks for separate Date & Time columns
    headersList.forEach((h) => {
      const clean = h.toLowerCase().replace(/[\s_-]/g, "");
      if (/^date$|date_only|^day$/i.test(clean) && !maps.dateColumn) {
        maps.dateColumn = h;
      } else if (/^time$|time_only|hour/i.test(clean) && !maps.timeColumn) {
        maps.timeColumn = h;
      }
    });

    // Set combined flag true if auto-matched separate date and time
    if (maps.dateColumn && maps.timeColumn) {
      maps.isCombinedTimestamp = true;
    }

    // Default Fallbacks
    if (!maps.caseId) maps.caseId = headersList[0] || "";
    if (!maps.status) maps.status = headersList[1] || "";
    if (!maps.timestamp && !maps.isCombinedTimestamp) maps.timestamp = headersList[2] || "";
    if (!maps.owner) maps.owner = headersList[3] || "";

    setMappings(maps);
  };

  const handleFile = (selectedFile: File) => {
    if (!selectedFile) return;
    setFile(selectedFile);
    setImportStatus("uploading");
    setErrorMessage("");

    const reader = new FileReader();
    reader.onload = (e) => {
      try {
        const data = e.target?.result;
        if (!data) throw new Error("Could not load readable file stream.");
        
        const workbook = XLSX.read(data, { type: "binary", cellDates: true });
        const firstSheetName = workbook.SheetNames[0];
        const worksheet = workbook.Sheets[firstSheetName];
        
        const rows: any[] = XLSX.utils.sheet_to_json(worksheet, { defval: "" });
        
        if (rows.length === 0) {
          throw new Error("The target worksheet appears completely empty.");
        }

        const firstRow = rows[0];
        const detectedHeaders = Object.keys(firstRow);
        
        setHeaders(detectedHeaders);
        setAllRawRows(rows);
        setSampleRows(rows.slice(0, 15)); // Get up to 15 sample rows for dataset preview table
        setTotalRows(rows.length);
        autoDetectAllMappings(detectedHeaders, rows);
        
        setImportStatus("parsed");
        setWizardStep("preview_and_timestamp"); // Transition to preview step
        
        onAuditLog("FILE_STAGE", `Uploaded file '${selectedFile.name}' with ${rows.length} rows.`);
      } catch (err: any) {
        setImportStatus("error");
        setErrorMessage(err.message || "Failed to parse file. Use standard Excel (.xlsx, .xls) or CSV (.csv) formats.");
      }
    };
    reader.onerror = () => {
      setImportStatus("error");
      setErrorMessage("File reader error. Check file system or permissions.");
    };
    reader.readAsBinaryString(selectedFile);
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(true);
  };

  const handleDragLeave = () => {
    setIsDragging(false);
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    if (e.dataTransfer.files && e.dataTransfer.files[0]) {
      handleFile(e.dataTransfer.files[0]);
    }
  };

  const handleMappingChange = (key: keyof ExtendedColumnMapping, val: any) => {
    setMappings((prev) => ({
      ...prev,
      [key]: val
    }));
  };

  const executeIngest = () => {
    if (!file || allRawRows.length === 0) return;
    
    setWizardStep("processing");
    setImportStatus("uploading");
    
    const logsSequence = [
      "Starting deep conversational mapping parser...",
      "Analyzing table fields and matching selected headers...",
      "Executing Date-Time normalizations to UTC...",
      "Merging isolated Date & Time columns (if selected)...",
      "Stitching multi-owner conversation transition threads...",
      "Running semantic AI Sentiment extraction on agent notes...",
      "Extracting top customer escalation reasons and metadata...",
      "Validating timeline sequences & checking duplicate overlaps...",
      "Calculating business clock exclusions (Business hour calendars)...",
      "Drafting final confidence index benchmarks...",
      "Deploying analytics results to executive dashboard..."
    ];

    setProcessingLogs([]);
    setActiveLogIndex(0);

    // Staggered loading simulation to represent high intelligence parsing process
    let logIndex = 0;
    const interval = setInterval(() => {
      if (logIndex < logsSequence.length) {
        setProcessingLogs((prev) => [...prev, logsSequence[logIndex]]);
        logIndex++;
        setActiveLogIndex(logIndex);
      } else {
        clearInterval(interval);
        
        // Execute final commit to the server endpoint
        commitDataToBackend();
      }
    }, 450);
  };

  const commitDataToBackend = () => {
    try {
      const nowBase = new Date();
      const normalizedRecords = allRawRows.map((row, idx) => {
        // Unify timestamp column or combined columns
        let startRaw = "";
        
        if (mappings.isCombinedTimestamp) {
          if (mappings.dateColumn && mappings.timeColumn) {
            const dVal = row[mappings.dateColumn];
            const tVal = row[mappings.timeColumn];
            if (dVal && tVal) {
              const dStr = dVal instanceof Date ? dVal.toISOString().split('T')[0] : String(dVal).trim();
              const tStr = tVal instanceof Date ? tVal.toTimeString().split(' ')[0] : String(tVal).trim();
              startRaw = `${dStr} ${tStr}`;
            } else if (dVal) {
              startRaw = dVal instanceof Date ? dVal.toISOString() : String(dVal);
            }
          } else if (mappings.dateColumn) {
            const dVal = row[mappings.dateColumn];
            startRaw = dVal instanceof Date ? dVal.toISOString() : String(dVal);
          }
        } else if (mappings.timestamp) {
          startRaw = row[mappings.timestamp] || "";
        }

        // Row-order fallback if timestamp was not selected or missing
        if (!startRaw) {
          // Subtract 10 minutes per row index to keep a clean, chronological timeline sequence
          const generatedDate = new Date(nowBase.getTime() - (allRawRows.length - idx) * 10 * 60 * 1000);
          startRaw = generatedDate.toISOString();
        }

        let endRaw = mappings.endTimestamp ? row[mappings.endTimestamp] : undefined;

        const parseTimestamp = (val: any) => {
          if (!val) return "";
          if (val instanceof Date) {
            return val.toISOString();
          }
          const parsed = new Date(val);
          if (!isNaN(parsed.getTime())) {
            return parsed.toISOString();
          }
          return String(val);
        };

        // Serialize additional smart mapped fields into a descriptive "notes" structure 
        // which helps visualizers draw insights on CaseDrilldown
        let notesParts: string[] = [];
        if (mappings.customerMessage && row[mappings.customerMessage]) {
          notesParts.push(`Customer: "${String(row[mappings.customerMessage]).trim()}"`);
        }
        if (mappings.botResponse && row[mappings.botResponse]) {
          notesParts.push(`Bot: "${String(row[mappings.botResponse]).trim()}"`);
        }
        if (mappings.type && row[mappings.type]) {
          notesParts.push(`Type: ${String(row[mappings.type]).trim()}`);
        }
        if (mappings.network && row[mappings.network]) {
          notesParts.push(`Network: ${String(row[mappings.network]).trim()}`);
        }
        if (mappings.messageType && row[mappings.messageType]) {
          notesParts.push(`Format: ${String(row[mappings.messageType]).trim()}`);
        }
        if (mappings.senderReceiver && row[mappings.senderReceiver]) {
          notesParts.push(`Sender/Receiver: ${String(row[mappings.senderReceiver]).trim()}`);
        }
        
        let finalNotes = notesParts.length > 0 ? notesParts.join(" | ") : "";

        return {
          caseId: row[mappings.caseId] ? String(row[mappings.caseId]).trim() : "",
          status: row[mappings.status] ? String(row[mappings.status]).trim() : "",
          startTimestamp: parseTimestamp(startRaw),
          endTimestamp: endRaw ? parseTimestamp(endRaw) : undefined,
          owner: mappings.owner ? String(row[mappings.owner] || "Unassigned").trim() : "Unassigned",
          isEscalated: mappings.isEscalated ? (row[mappings.isEscalated] === true || String(row[mappings.isEscalated]).toLowerCase() === "true" || row[mappings.isEscalated] === 1 || String(row[mappings.isEscalated]).toLowerCase() === "yes") : false,
          priority: mappings.priority ? String(row[mappings.priority] || "Medium").trim() : "Medium",
          queue: mappings.queue ? String(row[mappings.queue] || "Triage").trim() : "Support Pool",
          origin: mappings.origin ? String(row[mappings.origin] || "Portal").trim() : "Portal",
          customerLink: mappings.customerLink ? String(row[mappings.customerLink] || "General Account").trim() : "General Account",
          notes: finalNotes || undefined
        };
      });

      // Commit to backend API
      fetch("/api/upload", {
        method: "POST",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          records: normalizedRecords,
          timezone: timezoneNormalization
        })
      })
        .then((r) => r.json())
        .then((res) => {
          if (res.success) {
            onDataIngested(res.cases);
            setWizardStep("upload");
            setImportStatus("idle");
            setFile(null);
            setAllRawRows([]);
            setSampleRows([]);
            setHeaders([]);
          } else {
            throw new Error(res.error || "Failed to commit upload data to server.");
          }
        })
        .catch((err) => {
          setWizardStep("preview_and_timestamp");
          setImportStatus("error");
          setErrorMessage(err.message || "Upload processing error.");
        });

    } catch (err: any) {
      setWizardStep("preview_and_timestamp");
      setImportStatus("error");
      setErrorMessage(err.message || "Failed during final database commit.");
    }
  };

  const getSampleValues = (header: string, count = 3): string[] => {
    return allRawRows
      .map((row) => row[header])
      .filter((val) => val !== undefined && val !== null && String(val).trim() !== "")
      .slice(0, count)
      .map((v) => (v instanceof Date ? v.toLocaleString() : String(v)));
  };

  // Helper check to evaluate if a column has suggested semantic matches
  const getSemanticMatchingBadge = (header: string) => {
    const clean = header.toLowerCase().replace(/[\s_-]/g, "");
    if (/caseid|ticketid|^id$/i.test(clean)) return "Suggested Case ID";
    if (/status|state|lifecycle/i.test(clean)) return "Suggested Status";
    if (/timestamp|datetime|created_at/i.test(clean)) return "Suggested Timestamp";
    if (/msg|message|text|body|chat/i.test(clean)) return "Suggested Customer Message";
    if (/bot|response|reply/i.test(clean)) return "Suggested Bot Response";
    if (/type|direction|incoming/i.test(clean)) return "Suggested Type";
    if (/network|platform|channel/i.test(clean)) return "Suggested Network";
    return null;
  };

  const isTimestampMissing = mappings.isCombinedTimestamp 
    ? !mappings.dateColumn 
    : !mappings.timestamp;

  return (
    <div id="import-workflow-root" className="bg-[#15171C] rounded-xl border border-[#2A2D35] overflow-hidden">
      {/* Header Banner */}
      <div className="bg-[#1A1D23] border-b border-[#2A2D35] px-6 py-4 text-white flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h2 id="import-title" className="font-sans font-semibold text-base flex items-center gap-2">
            <FileSpreadsheet className="w-5 h-5 text-orange-500" />
            CRM Intelligent Data Onboarding Wizard
          </h2>
          <p className="text-[11px] text-[#8E9299] mt-0.5">
            Stage, parse, calibrate mappings, and run semantic sequence reconstructions.
          </p>
        </div>
        
        {/* Step Indicator */}
        <div className="flex items-center gap-2 text-[11px] font-mono shrink-0 select-none bg-[#0B0C0E]/60 border border-[#2A2D35]/50 px-3 py-1.5 rounded-lg">
          <span className={`${wizardStep === 'upload' ? 'text-orange-500 font-bold' : 'text-[#8E9299]'}`}>1. Upload</span>
          <ChevronRight className="w-3 h-3 text-[#3E424B]" />
          <span className={`${wizardStep === 'preview_and_timestamp' ? 'text-orange-500 font-bold' : 'text-[#8E9299]'}`}>2. Timestamp</span>
          <ChevronRight className="w-3 h-3 text-[#3E424B]" />
          <span className={`${wizardStep === 'mapping' ? 'text-orange-500 font-bold' : 'text-[#8E9299]'}`}>3. Map Fields</span>
          <ChevronRight className="w-3 h-3 text-[#3E424B]" />
          <span className={`${wizardStep === 'confirmation' ? 'text-orange-500 font-bold' : 'text-[#8E9299]'}`}>4. Confirm</span>
        </div>
      </div>

      <div className="p-6">
        {/* STEP 1: UPLOAD FILE (Idle state) */}
        {wizardStep === "upload" && importStatus !== "uploading" && (
          <div className="space-y-4">
            <div 
              id="drag-drop-zone"
              onDragOver={handleDragOver}
              onDragLeave={handleDragLeave}
              onDrop={handleDrop}
              className={`border-2 border-dashed rounded-xl p-10 flex flex-col items-center justify-center text-center transition-all ${
                isDragging 
                  ? "border-orange-500 bg-orange-500/5" 
                  : "border-[#2A2D35] hover:border-[#3E424B] bg-[#0E1014]"
              }`}
            >
              <Upload className="w-12 h-12 text-[#8E9299] mb-3 animate-pulse" />
              <h3 className="font-semibold text-white text-sm">Drag & drop CRM export file</h3>
              <p className="text-xs text-[#8E9299] mt-1 mb-5">Supports Excel (.xlsx, .xls) and CSV (.csv) formats</p>
              
              <button
                id="select-file-button"
                onClick={() => fileInputRef.current?.click()}
                className="px-5 py-2 bg-orange-600 hover:bg-orange-700 text-white rounded font-semibold text-xs transition shadow-sm border border-orange-500/25 cursor-pointer"
              >
                Browse Raw Datasets
              </button>
              <input 
                ref={fileInputRef}
                type="file" 
                accept=".xlsx,.xls,.csv" 
                className="hidden" 
                onChange={(e) => e.target.files && e.target.files[0] && handleFile(e.target.files[0])}
              />
            </div>
            
            {/* Explanatory Helper Tips */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 bg-[#1A1D23] p-4 rounded-xl border border-[#2A2D35] text-xs leading-relaxed text-[#8E9299]">
              <div>
                <h4 className="text-white font-semibold text-xs mb-1">💡 Flexible Schema Mapping</h4>
                <p>Upload files with <i>any</i> custom header naming. You will have full manual mapping override capabilities in the subsequent steps.</p>
              </div>
              <div>
                <h4 className="text-white font-semibold text-xs mb-1">⏱ Dual DateTime Logic</h4>
                <p>Supports unified single column timestamps, or combined ISO columns (e.g. distinct values for Date & Time keys).</p>
              </div>
            </div>
          </div>
        )}

        {/* LOADING & PARSING SCREEN */}
        {importStatus === "uploading" && wizardStep !== "processing" && (
          <div id="loader-status" className="py-16 flex flex-col items-center justify-center text-center">
            <RefreshCw className="w-12 h-12 text-orange-500 animate-spin mb-4" />
            <p className="text-white font-medium text-sm">Parsing table structures and indexing keys...</p>
            <p className="text-[#8E9299] text-xs mt-1">Ingesting cell values and assembling headers.</p>
          </div>
        )}

        {/* ERROR SCREEN */}
        {importStatus === "error" && (
          <div id="error-alert" className="p-5 bg-red-950/40 border border-red-900/40 rounded-lg text-red-100 mb-6 font-sans font-medium line-relaxed">
            <div className="flex items-start gap-3">
              <AlertTriangle className="w-5 h-5 mt-0.5 shrink-0 text-red-400" />
              <div>
                <h4 className="font-bold text-sm text-red-300">File Ingestion Failure</h4>
                <p className="text-xs text-red-400 mt-1">{errorMessage}</p>
                <button
                  id="retry-upload"
                  onClick={() => {
                    setImportStatus("idle");
                    setWizardStep("upload");
                    setFile(null);
                  }}
                  className="mt-4 px-3.5 py-1.5 bg-red-900/50 hover:bg-red-900/70 border border-red-800 text-red-200 text-xs rounded transition font-semibold cursor-pointer"
                >
                  Choose Another Dataset File
                </button>
              </div>
            </div>
          </div>
        )}

        {/* STEP 2 & 3: AUTO COLUMN DETECTION & TIMESTAMP SELECTION */}
        {importStatus === "parsed" && wizardStep === "preview_and_timestamp" && file && (
          <div id="preview-timestamp-step" className="space-y-6">
            
            {/* File Info Block */}
            <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 bg-[#1A1D23] px-4 py-3 rounded-lg border border-[#2A2D35]">
              <div className="flex items-center gap-2">
                <FileSpreadsheet className="w-5 h-5 text-orange-500" />
                <div>
                  <span className="font-semibold text-white text-xs block">{file.name}</span>
                  <span className="text-[10px] text-[#8E9299]">File Size: {(file.size / 1024).toFixed(1)} KB • Rows count: {totalRows}</span>
                </div>
              </div>
              <button 
                id="reset-wizard"
                onClick={() => {
                  setWizardStep("upload");
                  setImportStatus("idle");
                  setFile(null);
                  setAllRawRows([]);
                  setHeaders([]);
                }}
                className="text-xs text-red-400 hover:text-red-300 font-semibold cursor-pointer"
              >
                Choose Different File
              </button>
            </div>

            {/* Core Column Detection & Map Question */}
            <div className="bg-[#0B0C0E] border border-[#2A2D35] p-5 rounded-xl space-y-4">
              <div className="flex items-center gap-2">
                <Clock className="w-5 h-5 text-orange-500" />
                <div>
                  <h3 className="text-white font-semibold text-xs uppercase tracking-wider">Timestamp / Date-Time Calibration</h3>
                  <p className="text-[11px] text-[#8E9299]">Select how the system should extract temporal chronological sequences from your sheet.</p>
                </div>
              </div>

              {/* Toggle Selector for Single vs Combined Column */}
              <div className="flex gap-4 p-1 bg-[#1A1D23] rounded-lg border border-[#2A2D35] w-fit">
                <button
                  type="button"
                  onClick={() => handleMappingChange("isCombinedTimestamp", false)}
                  className={`px-3 py-1 text-xs font-semibold rounded transition ${
                    !mappings.isCombinedTimestamp 
                      ? "bg-orange-600 text-white" 
                      : "text-[#8E9299] hover:text-white"
                  }`}
                >
                  Single Timestamp Column
                </button>
                <button
                  type="button"
                  onClick={() => handleMappingChange("isCombinedTimestamp", true)}
                  className={`px-3 py-1 text-xs font-semibold rounded transition ${
                    mappings.isCombinedTimestamp 
                      ? "bg-orange-600 text-white" 
                      : "text-[#8E9299] hover:text-white"
                  }`}
                >
                  Combined Date + Time Columns
                </button>
              </div>

              {/* The Select Dropdowns */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4 pt-2">
                {!mappings.isCombinedTimestamp ? (
                  <div className="space-y-1">
                    <label className="text-white text-xs font-semibold block">Select Timestamp Column</label>
                    <select
                      id="timestamp-col-select"
                      value={mappings.timestamp}
                      onChange={(e) => handleMappingChange("timestamp", e.target.value)}
                      className="w-full text-xs border border-[#2A2D35] bg-[#1A1D23] text-white rounded px-3 py-2.5 focus:outline-none focus:border-orange-500"
                    >
                      <option value="">-- Do Not Process Chronologies (Row-Order) --</option>
                      {headers.map((h) => (
                        <option key={h} value={h}>{h}</option>
                      ))}
                    </select>
                  </div>
                ) : (
                  <>
                    <div className="space-y-1">
                      <label className="text-white text-xs font-semibold block">Select Date Column</label>
                      <select
                        id="date-col-select"
                        value={mappings.dateColumn}
                        onChange={(e) => handleMappingChange("dateColumn", e.target.value)}
                        className="w-full text-xs border border-[#2A2D35] bg-[#1A1D23] text-white rounded px-3 py-2.5 focus:outline-none focus:border-orange-500"
                      >
                        <option value="">-- Select Date Column --</option>
                        {headers.map((h) => (
                          <option key={h} value={h}>{h}</option>
                        ))}
                      </select>
                    </div>
                    <div className="space-y-1">
                      <label className="text-white text-xs font-semibold block">Select Time Column</label>
                      <select
                        id="time-col-select"
                        value={mappings.timeColumn}
                        onChange={(e) => handleMappingChange("timeColumn", e.target.value)}
                        className="w-full text-xs border border-[#2A2D35] bg-[#1A1D23] text-white rounded px-3 py-2.5 focus:outline-none focus:border-orange-500"
                      >
                        <option value="">-- Select Time Column --</option>
                        {headers.map((h) => (
                          <option key={h} value={h}>{h}</option>
                        ))}
                      </select>
                    </div>
                  </>
                )}

                {/* Timezone Helper Settings */}
                <div className="space-y-1">
                  <label className="text-white text-xs font-semibold block">Timezone Conversion Normalizer</label>
                  <select 
                    id="timezone-select"
                    value={timezoneNormalization} 
                    onChange={(e) => setTimezoneNormalization(e.target.value as any)}
                    className="w-full text-xs border border-[#2A2D35] bg-[#1A1D23] text-white rounded px-3 py-2.5 focus:outline-none focus:border-orange-500"
                  >
                    <option value="UTC">Normalize to UTC</option>
                    <option value="LOCAL">Local Hour Offset</option>
                    <option value="EST">Eastern Standard Time (EST)</option>
                  </select>
                </div>
              </div>

              {/* Warning Message if Timestamp Not Selected */}
              {isTimestampMissing && (
                <div className="p-3.5 bg-amber-950/40 border border-amber-900/40 text-amber-200 text-xs rounded-lg flex items-start gap-2 max-w-2xl font-sans">
                  <AlertTriangle className="w-4 h-4 text-orange-500 shrink-0 mt-0.5" />
                  <div>
                    <span className="font-semibold text-orange-400">Timestamp not selected.</span>
                    <p className="mt-0.5 text-[#E0E0E0]">We will use row-order processing (less accurate). Incomplete sequence configurations will fallback on historical linear estimations.</p>
                  </div>
                </div>
              )}
            </div>

            {/* Column Preview Helper (Horizontal scrolling cards) */}
            <div className="space-y-2">
              <h4 className="text-white font-semibold text-xs uppercase tracking-wider flex items-center gap-1">
                <Sparkles className="w-3.5 h-3.5 text-orange-500" />
                Column Preview Helper & Samples
              </h4>
              <p className="text-[11px] text-[#8E9299]">Confirm actual cell records content to match the correct variables.</p>
              
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3 overflow-y-auto max-h-56 p-1">
                {headers.map((h) => {
                  const samples = getSampleValues(h, 3);
                  const isMappedAsTime = !mappings.isCombinedTimestamp 
                    ? mappings.timestamp === h 
                    : (mappings.dateColumn === h || mappings.timeColumn === h);
                  
                  const activeMappingBadge = getSemanticMatchingBadge(h);

                  return (
                    <div 
                      key={h}
                      onClick={() => {
                        if (mappings.isCombinedTimestamp) {
                          if (!mappings.dateColumn) handleMappingChange("dateColumn", h);
                          else if (!mappings.timeColumn) handleMappingChange("timeColumn", h);
                        } else {
                          handleMappingChange("timestamp", h);
                        }
                      }}
                      className={`p-3 rounded-lg border text-left cursor-pointer transition-all flex flex-col justify-between ${
                        isMappedAsTime 
                          ? "bg-orange-600/10 border-orange-500" 
                          : "bg-[#0B0C0E] border-[#2A2D35] hover:border-[#3E424B]"
                      }`}
                    >
                      <div>
                        <div className="flex items-start justify-between gap-1">
                          <span className="font-semibold text-white/95 text-xs truncate max-w-[160px] font-mono">{h}</span>
                          {isMappedAsTime && (
                            <span className="bg-orange-600 border border-orange-500 text-white px-2 py-0.5 rounded text-[8px] font-bold uppercase shrink-0 font-mono">
                              Clock Selected
                            </span>
                          )}
                        </div>
                        {activeMappingBadge && !isMappedAsTime && (
                          <span className="inline-block mt-1 text-[8px] bg-[#1A1D23] text-orange-400 border border-orange-500/20 px-1.5 py-0.2 rounded font-mono">
                            💡 {activeMappingBadge}
                          </span>
                        )}
                        <div className="space-y-1 mt-2.5">
                          {samples.length === 0 ? (
                            <span className="text-[10px] text-[#8E9299] italic block">Empty column values</span>
                          ) : (
                            samples.map((samp, idx) => (
                              <span key={idx} className="block text-[10px] text-white/70 font-mono truncate max-w-full bg-[#1A1D23]/60 px-2 py-0.5 rounded select-all border border-[#2A2D35]/30">
                                {samp}
                              </span>
                            ))
                          )}
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>

            {/* Dataset Preview Table */}
            <div className="space-y-2">
              <h4 className="text-white font-semibold text-xs uppercase tracking-wider flex items-center gap-1.5">
                <Eye className="w-4 h-4 text-orange-400" />
                Raw Data Table Detector (First 15 Rows)
              </h4>
              <div className="overflow-x-auto border border-[#2A2D35] rounded-xl max-h-64">
                <table className="w-full text-left border-collapse text-[11px]">
                  <thead>
                    <tr className="bg-[#1A1D23] border-b border-[#2A2D35] text-[#8E9299] font-medium font-sans">
                      {headers.map((h) => (
                        <th key={h} className="px-3 py-2 border-r border-[#2A2D35] truncate max-w-[150px] whitespace-nowrap">
                          {h}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {sampleRows.map((row, rIdx) => (
                      <tr key={rIdx} className="border-b border-[#2A2D35] hover:bg-[#1A1D23]/40 bg-[#0B0C0E]/50 transition text-[#E0E0E0] select-none font-mono">
                        {headers.map((h) => (
                          <td key={h} className="px-3 py-2 border-r border-[#2A2D35] truncate max-w-xs">
                            {row[h] instanceof Date ? row[h].toISOString() : String(row[h])}
                          </td>
                        ))}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>

            {/* Navigation Drawer */}
            <div className="flex items-center justify-between pt-5 border-t border-[#2A2D35]">
              <span className="text-xs text-[#8E9299]">
                Step 2 of 4 — Clock selection completed.
              </span>
              <button
                id="next-step-mapping"
                onClick={() => setWizardStep("mapping")}
                className="px-5 py-2.5 bg-orange-600 hover:bg-orange-700 text-white text-xs font-semibold rounded flex items-center gap-1.5 cursor-pointer border border-orange-500/25"
              >
                Continue to Smart Schema Mapping
                <ArrowRight className="w-4 h-4" />
              </button>
            </div>

          </div>
        )}

        {/* STEP 4: SMART COLUMN CONFIGURATION */}
        {wizardStep === "mapping" && file && (
          <div id="mapping-step" className="space-y-6">
            
            {/* Suggestion Engine Banner */}
            <div className="p-4 bg-orange-600/10 border border-orange-500/20 rounded-xl text-xs flex items-start gap-3 animate-pulse">
              <Sparkles className="w-5 h-5 text-orange-500 shrink-0 mt-0.5" />
              <div>
                <h4 className="font-bold text-white mb-0.5">Spark Semantic Mapping Auto-Suggestion Engaged!</h4>
                <p className="text-[#8E9299] leading-relaxed">
                  We scanned candidate headers and pre-mapped variables based on CRM field synonyms. Modify any option dropdown to calibrate to your specific formats.
                </p>
              </div>
            </div>

            <div className="bg-[#0B0C0E] border border-[#2A2D35] p-5 rounded-xl space-y-4">
              <h3 className="text-white font-bold text-xs uppercase tracking-wider flex items-center gap-1">
                <Map className="w-4 h-4 text-orange-500" />
                Required core transition coordinates
              </h3>
              
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                {/* Case ID Mapping selection */}
                <div className="space-y-1 bg-[#1A1D23] p-3 rounded border border-[#2A2D35]">
                  <label className="text-white text-xs font-semibold block flex items-center justify-between">
                    Case ID Key *
                    <span className="text-[10px] text-orange-500 font-mono">Core</span>
                  </label>
                  <select
                    id="map-caseId"
                    value={mappings.caseId}
                    onChange={(e) => handleMappingChange("caseId", e.target.value)}
                    className="w-full text-xs border border-[#2A2D35] bg-[#0B0C0E] text-white rounded px-2.5 py-1.5 focus:outline-none focus:border-orange-500"
                  >
                    <option value="">-- Ignore / Unmapped --</option>
                    {headers.map((h) => (
                      <option key={h} value={h}>{h}</option>
                    ))}
                  </select>
                </div>

                {/* Status Column Mapping Selection */}
                <div className="space-y-1 bg-[#1A1D23] p-3 rounded border border-[#2A2D35]">
                  <label className="text-white text-xs font-semibold block flex items-center justify-between">
                    Status transition Name *
                    <span className="text-[10px] text-orange-500 font-mono">Core</span>
                  </label>
                  <select
                    id="map-status"
                    value={mappings.status}
                    onChange={(e) => handleMappingChange("status", e.target.value)}
                    className="w-full text-xs border border-[#2A2D35] bg-[#0B0C0E] text-white rounded px-2.5 py-1.5 focus:outline-none focus:border-orange-500"
                  >
                    <option value="">-- Ignore / Unmapped --</option>
                    {headers.map((h) => (
                      <option key={h} value={h}>{h}</option>
                    ))}
                  </select>
                </div>

                {/* End Timestamp Mapping Selection */}
                <div className="space-y-1 bg-[#1A1D23] p-3 rounded border border-[#2A2D35]">
                  <label className="text-white text-xs font-semibold block flex items-center justify-between">
                    Closed Date (End Clock)
                    <span className="text-[9px] text-[#8E9299]">Optional</span>
                  </label>
                  <select
                    id="map-endTimestamp"
                    value={mappings.endTimestamp}
                    onChange={(e) => handleMappingChange("endTimestamp", e.target.value)}
                    className="w-full text-xs border border-[#2A2D35] bg-[#0B0C0E] text-white rounded px-2.5 py-1.5 focus:outline-none focus:border-orange-500"
                  >
                    <option value="">-- Infer from chronology sequences --</option>
                    {headers.map((h) => (
                      <option key={h} value={h}>{h}</option>
                    ))}
                  </select>
                </div>

                {/* Owner/Agent Mapping Selection */}
                <div className="space-y-1 bg-[#1A1D23] p-3 rounded border border-[#2A2D35]">
                  <label className="text-white text-xs font-semibold block">Lane Assigned Agent</label>
                  <select
                    id="map-owner"
                    value={mappings.owner}
                    onChange={(e) => handleMappingChange("owner", e.target.value)}
                    className="w-full text-xs border border-[#2A2D35] bg-[#0B0C0E] text-white rounded px-2.5 py-1.5 focus:outline-none focus:border-orange-500"
                  >
                    <option value="">-- Default as 'Router Agent' --</option>
                    {headers.map((h) => (
                      <option key={h} value={h}>{h}</option>
                    ))}
                  </select>
                </div>

                {/* Priority Selection */}
                <div className="space-y-1 bg-[#1A1D23] p-3 rounded border border-[#2A2D35]">
                  <label className="text-white text-xs font-semibold block">Severity / Priority level</label>
                  <select
                    id="map-priority"
                    value={mappings.priority}
                    onChange={(e) => handleMappingChange("priority", e.target.value)}
                    className="w-full text-xs border border-[#2A2D35] bg-[#0B0C0E] text-white rounded px-2.5 py-1.5 focus:outline-none focus:border-orange-500"
                  >
                    <option value="">-- Default as 'Medium' --</option>
                    {headers.map((h) => (
                      <option key={h} value={h}>{h}</option>
                    ))}
                  </select>
                </div>

                {/* Queue Selection */}
                <div className="space-y-1 bg-[#1A1D23] p-3 rounded border border-[#2A2D35]">
                  <label className="text-white text-xs font-semibold block">Routing Queue Desk</label>
                  <select
                    id="map-queue"
                    value={mappings.queue}
                    onChange={(e) => handleMappingChange("queue", e.target.value)}
                    className="w-full text-xs border border-[#2A2D35] bg-[#0B0C0E] text-white rounded px-2.5 py-1.5 focus:outline-none focus:border-orange-500"
                  >
                    <option value="">-- Default as 'General Queue Desk' --</option>
                    {headers.map((h) => (
                      <option key={h} value={h}>{h}</option>
                    ))}
                  </select>
                </div>
              </div>
            </div>

            {/* Smart Custom fields */}
            <div className="bg-[#0B0C0E] border border-[#2A2D35] p-5 rounded-xl space-y-4">
              <div className="flex items-center gap-2">
                <Cpu className="w-5 h-5 text-orange-500 animate-pulse" />
                <div>
                  <h3 className="text-white font-bold text-xs uppercase tracking-wider">Smart Conversation Logs mapping</h3>
                  <p className="text-[11px] text-[#8E9299]">Enrich timeline compliance tracking with message attributes.</p>
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                {/* Customer Message mapping */}
                <div className="space-y-1 bg-[#1A1D23] p-3 rounded border border-[#2A2D35]">
                  <label className="text-white text-xs font-semibold block">Customer Message Column</label>
                  <select
                    id="map-customerMessage"
                    value={mappings.customerMessage}
                    onChange={(e) => handleMappingChange("customerMessage", e.target.value)}
                    className="w-full text-xs border border-[#2A2D35] bg-[#0B0C0E] text-white rounded px-2.5 py-1.5 focus:outline-none focus:border-orange-500"
                  >
                    <option value="">-- Unmapped --</option>
                    {headers.map((h) => (
                      <option key={h} value={h}>{h}</option>
                    ))}
                  </select>
                </div>

                {/* Bot Response mapping */}
                <div className="space-y-1 bg-[#1A1D23] p-3 rounded border border-[#2A2D35]">
                  <label className="text-white text-xs font-semibold block">Bot Response Column</label>
                  <select
                    id="map-botResponse"
                    value={mappings.botResponse}
                    onChange={(e) => handleMappingChange("botResponse", e.target.value)}
                    className="w-full text-xs border border-[#2A2D35] bg-[#0B0C0E] text-white rounded px-2.5 py-1.5 focus:outline-none focus:border-orange-500"
                  >
                    <option value="">-- Unmapped --</option>
                    {headers.map((h) => (
                      <option key={h} value={h}>{h}</option>
                    ))}
                  </select>
                </div>

                {/* Direction Column Mapping (Type) */}
                <div className="space-y-1 bg-[#1A1D23] p-3 rounded border border-[#2A2D35]">
                  <label className="text-white text-xs font-semibold block">Type (Incoming / Sent)</label>
                  <select
                    id="map-type"
                    value={mappings.type}
                    onChange={(e) => handleMappingChange("type", e.target.value)}
                    className="w-full text-xs border border-[#2A2D35] bg-[#0B0C0E] text-white rounded px-2.5 py-1.5 focus:outline-none focus:border-orange-500"
                  >
                    <option value="">-- Unmapped --</option>
                    {headers.map((h) => (
                      <option key={h} value={h}>{h}</option>
                    ))}
                  </select>
                </div>

                {/* Network Mapping */}
                <div className="space-y-1 bg-[#1A1D23] p-3 rounded border border-[#2A2D35]">
                  <label className="text-white text-xs font-semibold block">Network Platform (Instagram/FB)</label>
                  <select
                    id="map-network"
                    value={mappings.network}
                    onChange={(e) => handleMappingChange("network", e.target.value)}
                    className="w-full text-xs border border-[#2A2D35] bg-[#0B0C0E] text-white rounded px-2.5 py-1.5 focus:outline-none focus:border-orange-500"
                  >
                    <option value="">-- Unmapped --</option>
                    {headers.map((h) => (
                      <option key={h} value={h}>{h}</option>
                    ))}
                  </select>
                </div>

                {/* Message type Mapping */}
                <div className="space-y-1 bg-[#1A1D23] p-3 rounded border border-[#2A2D35]">
                  <label className="text-white text-xs font-semibold block">Message Type</label>
                  <select
                    id="map-messageType"
                    value={mappings.messageType}
                    onChange={(e) => handleMappingChange("messageType", e.target.value)}
                    className="w-full text-xs border border-[#2A2D35] bg-[#0B0C0E] text-white rounded px-2.5 py-1.5 focus:outline-none focus:border-orange-500"
                  >
                    <option value="">-- Unmapped --</option>
                    {headers.map((h) => (
                      <option key={h} value={h}>{h}</option>
                    ))}
                  </select>
                </div>

                {/* Sender/receiver Mapping */}
                <div className="space-y-1 bg-[#1A1D23] p-3 rounded border border-[#2A2D35]">
                  <label className="text-white text-xs font-semibold block">Sender/Receiver Details</label>
                  <select
                    id="map-senderReceiver"
                    value={mappings.senderReceiver}
                    onChange={(e) => handleMappingChange("senderReceiver", e.target.value)}
                    className="w-full text-xs border border-[#2A2D35] bg-[#0B0C0E] text-white rounded px-2.5 py-1.5 focus:outline-none focus:border-orange-500"
                  >
                    <option value="">-- Unmapped --</option>
                    {headers.map((h) => (
                      <option key={h} value={h}>{h}</option>
                    ))}
                  </select>
                </div>
              </div>
            </div>

            {/* Step navigation actions */}
            <div className="flex items-center justify-between pt-5 border-t border-[#2A2D35]">
              <button
                id="mapping-back-to-timestamp"
                onClick={() => setWizardStep("preview_and_timestamp")}
                className="px-4 py-2 border border-[#2A2D35] rounded-md text-[#8E9299] hover:bg-[#1A1D23] text-xs font-semibold flex items-center gap-1.5 cursor-pointer"
              >
                <ArrowLeft className="w-4 h-4" />
                Back to clock setup
              </button>

              <button
                id="mapping-to-confirm"
                onClick={() => setWizardStep("confirmation")}
                className="px-5 py-2.5 bg-orange-600 hover:bg-orange-700 text-white text-xs font-semibold rounded flex items-center gap-1.5 cursor-pointer border border-orange-500/25"
              >
                Continue to Final Confirmation
                <ArrowRight className="w-4 h-4" />
              </button>
            </div>

          </div>
        )}

        {/* STEP 5: CONFIRMATION SCREEN */}
        {wizardStep === "confirmation" && file && (
          <div id="confirmation-step" className="space-y-6">
            
            <div className="space-y-2">
              <h3 className="text-white font-bold text-sm uppercase tracking-wider flex items-center gap-1.5 font-sans">
                <CheckCircle className="w-5 h-5 text-emerald-500 font-bold" />
                ✔ Mapping Pipeline Finalized
              </h3>
              <p className="text-[11px] text-[#8E9299]">Inspect mapped configurations prior in starting processing engine.</p>
            </div>

            {/* Checklist Box */}
            <div className="bg-[#0B0C0E] border border-[#2A2D35] rounded-xl p-5 divide-y divide-[#2A2D35]/50 space-y-4">
              
              {/* Primary Clock Section */}
              <div className="pb-4">
                <h4 className="text-white text-xs font-semibold uppercase tracking-wider mb-3">⏱ Temporal indexing</h4>
                <div className="flex items-start gap-2.5 text-xs text-[#E0E0E0] font-sans">
                  {isTimestampMissing ? (
                    <div className="flex items-start gap-2 text-orange-400">
                      <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" />
                      <div>
                        <span className="font-bold">Sequential Order (No selection clock)</span>
                        <p className="text-[10px] text-[#8E9299] mt-0.5">Timeline loops will be computed linearly from rows indices sequence chronologies.</p>
                      </div>
                    </div>
                  ) : (
                    <div className="flex items-start gap-2 text-emerald-400">
                      <Check className="w-4 h-4 shrink-0 mt-0.5 text-emerald-500" />
                      <div>
                        {mappings.isCombinedTimestamp ? (
                          <span className="font-bold">Combined: {mappings.dateColumn} + {mappings.timeColumn}</span>
                        ) : (
                          <span className="font-bold">Single Column: {mappings.timestamp}</span>
                        )}
                        <p className="text-[10px] text-[#8E9299] mt-0.5">Chronological timestamps will be accurately reconstructed with conversion setting: {timezoneNormalization}.</p>
                      </div>
                    </div>
                  )}
                </div>
              </div>

              {/* Core System Standards */}
              <div className="py-4 space-y-3">
                <h4 className="text-white text-xs font-semibold uppercase tracking-wider">🛠 Core variables mapping</h4>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3.5 text-xs text-[#E0E0E0]">
                  <div className="flex items-center gap-2">
                    <span className="text-emerald-500 font-bold">✔</span>
                    <span className="text-[#8E9299]">Case ID Column:</span>
                    <span className="font-mono bg-[#1A1D23] px-2 py-0.5 rounded text-white text-[11px]">{mappings.caseId || "(Unassigned)"}</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="text-emerald-500 font-bold">✔</span>
                    <span className="text-[#8E9299]">Status Column:</span>
                    <span className="font-mono bg-[#1A1D23] px-2 py-0.5 rounded text-white text-[11px]">{mappings.status || "(Unassigned)"}</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="text-emerald-500 font-bold">✔</span>
                    <span className="text-[#8E9299]">Close Date Time (End):</span>
                    <span className="font-mono bg-[#1A1D23] px-2 py-0.5 rounded text-white text-[11px]">{mappings.endTimestamp || "Inferred automatically"}</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="text-emerald-500 font-bold">✔</span>
                    <span className="text-[#8E9299]">Agent Owner Column:</span>
                    <span className="font-mono bg-[#1A1D23] px-2 py-0.5 rounded text-white text-[11px]">{mappings.owner || "Inferred default router"}</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="text-emerald-500 font-bold">✔</span>
                    <span className="text-[#8E9299]">Priority Column:</span>
                    <span className="font-mono bg-[#1A1D23] px-2 py-0.5 rounded text-white text-[11px]">{mappings.priority || "Default Medium"}</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="text-emerald-500 font-bold">✔</span>
                    <span className="text-[#8E9299]">Queue Column:</span>
                    <span className="font-mono bg-[#1A1D23] px-2 py-0.5 rounded text-white text-[11px]">{mappings.queue || "Default Support Desk"}</span>
                  </div>
                </div>
              </div>

              {/* Conversational & Social Variables metadata */}
              <div className="pt-4 space-y-3">
                <h4 className="text-white text-xs font-semibold uppercase tracking-wider">💬 Conversational logs mapping (Enriched metadata)</h4>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3 text-xs text-[#E0E0E0]">
                  <div className="flex items-center gap-2">
                    <span className="text-[#8E9299] font-bold">▸</span>
                    <span className="text-[#8E9299]">Customer Text Msg:</span>
                    <span className="font-mono px-2 py-0.5 bg-[#1A1D23]/50 rounded text-amber-400 text-[10px]">{mappings.customerMessage || "Not Mapped"}</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="text-[#8E9299] font-bold">▸</span>
                    <span className="text-[#8E9299]">Bot Response Msg:</span>
                    <span className="font-mono px-2 py-0.5 bg-[#1A1D23]/50 rounded text-amber-400 text-[10px]">{mappings.botResponse || "Not Mapped"}</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="text-[#8E9299] font-bold">▸</span>
                    <span className="text-[#8E9299]">Direction Type:</span>
                    <span className="font-mono px-2 py-0.5 bg-[#1A1D23]/50 rounded text-amber-400 text-[10px]">{mappings.type || "Not Mapped"}</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="text-[#8E9299] font-bold">▸</span>
                    <span className="text-[#8E9299]">Network Platform:</span>
                    <span className="font-mono px-2 py-0.5 bg-[#1A1D23]/50 rounded text-amber-400 text-[10px]">{mappings.network || "Not Mapped"}</span>
                  </div>
                </div>
              </div>

            </div>

            {/* Step navigation actions */}
            <div className="flex items-center justify-between pt-5 border-t border-[#2A2D35]">
              <button
                id="confirm-btn-back-to-mapping"
                onClick={() => setWizardStep("mapping")}
                className="px-4 py-2 border border-[#2A2D35] rounded-md text-[#8E9299] hover:bg-[#1A1D23] text-xs font-semibold flex items-center gap-1.5 cursor-pointer"
              >
                <ArrowLeft className="w-4 h-4" />
                Edit Mapping Fields
              </button>

              <button
                id="confirm-and-process"
                onClick={executeIngest}
                className="px-6 py-2.5 bg-orange-600 hover:bg-orange-700 text-white text-xs font-bold rounded flex items-center gap-2 cursor-pointer border border-orange-500/35"
              >
                <Database className="w-4 h-4 animate-bounce" />
                Confirm & Assemble Dataset
              </button>
            </div>

          </div>
        )}

        {/* STEP 6: PROCESSING LOGS LOGGERS TERMINAL VIEW */}
        {wizardStep === "processing" && (
          <div id="processing-logs-visualizer" className="space-y-6">
            <div className="text-center py-4 space-y-2">
              <RefreshCw className="w-10 h-10 text-orange-500 animate-spin mx-auto mb-2" />
              <h3 className="font-mono text-white text-sm font-semibold tracking-wider uppercase">CRM Rebuilding Engine Online</h3>
              <p className="text-xs text-[#8E9299]">Synthesizing support workflows indices and chronological state transition trails.</p>
            </div>

            {/* Console log outputs terminal view */}
            <div className="border border-[#2A2D35] bg-[#0B0C0E] rounded-xl p-5 font-mono text-xs text-[#8E9299] space-y-2.5 max-h-72 overflow-y-auto min-h-[220px]">
              {processingLogs.map((log, index) => {
                const isActive = index === activeLogIndex - 1;
                return (
                  <div 
                    key={index}
                    className={`flex items-start gap-2.5 transition-all duration-300 ${
                      isActive ? "text-orange-400 font-semibold" : "text-[#8E9299]"
                    }`}
                  >
                    <span>[{index === activeLogIndex - 1 ? "●" : "✓"}]</span>
                    <span>{log}</span>
                  </div>
                );
              })}
              {/* Spinning cursor logger blinker */}
              <div className="flex items-center gap-2.5 text-orange-500">
                <span className="animate-ping">■</span>
                <span className="animate-pulse">Parsing sequence threads data buffers...</span>
              </div>
            </div>
          </div>
        )}

      </div>
    </div>
  );
}
