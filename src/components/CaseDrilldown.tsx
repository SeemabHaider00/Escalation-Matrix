import React, { useState } from "react";
import { 
  BarChart, 
  Bar, 
  XAxis, 
  YAxis, 
  Tooltip, 
  ResponsiveContainer 
} from "recharts";
import { 
  Clock, 
  User, 
  ShieldCheck, 
  Cpu, 
  AlertTriangle, 
  ChevronLeft, 
  MessageSquare, 
  CornerDownRight, 
  Calendar,
  Send,
  Flag
} from "lucide-react";
import { SupportCase } from "../types";

interface CaseDrilldownProps {
  activeCaseId: string;
  cases: SupportCase[];
  onGoBack: () => void;
  onAuditLog: (action: string, s: string) => void;
}

interface SimulatedComment {
  id: string;
  timestamp: string;
  user: string;
  note: string;
}

export default function CaseDrilldown({ activeCaseId, cases, onGoBack, onAuditLog }: CaseDrilldownProps) {
  const currentCase = cases.find((c) => c.caseId === activeCaseId);
  const [newComment, setNewComment] = useState("");
  
  // Keep local mock comments database state keyed by Case ID
  const [localComments, setLocalComments] = useState<Record<string, SimulatedComment[]>>({
    "CASE-9001": [
      {
        id: "COM-001",
        timestamp: "2026-05-18T14:30:00Z",
        user: "Marcus Brody (Escalation Principal)",
        note: "Escalated to engineering because DB cluster lock-up is blocking our largest APAC logistics clients from printing shipping slips."
      },
      {
        id: "COM-002",
        timestamp: "2026-05-20T11:45:00Z",
        user: "Alex Rivera (Tech Lead)",
        note: "Database locks traced to a raw un-indexed billing queue lookup sequence run every hour. Patched with an index. Run active stress testing verification."
      }
    ],
    "CASE-9002": [
      {
        id: "COM-003",
        timestamp: "2026-05-19T09:00:00Z",
        user: "System Core Pool Rules",
        note: "Case flagged as potentially stalled in Financial lanes. Auto-reminder ping dispatched to accounts router queue."
      }
    ],
    "CASE-9004": [
      {
        id: "COM-004",
        timestamp: "2026-05-20T13:30:00Z",
        user: "Billing_Aide_Bot",
        note: "Client request for retrospective credit of $1,200.00 exceeds standard bot clearance allowance of $250.00. Automatic rejection and redirect to human supervisor."
      }
    ]
  });

  if (!currentCase) {
    return (
      <div id="drilldown-fallback" className="bg-[#15171C] rounded-xl border border-[#2A2D35] p-12 text-center text-[#8E9299]">
        <AlertTriangle className="w-10 h-10 text-orange-500 mx-auto mb-3" />
        <h4 className="font-semibold text-white">Case profile not loaded</h4>
        <p className="text-xs text-[#8E9299] mt-1">Please select an ongoing support case row from operations queue to run diagnostics drill-down.</p>
        <button
          id="fallback-return"
          onClick={onGoBack}
          className="mt-4 px-4 py-2 bg-orange-600 hover:bg-orange-700 text-white rounded text-xs font-semibold transition cursor-pointer border border-orange-500/25"
        >
          Return to Operations Panel
        </button>
      </div>
    );
  }

  // Calculate durations for horizontal chart parsing
  const chartData = currentCase.transitions.map((t) => ({
    statusName: t.status.length > 20 ? t.status.substring(0, 18) + "..." : t.status,
    "Duration Hours": t.durationHours
  }));

  const commentsList = localComments[currentCase.caseId] || [];

  const addComment = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newComment.trim()) return;

    const commentObj: SimulatedComment = {
      id: `COM-${Date.now().toString().substring(8)}`,
      timestamp: new Date().toISOString(),
      user: "Seemab.Haider00@gmail.com (Ops Supervisor)",
      note: newComment.trim()
    };

    setLocalComments((prev) => ({
      ...prev,
      [currentCase.caseId]: [...(prev[currentCase.caseId] || []), commentObj]
    }));

    setNewComment("");

    // Audit trace submission
    onAuditLog("CASE_AUDIT_JOURNAL_LOG", `Logged custom supervisor notes to case profile: ${currentCase.caseId}. Note: "${commentObj.note.substring(0, 40)}..."`);
  };

  return (
    <div id="case-drilldown-root" className="space-y-6">
      
      {/* Return header trigger */}
      <div className="flex items-center justify-between">
        <button
          id="drilldown-back-btn"
          onClick={onGoBack}
          className="text-xs text-[#8E9299] hover:text-white font-semibold flex items-center gap-1 bg-[#1A1D23] border border-[#2A2D35] px-3 py-1.5 rounded-lg shadow-sm transition-colors cursor-pointer"
        >
          <ChevronLeft className="w-4 h-4" />
          Back to Live Queues List
        </button>
        <div className="flex items-center gap-2">
          <span className="text-[10px] bg-[#1A1D23] text-[#8E9299] font-semibold px-2 py-0.5 rounded font-mono border border-[#2A2D35]">
            Confidence Index: {currentCase.confidenceScore}%
          </span>
          <span className={`text-[10px] uppercase font-bold px-2 py-0.5 rounded border ${
            currentCase.isClosed 
              ? "bg-[#2A2D35] text-[#8E9299] border-[#2A2D35]" 
              : "bg-emerald-950/40 text-emerald-400 border-emerald-900/30"
          }`}>
            {currentCase.isClosed ? "Archived - Closed" : "ACTIVE OPEN CASE"}
          </span>
        </div>
      </div>

      {/* Primary case meta indicators */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4 bg-[#15171C] p-5 rounded-xl border border-[#2A2D35]">
        
        {/* Profile Card */}
        <div className="border-r border-[#2A2D35] pr-4 space-y-1.5 min-w-0">
          <span className="text-[#8E9299] font-bold text-[10px] uppercase tracking-wider block font-sans">Diagnostics Ticket Profile</span>
          <h2 id="drill-case-id" className="text-xl font-bold font-mono text-white truncate">
            {currentCase.caseId}
          </h2>
          <p className="text-xs text-[#E0E0E0] truncate" title={currentCase.customerLink}>
            Customer: <b className="text-[#E0E0E0] font-mono">{currentCase.customerLink}</b>
          </p>
          <p className="text-[10px] text-[#8E9299] font-mono">
            Last modified: {new Date(currentCase.lastUpdated).toLocaleDateString()}
          </p>
        </div>

        {/* Priority card & Desk */}
        <div className="border-r border-[#2A2D35] px-0 md:px-4 space-y-2">
          <span className="text-[#8E9299] font-bold text-[10px] uppercase tracking-wider block">Queue Routing</span>
          <div className="space-y-1">
            <div className="flex items-center justify-between text-xs">
              <span className="text-[#8E9299]">Severity:</span>
              <span className={`px-2 py-0.2 rounded text-[10px] font-bold ${
                currentCase.priority === "Critical" 
                   ? "bg-red-900/60 text-red-200 border border-red-900/50" 
                  : currentCase.priority === "High" 
                    ? "bg-amber-900/60 text-amber-200 border border-amber-900/50" 
                    : "bg-[#2A2D35] text-[#E0E0E0]"
              }`}>
                {currentCase.priority}
              </span>
            </div>
            <div className="flex items-center justify-between text-xs text-[#8E9299] font-medium">
              <span>Lane Desk:</span>
              <span className="text-white font-semibold truncate max-w-[120px]">{currentCase.queue}</span>
            </div>
          </div>
        </div>

        {/* Age tracker */}
        <div className="border-r border-[#2A2D35] px-0 md:px-4 space-y-1">
          <span className="text-[#8E9299] font-bold text-[10px] uppercase tracking-wider block">Duration Ageing Clocks</span>
          <div className="flex items-baseline gap-1 mt-1">
            <h3 className="text-2xl font-bold text-white font-mono inline-block">{currentCase.totalAgeHours}h</h3>
            <span className="text-[10px] text-[#8E9299] font-sans">total lifecycle</span>
          </div>
          <div className="text-[10px] text-[#8E9299] flex justify-between font-sans">
            <span>Current lane backlog:</span>
            <span className="font-semibold text-white font-mono">{currentCase.timeInCurrentStatusHours} hrs</span>
          </div>
        </div>

        {/* SLA Status alerts card */}
        <div className="px-0 md:px-4 space-y-1.5">
          <span className="text-[#8E9299] font-bold text-[10px] uppercase tracking-wider block flex items-center justify-between">
            SLA Clock Progress
          </span>
          <div className={`p-2.5 rounded-lg border text-xs font-semibold ${
            currentCase.slaStatus === "BREACHED"
              ? "bg-red-950/40 text-red-400 border-red-900/40"
              : currentCase.slaStatus === "AT_RISK"
                ? "bg-amber-950/40 text-amber-400 border-amber-900/40"
                : "bg-emerald-950/40 text-emerald-400 border-emerald-900/30"
          }`}>
            <div className="flex items-center justify-between">
              <span>Status:</span>
              <span className="font-bold uppercase font-sans">
                {currentCase.slaStatus === "BREACHED" ? "BREACHED" : currentCase.slaStatus === "AT_RISK" ? "AT RISK" : "COMPLIANT"}
              </span>
            </div>
            <div className="flex items-center justify-between mt-1 text-[10px] font-normal font-sans">
              <span>Limit: {currentCase.slaTimeLimitHours}h</span>
              <span className="font-semibold">
                {currentCase.slaTimeRemainingHours > 0 ? `${currentCase.slaTimeRemainingHours}h remaining` : `${Math.abs(currentCase.slaTimeRemainingHours)}h overdue`}
              </span>
            </div>
          </div>
        </div>

      </div>

      {/* Main arrangement: Timeline details on LHS, notes & action logs on RHS */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        
        {/* LHS: SVG vertical timeline sequence of transitions history */}
        <div className="lg:col-span-2 bg-[#15171C] rounded-xl border border-[#2A2D35] p-5 space-y-6">
          <div className="flex items-center justify-between pb-3 border-b border-[#2A2D35]">
            <h3 className="text-white font-semibold text-xs uppercase tracking-wider flex items-center gap-1.5">
              <Clock className="w-4 h-4 text-orange-500" />
              CX Core Lifecycle Reconstructed Timeline
            </h3>
            <span className="text-[10px] text-[#8E9299] font-semibold uppercase font-mono">Chronological Order</span>
          </div>

          <div className="space-y-6 relative pl-3.5 before:content-[''] before:absolute before:left-5 before:top-2.5 before:bottom-2.5 before:w-0.5 before:bg-[#2A2D35] select-none">
            {currentCase.transitions.map((t, index) => {
              const isFirst = index === 0;
              const isLast = index === currentCase.transitions.length - 1;
              const hasGap = t.gapWithNextHours > 0;

              return (
                <div key={index} className="space-y-3">
                  {/* Timeline node row */}
                  <div className="relative pl-7 flex flex-col md:flex-row items-start md:items-center justify-between gap-2 bg-[#0B0C0E] p-3 rounded-lg border border-[#2A2D35] hover:bg-[#1A1D23] transition border-l-4 border-l-orange-500">
                    
                    {/* Visual left locator bullet */}
                    <span className={`absolute left-3.5 top-5 w-3 h-3 rounded-full border-2 border-[#15171C] shadow-sm shrink-0 ${
                      t.isAutomation ? "bg-orange-500" : "bg-white"
                    }`} />

                    {/* Step description */}
                    <div className="space-y-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="font-bold text-white text-xs">
                          {t.status}
                        </span>
                        {t.isAutomation && (
                          <span className="inline-flex items-center gap-0.5 bg-orange-500/10 text-orange-400 border border-orange-500/20 px-1.5 py-0.2 rounded text-[9px] font-bold uppercase font-mono">
                            <Cpu className="w-2.5 h-2.5 animate-pulse" /> Auto-Bot
                          </span>
                        )}
                      </div>
                      <div className="flex items-center gap-2 text-[10px] text-[#8E9299]">
                        <span className="inline-flex items-center gap-1">
                          <User className="w-3 h-3 text-[#8E9299]" /> {t.owner}
                        </span>
                        <span>•</span>
                        <span className="font-mono">{new Date(t.startTimestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })} to {new Date(t.endTimestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span>
                      </div>
                    </div>

                    {/* Duration badge */}
                    <div className="text-right shrink-0">
                      <span className="text-xs font-bold font-mono text-white bg-[#1A1D23] border border-[#2A2D35] px-2.5 py-1 rounded">
                        {t.durationHours} hrs
                      </span>
                    </div>

                  </div>

                  {/* Overlap and Gap notification widgets */}
                  {t.isOverlap && (
                    <div className="ml-7 flex items-center gap-2 text-[10px] bg-red-950/40 text-red-200 p-2.5 rounded-lg border border-red-900/30 border-l-4 border-l-red-500 font-sans">
                      <AlertTriangle className="w-3.5 h-3.5 shrink-0 text-red-400" />
                      <span><b>Timeline overlap:</b> This transition start date overlaps with preceding timestamps. Indicates duplicate logging sequence errors in raw sheets.</span>
                    </div>
                  )}

                  {hasGap && (
                    <div className="ml-7 flex items-center gap-2 text-[10px] bg-amber-950/40 text-amber-200 p-2.5 rounded-lg border border-amber-900/30 border-l-4 border-l-amber-500 font-sans">
                      <Clock className="w-3.5 h-3.5 text-amber-500 shrink-0" />
                      <span><b>Chronological duration gap:</b> Found transition audit idle gap of <b className="font-mono">{t.gapWithNextHours} hrs</b> before next agent picked up task.</span>
                    </div>
                  )}
                </div>
              );
            })}
          </div>

          {/* Core Horizontal Duration Distribution Chart */}
          <div className="pt-4 border-t border-[#2A2D35]">
            <h4 className="text-white font-semibold text-xs mb-3 flex items-center gap-1 uppercase tracking-wider">
              <Flag className="w-3.5 h-3.5 text-orange-500" /> Bottleneck Status Comparison
            </h4>
            <div className="h-40">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={chartData} layout="vertical">
                  <XAxis type="number" stroke="#8e9299" fontSize={9} tickLine={false} />
                  <YAxis type="category" dataKey="statusName" stroke="#8e9299" fontSize={9} width={90} tickLine={false} />
                  <Tooltip 
                    contentStyle={{ backgroundColor: '#1A1D23', borderColor: '#2A2D35', color: '#E0E0E0' }} 
                    formatter={(value) => [`${value} hrs`, "Time in Status"]} 
                  />
                  <Bar dataKey="Duration Hours" fill="#ea580c" radius={[0, 4, 4, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </div>

        </div>

        {/* RHS: Audit journals & supervisor actions comments */}
        <div className="bg-[#15171C] rounded-xl border border-[#2A2D35] p-5 flex flex-col justify-between h-full min-h-[440px]">
          <div>
            <div className="flex items-center justify-between pb-3 border-b border-[#2A2D35] mb-4">
              <h3 className="text-white font-semibold text-xs uppercase tracking-wider flex items-center gap-1.5">
                <MessageSquare className="w-4 h-4 text-orange-500" />
                SLA Compliance Logs / Activity Notes
              </h3>
              <span className="text-[10px] text-[#E0E0E0] bg-[#2A2D35] px-2 py-0.5 rounded font-semibold font-mono">{commentsList.length} Notes</span>
            </div>

            {/* Note logs container scrollable */}
            <div className="space-y-4 max-h-[300px] overflow-y-auto pr-1">
              {commentsList.length === 0 ? (
                <div className="py-8 text-center text-[#8E9299] text-xs italic space-y-1">
                  <p>No active escalation comments registered.</p>
                  <p className="text-[10px] text-[#8E9299]">Add custom supervisor sign-offs below.</p>
                </div>
              ) : (
                commentsList.map((com) => (
                  <div key={com.id} className="bg-[#0B0C0E] border border-[#2A2D35] p-3 rounded-lg text-xs space-y-1 relative">
                    <div className="flex items-center justify-between text-[10px] text-[#8E9299] font-semibold">
                      <span className="text-[#E0E0E0] block text-[11px] font-bold">{com.user}</span>
                      <span>{new Date(com.timestamp).toLocaleDateString()}</span>
                    </div>
                    <p className="text-[#E0E0E0] font-medium font-sans mt-1.5 leading-relaxed bg-[#1A1D23] p-2 rounded border border-[#2A2D35]">
                      {com.note}
                    </p>
                  </div>
                ))
              )}
            </div>
          </div>

          {/* Form to submit supervisory comments */}
          <form onSubmit={addComment} className="pt-4 border-t border-[#2A2D35] mt-4 space-y-2.5">
            <span className="text-white font-semibold text-xs block">
              Log Supervision Activity Note
            </span>
            <div className="relative">
              <textarea
                id="comment-textarea"
                rows={2}
                placeholder="Log incident update, SLA sign-offs, or workload shift notes..."
                value={newComment}
                onChange={(e) => setNewComment(e.target.value)}
                className="w-full text-xs border border-[#2A2D35] bg-[#1A1D23] rounded-lg p-2 focus:outline-none focus:border-orange-500 text-white font-medium placeholder-[#8E9299]"
              />
            </div>
            <button
              id="submit-comment-btn"
              type="submit"
              disabled={!newComment.trim()}
              className="w-full py-1.5 bg-orange-600 hover:bg-orange-700 disabled:bg-[#2A2D35] disabled:text-[#8E9299] transition text-[11px] font-semibold rounded-md shadow-sm flex items-center justify-center gap-1.5 cursor-pointer border-0"
            >
              <Send className="w-3.5 h-3.5" /> Submit Audit Entry
            </button>
          </form>

        </div>

      </div>

    </div>
  );
}
