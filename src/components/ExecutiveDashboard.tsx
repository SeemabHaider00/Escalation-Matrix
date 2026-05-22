import React, { useState } from "react";
import { 
  BarChart, 
  Bar, 
  XAxis, 
  YAxis, 
  Tooltip, 
  Legend, 
  ResponsiveContainer, 
  PieChart, 
  Pie, 
  Cell 
} from "recharts";
import { 
  Building2, 
  TrendingUp, 
  ShieldAlert, 
  Cpu, 
  Filter, 
  X, 
  HelpCircle, 
  Info,
  CalendarDays
} from "lucide-react";
import { SupportCase } from "../types";

interface ExecutiveDashboardProps {
  cases: SupportCase[];
}

const COLORS = {
  MET: "#10b981",       // emerald-500
  AT_RISK: "#f59e0b",   // amber-500
  BREACHED: "#ef4444",  // red-500
};

export default function ExecutiveDashboard({ cases }: ExecutiveDashboardProps) {
  // Filters state
  const [priorityFilter, setPriorityFilter] = useState("All");
  const [queueFilter, setQueueFilter] = useState("All");
  const [isTooltipOpen, setIsTooltipOpen] = useState(false);

  // Derive filter option sets
  const priorities = ["All", ...Array.from(new Set(cases.map((c) => c.priority)))];
  const queues = ["All", ...Array.from(new Set(cases.map((c) => c.queue)))];

  // Apply filters
  const filteredCases = cases.filter((c) => {
    const priorityMatch = priorityFilter === "All" || c.priority === priorityFilter;
    const queueMatch = queueFilter === "All" || c.queue === queueFilter;
    return priorityMatch && queueMatch;
  });

  // KPI Calculations
  const totalOpenCount = filteredCases.filter((c) => !c.isClosed).length;
  const totalClosedCount = filteredCases.filter((c) => c.isClosed).length;
  const breachCount = filteredCases.filter((c) => c.slaStatus === "BREACHED").length;
  const riskCount = filteredCases.filter((c) => c.slaStatus === "AT_RISK").length;
  
  const totalCasesCount = filteredCases.length;
  const slaBreachRate = totalCasesCount > 0 ? (breachCount / totalCasesCount) * 100 : 0;
  const slaMetRate = totalCasesCount > 0 ? ((totalCasesCount - breachCount - riskCount) / totalCasesCount) * 100 : 0;

  // Average resolution and ageing
  const averageAgeHours = totalCasesCount > 0 
    ? filteredCases.reduce((acc, c) => acc + c.totalAgeHours, 0) / totalCasesCount 
    : 0;

  const averageAutomationPercentage = totalCasesCount > 0
    ? filteredCases.reduce((acc, c) => acc + c.automationPercentage, 0) / totalCasesCount
    : 0;

  // Pie Chart Data: SLA Breakdowns
  const slaPieData = [
    { name: "MET", value: filteredCases.filter((c) => c.slaStatus === "MET").length, color: COLORS.MET },
    { name: "AT RISK", value: riskCount, color: COLORS.AT_RISK },
    { name: "BREACHED", value: breachCount, color: COLORS.BREACHED }
  ].filter(d => d.value > 0);

  // Grouped Bar Chart Data: SLA Status by Priority
  const priorityStatusMap: Record<string, { MET: number; AT_RISK: number; BREACHED: number }> = {};
  filteredCases.forEach((c) => {
    if (!priorityStatusMap[c.priority]) {
      priorityStatusMap[c.priority] = { MET: 0, AT_RISK: 0, BREACHED: 0 };
    }
    priorityStatusMap[c.priority][c.slaStatus]++;
  });

  const priorityChartData = Object.entries(priorityStatusMap).map(([priority, val]) => ({
    priority,
    MET: val.MET,
    AT_RISK: val.AT_RISK,
    BREACHED: val.BREACHED
  }));

  // Histogram Data: Case Ageing distribution
  const ageDistribution = [
    { range: "0 - 4 Hrs", count: filteredCases.filter((c) => c.totalAgeHours <= 4).length },
    { range: "4 - 12 Hrs", count: filteredCases.filter((c) => c.totalAgeHours > 4 && c.totalAgeHours <= 12).length },
    { range: "12 - 24 Hrs", count: filteredCases.filter((c) => c.totalAgeHours > 12 && c.totalAgeHours <= 24).length },
    { range: "24 - 48 Hrs", count: filteredCases.filter((c) => c.totalAgeHours > 24 && c.totalAgeHours <= 48).length },
    { range: "48+ Hrs", count: filteredCases.filter((c) => c.totalAgeHours > 48).length }
  ];

  // Table Data: Queue SLA Bottleneck pivot aggregation
  const queuePivotMap: Record<string, { total: number; breached: number; avgAgeHours: number; automationDurSum: number; caseCount: number }> = {};
  filteredCases.forEach((c) => {
    if (!queuePivotMap[c.queue]) {
      queuePivotMap[c.queue] = { total: 0, breached: 0, avgAgeHours: 0, automationDurSum: 0, caseCount: 0 };
    }
    const qObj = queuePivotMap[c.queue];
    qObj.caseCount++;
    qObj.total += c.totalAgeHours;
    if (c.slaStatus === "BREACHED") {
      qObj.breached++;
    }
    qObj.automationDurSum += c.automationPercentage;
  });

  const queuePivotList = Object.entries(queuePivotMap).map(([queueName, details]) => ({
    queueName,
    caseCount: details.caseCount,
    avgAge: Number((details.total / details.caseCount).toFixed(1)),
    slaBreachRate: Number(((details.breached / details.caseCount) * 100).toFixed(1)),
    avgAutomation: Number((details.automationDurSum / details.caseCount).toFixed(1))
  }));

  return (
    <div id="executive-dashboard-root" className="space-y-6">
      
      {/* Filtering row */}
      <div className="bg-[#15171C] p-4 rounded-xl border border-[#2A2D35] flex flex-wrap items-center justify-between gap-4">
        <div className="flex items-center gap-2">
          <Filter className="w-4 h-4 text-orange-400" />
          <span className="text-white font-semibold text-xs uppercase tracking-wider">Executive BI Filters</span>
        </div>
        <div className="flex flex-wrap items-center gap-3">
          {/* Priority selection selector */}
          <div className="flex items-center gap-1.5">
            <span className="text-[11px] text-[#8E9299] font-medium">Case Severity:</span>
            <select
              id="exec-priority-filter"
              value={priorityFilter}
              onChange={(e) => setPriorityFilter(e.target.value)}
              className="text-xs border border-[#2A2D35] bg-[#1A1D23] rounded-md px-2.5 py-1 focus:outline-none focus:border-orange-500 text-white"
            >
              {priorities.map((p) => (
                <option key={p} value={p}>{p}</option>
              ))}
            </select>
          </div>

          {/* Queue Selector */}
          <div className="flex items-center gap-1.5">
            <span className="text-[11px] text-[#8E9299] font-medium">CX Queue Desk:</span>
            <select
              id="exec-queue-filter"
              value={queueFilter}
              onChange={(e) => setQueueFilter(e.target.value)}
              className="text-xs border border-[#2A2D35] bg-[#1A1D23] rounded-md px-2.5 py-1 focus:outline-none focus:border-orange-500 text-white"
            >
              {queues.map((q) => (
                <option key={q} value={q}>{q}</option>
              ))}
            </select>
          </div>

          {(priorityFilter !== "All" || queueFilter !== "All") && (
            <button
              id="clear-exec-filters"
              onClick={() => {
                setPriorityFilter("All");
                setQueueFilter("All");
              }}
              className="p-1 px-2.5 bg-[#2A2D35] hover:bg-[#32363F] rounded text-white font-medium transition flex items-center gap-1 text-[11px]"
            >
              <X className="w-3 h-3" /> Clear
            </button>
          )}
        </div>
      </div>

      {/* Structured SaaS-style KPI grid */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {/* KPI 1: Active Ingestion Volume */}
        <div className="bg-[#15171C] p-5 rounded-xl border border-[#2A2D35] relative overflow-hidden flex flex-col justify-between">
          <div className="flex items-start justify-between">
            <div>
              <span className="text-[#8E9299] font-medium text-[11px] uppercase tracking-wider">Active Backlog</span>
              <h3 className="text-2xl font-bold font-mono text-white mt-1">{totalOpenCount} <span className="text-xs text-[#8E9299] font-normal font-sans">Open</span></h3>
            </div>
            <div className="p-2 bg-[#1A1D23] border border-[#2A2D35] rounded-lg text-[#8E9299]">
              <Building2 className="w-5 h-5 text-orange-400" />
            </div>
          </div>
          <div className="mt-4 flex items-center gap-1.5 text-xs text-[#8E9299]">
            <span className="font-semibold text-emerald-400 shrink-0">{totalClosedCount} Resolved Case Logs</span>
          </div>
        </div>

        {/* KPI 2: SLA Breach Metrics */}
        <div className="bg-[#15171C] p-5 rounded-xl border border-[#2A2D35] relative overflow-hidden flex flex-col justify-between">
          <div className="flex items-start justify-between">
            <div>
              <span className="text-[#8E9299] font-medium text-[11px] uppercase tracking-wider">SLA Failure Deficit</span>
              <h3 className="text-2xl font-bold font-mono text-red-400 mt-1">{slaBreachRate.toFixed(1)}%</h3>
            </div>
            <div className="p-2 bg-red-950/40 border border-red-900/40 text-red-400 rounded-lg">
              <ShieldAlert className="w-5 h-5" />
            </div>
          </div>
          <div className="mt-4 flex items-center gap-1.5 text-xs text-[#8E9299]">
            <span className="text-amber-400 font-medium">{riskCount} cases At SLA Risk</span>
          </div>
        </div>

        {/* KPI 3: Average case ageing duration */}
        <div className="bg-[#15171C] p-5 rounded-xl border border-[#2A2D35] relative overflow-hidden flex flex-col justify-between">
          <div className="flex items-start justify-between">
            <div>
              <span className="text-[#8E9299] font-medium text-[11px] uppercase tracking-wider">Average Case Ageing</span>
              <h3 className="text-2xl font-bold font-mono text-white mt-1">{averageAgeHours.toFixed(1)}h</h3>
            </div>
            <div className="p-2 bg-amber-950/40 border border-amber-900/40 text-amber-400 rounded-lg">
              <TrendingUp className="w-5 h-5" />
            </div>
          </div>
          <div className="mt-4 flex items-center gap-1.5 text-xs text-[#8E9299]">
            <span className="text-[#8E9299]">Total Lifecycle Duration index</span>
          </div>
        </div>

        {/* KPI 4: Automation handling ratio */}
        <div className="bg-[#15171C] p-5 rounded-xl border border-[#2A2D35] relative overflow-hidden flex flex-col justify-between">
          <div className="flex items-start justify-between">
            <div>
              <span className="text-[#8E9299] font-medium text-[11px] uppercase tracking-wider">Machine Automation Rate</span>
              <h3 className="text-2xl font-bold font-mono text-white mt-1">{averageAutomationPercentage.toFixed(1)}%</h3>
            </div>
            <div className="p-2 bg-[#1A1D23] border border-[#2A2D35] text-emerald-400 rounded-lg">
              <Cpu className="w-5 h-5 animate-pulse" />
            </div>
          </div>
          <div className="mt-4 flex items-center gap-1.5 text-xs text-[#8E9299]">
            <span className="text-[#8E9299]">Time-spent in automated states</span>
          </div>
        </div>
      </div>

      {/* Embedded Chart Analytics Row */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Chart 1: SLA Quality Allocation Pie */}
        <div className="bg-[#15171C] p-5 rounded-xl border border-[#2A2D35] flex flex-col justify-between">
          <div className="flex items-center justify-between pb-3 border-b border-[#2A2D35]">
            <h4 className="text-white font-semibold text-xs uppercase tracking-wider">SLA Met vs Breach Allocation</h4>
            <Info className="w-4 h-4 text-[#8E9299] cursor-help" onClick={() => setIsTooltipOpen(!isTooltipOpen)} />
          </div>
          
          <div className="h-48 relative flex items-center justify-center mt-4">
            {slaPieData.length === 0 ? (
              <p className="text-xs text-[#8E9299] italic">No corresponding records resolved.</p>
            ) : (
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie
                    data={slaPieData}
                    cx="50%"
                    cy="50%"
                    innerRadius={60}
                    outerRadius={80}
                    paddingAngle={3}
                    dataKey="value"
                  >
                    {slaPieData.map((entry, index) => (
                      <Cell key={`cell-${index}`} fill={entry.color} />
                    ))}
                  </Pie>
                  <Tooltip contentStyle={{ backgroundColor: '#1A1D23', borderColor: '#2A2D35', color: '#E0E0E0' }} formatter={(value) => [`${value} Cases`, "Status Volume"]} />
                </PieChart>
              </ResponsiveContainer>
            )}

            {/* Injected center KPI */}
            <div className="absolute flex flex-col items-center justify-center text-center">
              <span className="text-2xl font-bold text-white font-sans">{slaMetRate.toFixed(0)}%</span>
              <span className="text-[9px] text-[#8E9299] font-semibold uppercase">Met Target</span>
            </div>
          </div>

          <div className="flex items-center justify-center gap-4 text-xs mt-3 bg-[#0B0C0E] p-2.5 rounded-lg border border-[#2A2D35]">
            <div className="flex items-center gap-1">
              <span className="w-2.5 h-2.5 rounded-full bg-emerald-500"></span>
              <span className="text-[10px] text-[#E0E0E0] font-medium">Met (Passed)</span>
            </div>
            <div className="flex items-center gap-1">
              <span className="w-2.5 h-2.5 rounded-full bg-amber-500"></span>
              <span className="text-[10px] text-[#E0E0E0] font-medium">At Risk</span>
            </div>
            <div className="flex items-center gap-1">
              <span className="w-2.5 h-2.5 rounded-full bg-red-500"></span>
              <span className="text-[10px] text-[#E0E0E0] font-medium">Breached</span>
            </div>
          </div>
        </div>

        {/* Chart 2: SLA Status distribution grouped by Priority Card */}
        <div className="bg-[#15171C] p-5 rounded-xl border border-[#2A2D35]">
          <h4 className="text-white font-semibold text-xs uppercase tracking-wider pb-3 border-b border-[#2A2D35] mb-4">
            SLA Status Against Priority Severity
          </h4>
          <div className="h-52 mt-2">
            {priorityChartData.length === 0 ? (
              <div className="h-full flex items-center justify-center text-[#8E9299] text-xs italic">No cases dataset matched filters.</div>
            ) : (
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={priorityChartData}>
                  <XAxis dataKey="priority" stroke="#8e9299" fontSize={10} tickLine={false} />
                  <YAxis stroke="#8e9299" fontSize={10} tickLine={false} />
                  <Tooltip contentStyle={{ backgroundColor: '#1A1D23', borderColor: '#2A2D35', color: '#E0E0E0' }} />
                  <Legend wrapperStyle={{ fontSize: 9 }} />
                  <Bar dataKey="MET" name="SLA Met" fill="#10b981" stackId="a" />
                  <Bar dataKey="AT_RISK" name="At Risk" fill="#f59e0b" stackId="a" />
                  <Bar dataKey="BREACHED" name="Breached" fill="#ef4444" stackId="a" />
                </BarChart>
              </ResponsiveContainer>
            )}
          </div>
        </div>

        {/* Chart 3: Ageing Distribution Timeline */}
        <div className="bg-[#15171C] p-5 rounded-xl border border-[#2A2D35]">
          <h4 className="text-white font-semibold text-xs uppercase tracking-wider pb-3 border-b border-[#2A2D35] mb-4">
            Ticket Ageing Distribution (Backlog Histogram)
          </h4>
          <div className="h-52 mt-2">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={ageDistribution}>
                <XAxis dataKey="range" stroke="#8e9299" fontSize={10} tickLine={false} />
                <YAxis stroke="#8e9299" fontSize={10} tickLine={false} />
                <Tooltip contentStyle={{ backgroundColor: '#1A1D23', borderColor: '#2A2D35', color: '#E0E0E0' }} formatter={(value) => [`${value} Tickets`, "Active Cases"]} />
                <Bar dataKey="count" fill="#ea580c" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>
      </div>

      {/* Advanced Pivot Table: SLA bottlenecks by desk operations */}
      <div className="bg-[#15171C] rounded-xl border border-[#2A2D35] p-5 mt-6">
        <h4 className="text-white font-semibold text-xs uppercase tracking-wider pb-3 border-b border-[#2A2D35] mb-4 flex items-center gap-2">
          <CalendarDays className="w-4 h-4 text-orange-500" />
          Queue Bottleneck Performance & Pivot Analysis
        </h4>

        <div className="overflow-x-auto border border-[#2A2D35] rounded-lg">
          <table id="queue-pivot-table" className="w-full text-left border-collapse text-xs">
            <thead>
              <tr className="bg-[#0B0C0E] border-b border-[#2A2D35] text-[#8E9299] font-semibold">
                <th className="px-4 py-2.5">CX Queue Desk / Department</th>
                <th className="px-4 py-2.5 text-center">Ticket Count</th>
                <th className="px-4 py-2.5 text-center">Avg Case Age (Hours)</th>
                <th className="px-4 py-2.5 text-center">SLA Breach Deficit %</th>
                <th className="px-4 py-2.5 text-center">Avg Handoff Automation Rate</th>
                <th className="px-4 py-2.5">SLA Risk Assessment Rating</th>
              </tr>
            </thead>
            <tbody>
              {queuePivotList.length === 0 ? (
                <tr>
                   <td colSpan={6} className="px-4 py-6 text-[#8E9299] text-center italic bg-[#0B0C0E]">No data ingested to reconstruct queues.</td>
                </tr>
              ) : (
                queuePivotList.map((row) => {
                  // Operational risk color indicators
                  let riskBanner = "Normal Operational State";
                  let riskColor = "bg-emerald-950/40 text-emerald-400 border-emerald-900/30";
                  
                  if (row.slaBreachRate > 40 || row.avgAge > 30) {
                    riskBanner = "CRITICAL FAILURE RISK";
                    riskColor = "bg-red-950/40 text-red-400 border-red-900/30";
                  } else if (row.slaBreachRate > 15 || row.avgAge > 12) {
                    riskBanner = "At SLA Bottleneck Warning";
                    riskColor = "bg-amber-950/40 text-amber-400 border-amber-900/40";
                  }

                  return (
                    <tr key={row.queueName} className="border-b border-[#2A2D35] hover:bg-[#1A1D23]/50 transition bg-[#0B0C0E]/50">
                      <td className="px-4 py-3 font-semibold text-white">{row.queueName}</td>
                      <td className="px-4 py-3 text-center text-[#E0E0E0] font-medium font-mono">{row.caseCount}</td>
                      <td className="px-4 py-3 text-center text-[#E0E0E0] font-medium font-mono">{row.avgAge} hrs</td>
                      <td className="px-4 py-3 text-center font-bold text-red-400 font-mono">{row.slaBreachRate}%</td>
                      <td className="px-4 py-3 text-center text-[#8E9299] font-mono">{row.avgAutomation}%</td>
                      <td className="px-4 py-3">
                        <span className={`inline-block px-2.5 py-0.5 text-[10px] rounded-full border ${riskColor} font-bold`}>
                          {riskBanner}
                        </span>
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
  );
}
