import React, { useState } from "react";
import { 
  Search, 
  HelpCircle, 
  AlertOctagon, 
  Users, 
  Cpu, 
  ChevronRight, 
  FileDown, 
  Download, 
  Check, 
  ExternalLink,
  Hourglass,
  SlidersHorizontal,
  ArrowRightLeft
} from "lucide-react";
import { SupportCase } from "../types";

interface OperationsDashboardProps {
  cases: SupportCase[];
  onSelectCase: (caseId: string) => void;
  onAuditLog: (action: string, s: string) => void;
}

export default function OperationsDashboard({ cases, onSelectCase, onAuditLog }: OperationsDashboardProps) {
  const [searchTerm, setSearchTerm] = useState("");
  const [priorityFilter, setPriorityFilter] = useState("All");
  const [queueFilter, setQueueFilter] = useState("All");
  const [slaFilter, setSlaFilter] = useState("All");
  const [isExporting, setIsExporting] = useState(false);
  const [exportComplete, setExportComplete] = useState(false);

  // Derive filter selectors
  const priorities = ["All", ...Array.from(new Set(cases.map((c) => c.priority)))];
  const queues = ["All", ...Array.from(new Set(cases.map((c) => c.queue)))];
  const slaStatuses = ["All", "MET", "AT_RISK", "BREACHED"];

  // Search filter core logic
  const filteredCases = cases.filter((c) => {
    const term = searchTerm.toLowerCase();
    const matchesSearch = 
      c.caseId.toLowerCase().includes(term) || 
      c.customerLink.toLowerCase().includes(term) || 
      c.currentOwner.toLowerCase().includes(term) ||
      c.currentStatus.toLowerCase().includes(term);

    const matchesPriority = priorityFilter === "All" || c.priority === priorityFilter;
    const matchesQueue = queueFilter === "All" || c.queue === queueFilter;
    const matchesSla = slaFilter === "All" || c.slaStatus === slaFilter;

    return matchesSearch && matchesPriority && matchesQueue && matchesSla;
  });

  // 1. STUCK CASE DETECTION: Cases sitting too long or at risk
  const stuckCases = filteredCases.filter((c) => {
    return !c.isClosed && (c.timeInCurrentStatusHours > 12 || c.slaStatus === "BREACHED" || c.idleHours > 8);
  });

  // 2. WORKLOAD BALANCING: Group caseloads by human agents
  const agentWorkloadMap: Record<string, { total: number; criticalHigh: number; breached: number; averageRisk: number; isBot: boolean }> = {};
  cases.forEach((c) => {
    if (c.isClosed) return; // Only open cases matter for current workload
    const owner = c.currentOwner || "Unassigned";
    if (!agentWorkloadMap[owner]) {
      const isBot = /bot|system|auto/i.test(owner);
      agentWorkloadMap[owner] = { total: 0, criticalHigh: 0, breached: 0, averageRisk: 0, isBot };
    }
    const aObj = agentWorkloadMap[owner];
    aObj.total++;
    if (c.priority === "Critical" || c.priority === "High") {
      aObj.criticalHigh++;
    }
    if (c.slaStatus === "BREACHED") {
      aObj.breached++;
    }
    aObj.averageRisk += c.riskScore;
  });

  const agentWorkload = Object.entries(agentWorkloadMap).map(([agentName, details]) => ({
    agentName,
    caseCount: details.total,
    criticalHighCount: details.criticalHigh,
    breachCount: details.breached,
    avgRisk: Math.round(details.averageRisk / (details.total || 1)),
    isBot: details.isBot
  })).sort((a, b) => b.caseCount - a.caseCount);

  // Excel reporting mock export trigger
  const triggerExport = (format: "Excel" | "CSV") => {
    setIsExporting(true);
    setExportComplete(false);

    onAuditLog("EXCEL_EXPORT_TRIGGER", `Triggered full dashboard CSV/XLSX export for ${filteredCases.length} records.`);

    setTimeout(() => {
      setIsExporting(false);
      setExportComplete(true);

      // Trigger automatic virtual download file simulation
      const csvContent = "data:text/csv;charset=utf-8," 
        + "CaseID,Customer,Current Status,Queue,Priority,Owner,SLA Status,Age Hours,Automation %,Risk Score\n"
        + filteredCases.map(c => `"${c.caseId}","${c.customerLink}","${c.currentStatus}","${c.queue}","${c.priority}","${c.currentOwner}","${c.slaStatus}",${c.totalAgeHours},${c.automationPercentage},${c.riskScore}`).join("\n");
      const encodedUri = encodeURI(csvContent);
      const link = document.createElement("a");
      link.setAttribute("href", encodedUri);
      link.setAttribute("download", `CX_EscalationMatrix_Export_${new Date().toISOString().substring(0, 10)}.csv`);
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);

      setTimeout(() => setExportComplete(false), 3000);
    }, 1500);
  };

  return (
    <div id="operations-dashboard-root" className="space-y-6">

      {/* Top Warning Banner if Stuck cases detected */}
      {stuckCases.length > 0 && (
        <div id="stuck-alerts-banner" className="bg-red-950/40 border border-red-900/40 text-red-100 p-4 rounded-xl flex items-start gap-3.5 relative shadow-sm">
          <div className="bg-red-600 text-white rounded-lg p-1.5 shrink-0 mt-0.5">
            <AlertOctagon className="w-5 h-5 animate-pulse" />
          </div>
          <div className="space-y-1">
            <div className="flex items-center gap-2">
              <span className="font-bold text-sm text-white">Action Required: {stuckCases.length} Stuck / Overdue cases in active queue lanes</span>
              <span className="text-[10px] bg-red-605 text-white bg-red-600 font-bold px-2 py-0.5 rounded-full uppercase">SLA Alarm</span>
            </div>
            <p className="text-xs text-red-400">
              The following tickets have exceeded threshold targets, have logged high idle metrics (&gt;8h) or have looped transitions back-and-forth. Operational intervention is recommended.
            </p>
            {/* Quick list of first 3 stuck IDs */}
            <div className="flex flex-wrap gap-2 pt-2">
              {stuckCases.slice(0, 4).map((c) => (
                <button
                  id={`quick-stuck-${c.caseId}`}
                  key={c.caseId}
                  onClick={() => onSelectCase(c.caseId)}
                  className="bg-[#1A1D23] border border-red-900/40 text-red-400 font-bold font-mono px-2.5 py-1 text-[11px] rounded-md shadow-sm hover:bg-red-950/40 transition flex items-center gap-1"
                >
                  {c.caseId} ({c.priority}) <ChevronRight className="w-3" />
                </button>
              ))}
              {stuckCases.length > 4 && (
                <span className="text-xs text-red-400 font-semibold self-center ml-1">+{stuckCases.length - 4} more cases lagging</span>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Bento grid arrangement: Live Workloads on LHS, Table Filter controls on RHS */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        
        {/* LHS: Workload Distribution Diagnostics list */}
        <div className="bg-[#15171C] p-5 rounded-xl border border-[#2A2D35] flex flex-col justify-between">
          <div>
            <div className="flex items-center justify-between pb-3 border-b border-[#2A2D35] mb-4">
              <h3 className="text-white font-semibold text-xs uppercase tracking-wider flex items-center gap-1.5">
                <Users className="w-4 h-4 text-orange-400" />
                Operations Agent Workload Indices
              </h3>
              <span className="text-[10px] bg-[#2A2D35] px-2 py-0.5 rounded text-[#E0E0E0] font-semibold font-mono">Active Count</span>
            </div>

            <div className="space-y-3.5 max-h-[340px] overflow-y-auto pr-1">
              {agentWorkload.map((wp) => {
                const totalAssigned = wp.caseCount;
                if (totalAssigned === 0) return null;

                // Load diagnostics warning indicators
                let loadStatus = "Balanced Load";
                let loadStyle = "bg-[#2A2D35] text-[#E0E0E0] border border-[#2A2D35]";
                
                if (wp.isBot) {
                  loadStatus = "Bot Automator (No Limit)";
                  loadStyle = "bg-emerald-950/40 text-emerald-400 border border-emerald-900/30";
                } else if (totalAssigned >= 4 || wp.criticalHighCount >= 2) {
                  loadStatus = "CRITICAL BACKLOG WARNING";
                  loadStyle = "bg-red-950/40 text-red-400 border border-red-900/30 animate-pulse font-bold";
                } else if (totalAssigned > 2) {
                  loadStatus = "Heavy Load Monitor";
                  loadStyle = "bg-amber-950/40 text-amber-400 border border-amber-900/30";
                }

                return (
                  <div key={wp.agentName} className="bg-[#1A1D23]/50 border border-[#2A2D35] p-3 rounded-xl space-y-2 hover:bg-[#1A1D23] transition select-none">
                    <div className="flex items-center justify-between text-xs">
                      <span className="font-bold text-white truncate max-w-[140px] block">
                        {wp.agentName}
                      </span>
                      <div className="flex items-center gap-1.5 font-mono">
                        <span className="text-[#E0E0E0] font-bold">{totalAssigned} cases</span>
                        {wp.breachCount > 0 && (
                          <span className="bg-red-950/40 text-red-400 font-extrabold px-1.5 py-0.2 rounded text-[10px]">
                            {wp.breachCount} BREACHED
                          </span>
                        )}
                      </div>
                    </div>

                    <div className="flex items-center justify-between">
                      <span className={`inline-block px-2.5 py-0.5 text-[9px] rounded-md ${loadStyle}`}>
                        {loadStatus}
                      </span>
                      <span className="text-[10px] text-[#8E9299]">
                        Avg case risk: <b className="text-white font-bold">{wp.avgRisk}/100</b>
                      </span>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          <div className="text-[10px] text-[#8E9299] mt-4 flex items-center gap-1 bg-[#0B0C0E] p-2.5 rounded border border-[#2A2D35]">
            <Cpu className="text-orange-400 w-3.5 h-3.5" />
            <span>Bots assist in auto triage. Backlog warning alerts scale at 3+ cases.</span>
          </div>
        </div>

        {/* RHS: Interactive Cases list table */}
        <div className="lg:col-span-2 bg-[#15171C] rounded-xl border border-[#2A2D35] p-5 space-y-4">
          
          {/* Controls: Search & Filters UI */}
          <div className="flex flex-col md:flex-row items-stretch md:items-center justify-between gap-3 bg-[#0B0C0E] p-3 rounded-lg border border-[#2A2D35]">
            {/* Search query input */}
            <div className="relative flex-1">
              <Search className="w-4 h-4 text-[#8E9299] absolute left-3 top-2.5" />
              <input
                id="search-cases"
                type="text"
                placeholder="Search case IDs, agents, accounts, status..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="w-full text-xs pl-9 pr-3 py-2 border border-[#2A2D35] bg-[#1A1D23] rounded-md focus:outline-none focus:border-orange-500 text-white placeholder-[#8E9299]"
              />
            </div>

            {/* Filter buttons drawer opener simulated */}
            <div className="flex flex-wrap items-center gap-2">
              <SlidersHorizontal className="w-4 h-4 text-[#8E9299]" />
              <select
                id="filter-priority"
                value={priorityFilter}
                onChange={(e) => setPriorityFilter(e.target.value)}
                className="text-[11px] border border-[#2A2D35] bg-[#1A1D23] rounded px-2.5 py-1.5 focus:outline-none focus:border-orange-500 text-white font-medium"
              >
                <option value="All" className="bg-[#1A1D23]">All Severity</option>
                {priorities.filter(p => p !== "All").map((p) => (
                  <option key={p} value={p} className="bg-[#1A1D23]">{p}</option>
                ))}
              </select>

              <select
                id="filter-queue"
                value={queueFilter}
                onChange={(e) => setQueueFilter(e.target.value)}
                className="text-[11px] border border-[#2A2D35] bg-[#1A1D23] rounded px-2.5 py-1.5 focus:outline-none focus:border-orange-500 text-white font-medium max-w-[120px]"
              >
                <option value="All" className="bg-[#1A1D23]">All Queues</option>
                {queues.filter(q => q !== "All").map((q) => (
                  <option key={q} value={q} className="bg-[#1A1D23]">{q}</option>
                ))}
              </select>

              <select
                id="filter-sla"
                value={slaFilter}
                onChange={(e) => setSlaFilter(e.target.value)}
                className="text-[11px] border border-[#2A2D35] bg-[#1A1D23] rounded px-2.5 py-1.5 focus:outline-none focus:border-orange-500 text-white font-medium"
              >
                <option value="All" className="bg-[#1A1D23]">All SLA Status</option>
                {slaStatuses.filter(s => s !== "All").map((s) => (
                  <option key={s} value={s} className="bg-[#1A1D23]">{s}</option>
                ))}
              </select>
            </div>
          </div>

          {/* Cases grid header & exporter button */}
          <div className="flex items-center justify-between text-xs pt-1">
            <div className="text-[#8E9299] font-semibold font-mono">
              Displaying {filteredCases.length} mapped support case records
            </div>

            <div className="flex items-center gap-2">
              <button
                id="export-csv-btn"
                onClick={() => triggerExport("CSV")}
                disabled={filteredCases.length === 0}
                className="text-xs bg-orange-600 text-white rounded px-3 py-1.5 hover:bg-orange-700 disabled:bg-[#1A1D23] disabled:text-[#8E9299] transition font-semibold flex items-center gap-1.5 shadow-sm cursor-pointer border border-orange-500/30"
              >
                {isExporting ? (
                  <Hourglass className="w-3.5 h-3.5 animate-spin" />
                ) : exportComplete ? (
                  <Check className="w-3.5 h-3.5 text-emerald-400" />
                ) : (
                  <Download className="w-3.5 h-3.5" />
                )}
                Export Matched Cases
              </button>
            </div>
          </div>

          {/* Table contents */}
          <div className="overflow-x-auto border border-[#2A2D35] rounded-xl">
            <table id="operations-data-table" className="w-full text-left border-collapse text-xs select-none">
              <thead>
                <tr className="bg-[#1A1D23] border-b border-[#2A2D35] text-[#8E9299] font-semibold">
                  <th className="px-4 py-3">Case ID</th>
                  <th className="px-4 py-3">Customer Link</th>
                  <th className="px-4 py-3">Team Desk Queue</th>
                  <th className="px-4 py-3 text-center">Priority</th>
                  <th className="px-4 py-3 text-center">SLA Target Clock</th>
                  <th className="px-4 py-3 text-center">Age hours</th>
                  <th className="px-4 py-3 text-center">Risk Index</th>
                  <th className="px-4 py-3 text-right">Drill</th>
                </tr>
              </thead>
              <tbody>
                {filteredCases.length === 0 ? (
                  <tr>
                    <td colSpan={8} className="px-4 py-12 text-[#8E9299] text-center italic bg-[#15171C]">
                      No support cases matching the active filters were processed.
                    </td>
                  </tr>
                ) : (
                  filteredCases.map((c) => {
                    // Badge rendering configurations
                    let slaBadgeColor = "bg-emerald-950/40 text-emerald-400 border-emerald-900/30";
                    let slaLabel = "Met Target";
                    if (c.slaStatus === "BREACHED") {
                      slaBadgeColor = "bg-red-950/40 text-red-400 border-red-900/40";
                      slaLabel = `Breached SLA`;
                    } else if (c.slaStatus === "AT_RISK") {
                      slaBadgeColor = "bg-amber-950/40 text-amber-400 border-amber-900/40";
                      slaLabel = `At Risk`;
                    }

                    let priColor = "bg-[#2A2D35] text-[#E0E0E0]";
                    if (c.priority === "Critical") {
                      priColor = "bg-red-900/60 text-red-200 font-bold border border-red-900/50";
                    } else if (c.priority === "High") {
                      priColor = "bg-amber-900/60 text-amber-200 font-semibold border border-amber-900/50";
                    }

                    return (
                      <tr 
                        id={`case-row-${c.caseId}`}
                        key={c.caseId} 
                        onClick={() => onSelectCase(c.caseId)}
                        className="border-b border-[#2A2D35] hover:bg-[#1A1D23]/50 transition-all cursor-pointer select-none group"
                      >
                        <td className="px-4 py-3.5 font-bold font-mono text-white group-hover:text-orange-400 flex items-center gap-1.5">
                          {c.caseId}
                          {!c.isValidTimeline && (
                            <span className="w-2.5 h-2.5 bg-red-500 rounded-full inline-block" title="Unordered chronology detected" />
                          )}
                        </td>
                        <td className="px-4 py-3.5 text-[#E0E0E0] truncate max-w-[150px] font-medium" title={c.customerLink}>
                          {c.customerLink}
                        </td>
                        <td className="px-4 py-3.5 text-[#8E9299] truncate max-w-[130px] font-medium">
                          {c.queue}
                        </td>
                        <td className="px-4 py-3.5 text-center">
                          <span className={`inline-block px-2 py-0.2 rounded text-[9px] font-bold ${priColor}`}>
                            {c.priority}
                          </span>
                        </td>
                        <td className="px-4 py-3.5 text-center">
                          <span className={`inline-block px-2.5 py-0.5 rounded-full text-[10px] border font-bold ${slaBadgeColor}`}>
                            {slaLabel}
                          </span>
                        </td>
                        <td className="px-4 py-3.5 text-center text-white font-bold font-mono">
                          {c.totalAgeHours}h
                        </td>
                        <td className="px-4 py-3.5 text-center">
                          <div className="flex items-center justify-center gap-1">
                            <span className={`font-semibold font-sans text-xs ${c.riskScore > 60 ? "text-red-400" : c.riskScore > 30 ? "text-amber-400" : "text-emerald-400"}`}>
                              {c.riskScore}%
                            </span>
                            <div className="w-10 bg-[#0B0C0E] h-1.5 rounded-full overflow-hidden">
                              <div className={`h-full ${c.riskScore > 60 ? "bg-red-500" : c.riskScore > 30 ? "bg-amber-500" : "bg-emerald-500"}`} style={{ width: `${c.riskScore}%` }}></div>
                            </div>
                          </div>
                        </td>
                        <td className="px-4 py-3.5 text-right">
                          <button 
                            id={`drill-btn-${c.caseId}`}
                            className="p-1 text-[#8E9299] group-hover:text-white transition hover:bg-[#2A2D35] rounded"
                          >
                            <ExternalLink className="w-3.5 h-3.5" />
                          </button>
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>

        </div>

      </div>

    </div>
  );
}
