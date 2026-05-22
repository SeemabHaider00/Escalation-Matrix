import React, { useState } from "react";
import { ShieldCheck, History, User, HeartHandshake, Eye, AlertCircle, Plus, Terminal } from "lucide-react";
import { AuditLog } from "../types";

interface AuditTrailPanelProps {
  logs: AuditLog[];
  activeRole: "Leadership" | "Operations" | "Analyst";
  onChangeRole: (role: "Leadership" | "Operations" | "Analyst") => void;
  onPostLog: (action: string, s: string) => void;
}

export default function AuditTrailPanel({ logs, activeRole, onChangeRole, onPostLog }: AuditTrailPanelProps) {
  const [filterRole, setFilterRole] = useState("All");
  const [testAction, setTestAction] = useState("");
  const [testText, setTestText] = useState("");

  const filteredLogs = logs.filter((l) => {
    return filterRole === "All" || l.role === filterRole;
  });

  const submitManualEvent = (e: React.FormEvent) => {
    e.preventDefault();
    if (!testAction.trim()) return;

    onPostLog(testAction.trim().toUpperCase(), testText.trim() || "Manual security clearance sign-off recorded");
    setTestAction("");
    setTestText("");
  };

  return (
    <div id="audit-trail-panel-root" className="grid grid-cols-1 lg:grid-cols-3 gap-6">

      {/* Role Manager & Ingestion Simulator on LHS */}
      <div className="bg-[#15171C] p-5 rounded-xl border border-[#2A2D35] space-y-5 h-full">
        
        {/* Role based selection description */}
        <div className="space-y-2 border-b border-[#2A2D35] pb-4">
          <h3 className="text-white font-bold text-xs uppercase tracking-wider flex items-center gap-1.5">
            <ShieldCheck className="w-4 h-4 text-orange-500" />
            Core RBAC Permission Desk
          </h3>
          <p className="text-[11px] text-[#8E9299]">
            Switch mock supervisor accounts and credentials authorization to test dashboard view rules.
          </p>

          <div className="grid grid-cols-3 gap-1.5 pt-2">
            {(["Leadership", "Operations", "Analyst"] as const).map((rl) => (
              <button
                id={`role-switch-${rl}`}
                key={rl}
                onClick={() => onChangeRole(rl)}
                className={`py-1.5 rounded text-[10px] font-bold border transition cursor-pointer select-none ${
                  activeRole === rl
                    ? "bg-orange-600 border-orange-500 text-white shadow-xs"
                    : "bg-[#0B0C0E] border-[#2A2D35] text-[#8E9299] hover:bg-[#1A1D23] hover:text-white"
                }`}
              >
                {rl}
              </button>
            ))}
          </div>
        </div>

        {/* Security parameters details */}
        <div className="bg-[#0B0C0E] border border-[#2A2D35] p-4 rounded-xl space-y-3 select-none">
          <span className="text-[11px] text-[#8E9299] font-semibold uppercase font-mono block">Authorized Credentials Scope</span>
          <div className="space-y-2 text-xs">
            <div className="flex items-center justify-between text-[#8E9299]">
              <span className="font-semibold">Active Operator ID:</span>
              <span className="font-mono bg-[#1A1D23] px-2 py-0.5 rounded border border-[#2A2D35] text-[10px] text-[#E0E0E0]">Seemab.Haider</span>
            </div>
            <div className="flex items-center justify-between text-[#8E9299]">
              <span className="font-semibold">Access Token Scope:</span>
              <span className="text-emerald-400 font-bold uppercase text-[10px]">Authorized (256-Bit)</span>
            </div>
            <div className="flex items-center justify-between text-[#8E9299]">
              <span className="font-semibold">Active View Mode:</span>
              <span className="text-[#E0E0E0] font-bold">
                {activeRole === "Leadership" ? "Executive Analytics" : activeRole === "Operations" ? "Queue Supervisor" : "Data Modeler"}
              </span>
            </div>
          </div>
        </div>

        {/* Event Simulator */}
        <form onSubmit={submitManualEvent} className="space-y-3.5 border-t border-[#2A2D35] pt-4">
          <span className="text-white font-semibold text-xs flex items-center gap-1">
            <Terminal className="w-3.5 h-3.5 text-orange-500" />
            Audit Log Event Simulator
          </span>
          <div className="space-y-2 text-xs">
            <input
              id="audit-action-input"
              type="text"
              placeholder="Action (e.g., MANUAL_SLA_OVERRIDE)"
              value={testAction}
              onChange={(e) => setTestAction(e.target.value)}
              className="w-full border border-[#2A2D35] bg-[#1A1D23] text-white rounded px-2.5 py-1.5 focus:outline-none focus:border-orange-500 font-medium placeholder-[#8E9299]"
            />
            <input
              id="audit-details-input"
              type="text"
              placeholder="Action description or incident ticket ID..."
              value={testText}
              onChange={(e) => setTestText(e.target.value)}
              className="w-full border border-[#2A2D35] bg-[#1A1D23] text-white rounded px-2.5 py-1.5 focus:outline-none focus:border-orange-500 font-medium placeholder-[#8E9299]"
            />
            <button
              id="submit-sim-log"
              type="submit"
              disabled={!testAction.trim()}
              className="w-full py-1.5 bg-orange-600 hover:bg-orange-700 disabled:bg-[#2A2D35] disabled:text-[#8E9299] text-xs font-semibold rounded shadow transition cursor-pointer border-0"
            >
              Commit Compliance Record
            </button>
          </div>
        </form>

      </div>

      {/* RHS: Active Audit Logs lists table */}
      <div className="lg:col-span-2 bg-[#15171C] rounded-xl border border-[#2A2D35] p-5 space-y-4">
        
        {/* Table filter header controls */}
        <div className="flex items-center justify-between border-b border-[#2A2D35] pb-3">
          <h3 className="text-white font-semibold text-xs uppercase tracking-wider flex items-center gap-1.5">
            <History className="w-4 h-4 text-orange-505 animate-pulse" />
            System Operations Compliance Logs Trail
          </h3>

          <div className="flex items-center gap-1 text-xs select-none">
            <span className="text-[#8E9299] font-medium text-[11px] uppercase shrink-0">Filter System Log:</span>
            <select
              id="filter-audit-role"
              value={filterRole}
              onChange={(e) => setFilterRole(e.target.value)}
              className="text-[11px] border border-[#2A2D35] bg-[#1A1D23] text-white rounded px-2 py-0.5 focus:outline-none"
            >
              <option value="All">All Roles</option>
              <option value="Leadership">Leadership</option>
              <option value="Operations">Operations</option>
              <option value="Analyst">Analyst</option>
            </select>
          </div>
        </div>

        {/* Logs viewport list */}
        <div className="space-y-3.5 max-h-[440px] overflow-y-auto pr-1 font-sans">
          {filteredLogs.length === 0 ? (
            <div className="py-12 text-center text-[#8E9299] italic text-xs">No records correspond to role scope.</div>
          ) : (
            filteredLogs.map((log) => {
              let tagStyle = "bg-[#2A2D35] text-[#E0E0E0] border border-[#3E424B]";
              if (log.role === "Leadership") tagStyle = "bg-purple-950/40 text-purple-300 border border-purple-900/30";
              else if (log.role === "Operations") tagStyle = "bg-blue-950/40 text-blue-300 border border-blue-900/30";
              else if (log.role === "Analyst") tagStyle = "bg-amber-950/40 text-amber-300 border border-amber-900/30";

              return (
                <div key={log.id} className="p-3 bg-[#0B0C0E]/50 border border-[#2A2D35] rounded-xl space-y-1 hover:bg-[#1A1D23]/50 transition border-l-4 border-l-orange-500">
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-1 text-[11px]">
                    <div className="flex items-center gap-2">
                       <span className="font-extrabold font-mono text-white bg-[#1A1D23] px-1.5 py-0.2 rounded text-[10px] border border-[#2A2D35]">
                        {log.action}
                      </span>
                      <span className="text-[#8E9299]">•</span>
                      <span className="inline-flex items-center gap-0.5 text-[#8E9299]">
                        <User className="w-3 h-3" /> {log.user}
                      </span>
                    </div>
                    <div className="flex items-center gap-2 text-[#8E9299]">
                      <span className="font-mono">{new Date(log.timestamp).toLocaleTimeString()}</span>
                      <span className={`px-2 py-0.2 rounded text-[9px] font-bold ${tagStyle}`}>
                        {log.role}
                      </span>
                    </div>
                  </div>
                  <p className="text-[#E0E0E0] font-medium text-xs pl-1 pt-1">
                    {log.details}
                  </p>
                </div>
              );
            })
          )}
        </div>

      </div>

    </div>
  );
}
