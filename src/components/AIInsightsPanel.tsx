import React, { useState } from "react";
import { 
  Sparkles, 
  HelpCircle, 
  AlertTriangle, 
  Cpu, 
  LineChart, 
  RefreshCw, 
  Check, 
  Info,
  Layers,
  Flame,
  UserCheck
} from "lucide-react";
import { SmartInsights } from "../types";

interface AIInsightsPanelProps {
  onAuditLog: (action: string, s: string) => void;
  casesCount: number;
}

export default function AIInsightsPanel({ onAuditLog, casesCount }: AIInsightsPanelProps) {
  const [insights, setInsights] = useState<SmartInsights | null>(null);
  const [loading, setLoading] = useState(false);
  const [providerInfo, setProviderInfo] = useState("");
  const [errorMessage, setErrorMessage] = useState("");

  const runAISweep = async () => {
    setLoading(true);
    setErrorMessage("");
    setInsights(null);

    // Track operation audit logging footprint
    onAuditLog("AI_INSIGHTS_TRIGGERED", `Dispatched full operations intelligence sweep request to Gemini model.`);

    try {
      const response = await fetch("/api/ai/insights", {
        method: "POST",
        headers: { "Content-Type": "application/json" }
      });

      if (!response.ok) {
        throw new Error("Generative engine returned non-200 state.");
      }

      const res = await response.json();
      setInsights(res.insights);
      setProviderInfo(res.provider || "Gemini Generative Provider");
    } catch (error: any) {
      console.error(error);
      setErrorMessage("The AI operational sweep experienced a connection timed out or is missing credentials inside Secrets config. Local fallback simulation ready.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div id="ai-insights-root" className="bg-[#15171C] rounded-xl border border-[#2A2D35] overflow-hidden">
      
      {/* Visual header */}
      <div className="bg-[#1A1D23] border-b border-[#2A2D35] px-6 py-5 text-white flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
        <div>
          <h2 className="font-sans font-bold text-base flex items-center gap-2">
            <Sparkles className="w-5 h-5 text-orange-500 animate-pulse" />
            Gemini GenAI Operational Diagnostician
          </h2>
          <p className="text-xs text-[#8E9299] mt-1">
            Analyze complex CRM case transition metadata, detect anomalies, patterns, and workload distribution options.
          </p>
        </div>
        
        {!loading && (
          <button
            id="start-ai-sweep"
            onClick={runAISweep}
            className="px-4 py-2 bg-[#d97706] hover:bg-[#b45309] text-white font-bold border border-orange-500/25 rounded-lg shadow-md hover:shadow-lg transition-all text-xs flex items-center gap-1.5 cursor-pointer shrink-0"
          >
            <Sparkles className="w-4 h-4" />
            Dispatch Operations Audit Sweep
          </button>
        )}
      </div>

      <div className="p-6">
        {/* State : Empty screen before running */}
        {!insights && !loading && !errorMessage && (
          <div id="ai-empty-state" className="py-12 flex flex-col items-center justify-center text-center max-w-xl mx-auto space-y-4">
            <div className="w-14 h-14 bg-orange-950/25 rounded-full flex items-center justify-center text-orange-400 border border-orange-900/30">
              <Sparkles className="w-7 h-7" />
            </div>
            <div>
              <h3 className="font-bold text-white text-sm">Review queue velocities with Gemini</h3>
              <p className="text-xs text-[#8E9299] mt-1.5 leading-relaxed">
                Gemini will scan the current timeline profiles for {casesCount} support cases, flag recurring queue bouncing loops, calculate transition gap averages, spot bottleneck lanes, and generate recommended workload distributions.
              </p>
            </div>
            <button
              id="ai-sweep-center-btn"
              onClick={runAISweep}
              className="px-5 py-2.5 bg-orange-600 hover:bg-orange-700 text-white rounded-md text-xs font-semibold shadow transition cursor-pointer"
            >
              Analyze Case Timeline Sequences
            </button>
          </div>
        )}

        {/* State : Loading state */}
        {loading && (
          <div id="ai-loading-state" className="py-16 flex flex-col items-center justify-center text-center space-y-4">
            <RefreshCw className="w-10 h-10 text-orange-500 animate-spin mb-1" />
            <div>
              <p className="text-white font-bold text-sm">Evaluating system transition histories...</p>
              <div className="flex items-center gap-1.5 justify-center mt-2.5 text-[10px] text-zinc-400 font-mono">
                <span className="inline-block px-2 py-0.5 bg-[#0B0C0E] text-[#8E9299] rounded animate-pulse">Isolating loops...</span>
                <span>•</span>
                <span className="inline-block px-2 py-0.5 bg-[#0B0C0E] text-[#8E9299] rounded animate-pulse">Scanning bottleneck times...</span>
                <span>•</span>
                <span className="inline-block px-2 py-0.5 bg-[#0B0C0E] text-[#8E9299] rounded animate-pulse">Validating SLAs...</span>
              </div>
            </div>
          </div>
        )}

        {/* State : Error Fallback UI */}
        {errorMessage && !loading && (
          <div id="ai-error-state" className="p-5 border border-orange-950/40 bg-orange-950/15 rounded-xl space-y-4 text-xs mb-4 max-w-lg mx-auto">
            <div className="flex items-start gap-3">
              <AlertTriangle className="w-5 h-5 text-orange-400 shrink-0 mt-0.5" />
              <div>
                <h4 className="font-bold text-orange-300 text-sm">Security Sandbox Alert</h4>
                <p className="text-[#E0E0E0] mt-1 leading-relaxed">{errorMessage}</p>
                <p className="text-[#8E9299] mt-2 font-mono text-[10px] bg-[#0B0C0E] p-2 rounded border border-[#2A2D35]/50">
                  Tip: Setup process.env.GEMINI_API_KEY under real cloud workspace variables to activate live server calls.
                </p>
              </div>
            </div>
            <div className="flex items-center gap-3 pt-2 justify-end border-t border-[#2A2D35]">
              <button
                id="close-error-msg"
                onClick={() => setErrorMessage("")}
                className="text-orange-450 hover:text-white font-bold cursor-pointer"
              >
                Reset Dashboard View
              </button>
              <button
                id="simulated-sweep-btn"
                onClick={async () => {
                  setLoading(true);
                  // Simulate fallback fetch with local seeded answers
                  const r = await fetch("/api/ai/insights", { method: "POST" });
                  const re = await r.json();
                  setInsights(re.insights);
                  setProviderInfo(re.provider);
                  setLoading(false);
                }}
                className="px-3.5 py-1.5 bg-orange-600 hover:bg-orange-700 text-white rounded text-xs font-semibold shadow transition cursor-pointer"
              >
                Access Simulated Benchmarks
              </button>
            </div>
          </div>
        )}

        {/* State: Generative Content Display */}
        {insights && !loading && (
          <div id="ai-response-viewport" className="space-y-6">
            
            {/* Top diagnostic metadata strip */}
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-[#2A2D35] pb-4">
              <div className="flex items-center gap-2">
                <span className="text-[10px] bg-orange-500/20 text-orange-400 border border-orange-950/40 px-2.5 py-1 rounded-full font-bold uppercase tracking-wider font-mono">
                  Operational Sweep Complete
                </span>
                <span className="text-[10px] text-[#8E9299] font-medium">Intel Source: {providerInfo}</span>
              </div>
              
              <div className="flex items-center gap-3">
                <span className="text-[#8E9299] font-medium text-xs">Process Consistency Confidence:</span>
                <div className="flex items-center gap-1.5">
                  <span className="text-sm font-extrabold text-orange-500 font-mono">{insights.confidenceScore}%</span>
                  <div className="w-16 bg-[#0B0C0E] h-2 rounded-full overflow-hidden">
                    <div className="h-full bg-orange-500 rounded-full" style={{ width: `${insights.confidenceScore}%` }} />
                  </div>
                </div>
              </div>
            </div>

            {/* Executive Summary Narrative */}
            <div className="bg-[#0B0C0E] p-4 border border-[#2A2D35] rounded-xl relative">
              <span className="absolute -top-2.5 left-4 px-2 bg-orange-600 border border-orange-500 text-white font-bold text-[9px] rounded uppercase tracking-widest font-mono">
                Executive Summation
              </span>
              <p className="text-xs text-[#E0E0E0] font-medium font-sans leading-relaxed pt-1.5">
                {insights.executiveSummary}
              </p>
            </div>

            {/* In-depth segmented drawers layout */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
              
              {/* Anomalies Card */}
              <div className="bg-[#0B0C0E] p-4 rounded-xl border border-[#2A2D35] space-y-3 shadow-xs">
                <h4 className="text-white font-bold text-xs uppercase tracking-wider flex items-center gap-1.5 border-b border-[#2A2D35] pb-2">
                  <AlertTriangle className="w-4 h-4 text-red-500" />
                  Workflow Transition Anomalies Isolated
                </h4>
                <ul className="space-y-2">
                  {insights.anomalies.map((an, idx) => (
                    <li key={idx} className="flex gap-2 text-[11px] text-[#E0E0E0] font-medium leading-relaxed bg-[#15171C] p-2.5 border border-[#2A2D35] rounded-lg">
                      <span className="font-extrabold text-red-400 font-mono">[{idx+1}]</span>
                      <span>{an}</span>
                    </li>
                  ))}
                </ul>
              </div>

              {/* Bottlenecks Card */}
              <div className="bg-[#0B0C0E] p-4 rounded-xl border border-[#2A2D35] space-y-3 shadow-xs">
                <h4 className="text-white font-bold text-xs uppercase tracking-wider flex items-center gap-1.5 border-b border-[#2A2D35] pb-2">
                  <Layers className="w-4 h-4 text-orange-500" />
                  Diagnostic Bottleneck Point Analysis
                </h4>
                <ul className="space-y-2">
                  {insights.suggestedBottleneckCauses.map((bt, idx) => (
                    <li key={idx} className="flex gap-2 text-[11px] text-[#E0E0E0] font-medium leading-relaxed bg-[#15171C] p-2.5 border border-[#2A2D35] rounded-lg">
                      <span className="font-bold text-orange-400 font-mono">[{idx+1}]</span>
                      <span>{bt}</span>
                    </li>
                  ))}
                </ul>
              </div>

              {/* Escalations Card */}
              <div className="bg-[#0B0C0E] p-4 rounded-xl border border-[#2A2D35] space-y-3 shadow-xs">
                <h4 className="text-white font-bold text-xs uppercase tracking-wider flex items-center gap-1.5 border-b border-[#2A2D35] pb-2">
                  <Flame className="w-4 h-4 text-orange-500" />
                  Systemic Escalation Pathways
                </h4>
                <ul className="space-y-2">
                  {insights.escalationPatterns.map((ep, idx) => (
                    <li key={idx} className="flex gap-2 text-[11px] text-[#E0E0E0] font-medium leading-relaxed bg-[#15171C] p-2.5 border border-[#2A2D35] rounded-lg">
                      <span className="font-bold text-[#8E9299] font-mono">[{idx+1}]</span>
                      <span>{ep}</span>
                    </li>
                  ))}
                </ul>
              </div>

              {/* Recommendations Card */}
              <div className="bg-[#0B0C0E] p-4 rounded-xl border border-[#2A2D35] space-y-3 shadow-xs">
                <h4 className="text-white font-bold text-xs uppercase tracking-wider flex items-center gap-1.5 border-b border-[#2A2D35] pb-2">
                  <UserCheck className="w-4 h-4 text-emerald-400" />
                  Workload Adjustment Suggestions
                </h4>
                <ul className="space-y-2">
                  {insights.workloadSuggestions.map((ws, idx) => (
                    <li key={idx} className="flex gap-2 text-[11px] text-[#E0E0E0] font-medium leading-relaxed bg-[#15171C] p-2.5 border border-[#2A2D35] rounded-lg">
                      <span className="font-bold text-emerald-400 font-mono">[{idx+1}]</span>
                      <span>{ws}</span>
                    </li>
                  ))}
                </ul>
              </div>

            </div>

            {/* Sweep renewal triggers footer */}
            <div className="flex items-center justify-end">
              <button
                id="re-evaluate-sweep"
                onClick={runAISweep}
                className="px-4 py-2 border border-[#2A2D35] hover:border-[#3E424B] text-white bg-[#15171C] hover:bg-[#1A1D23] rounded-lg text-xs font-semibold flex items-center gap-1.5 shadow-sm transition-all cursor-pointer"
              >
                <RefreshCw className="w-3.5 h-3.5 text-orange-500" /> Re-Evaluate Analytics Core
              </button>
            </div>

          </div>
        )}

      </div>

    </div>
  );
}
