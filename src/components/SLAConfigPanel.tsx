import React, { useState } from "react";
import { Clock, Calendar, ShieldCheck, Plus, Trash2, Check, AlertCircle } from "lucide-react";
import { SLAConfig } from "../types";

interface SLAConfigPanelProps {
  currentConfig: SLAConfig;
  onUpdateConfig: (config: SLAConfig) => void;
}

export default function SLAConfigPanel({ currentConfig, onUpdateConfig }: SLAConfigPanelProps) {
  const [config, setConfig] = useState<SLAConfig>({ ...currentConfig });
  const [newHoliday, setNewHoliday] = useState("");
  const [feedback, setFeedback] = useState<"idle" | "saved">("idle");

  const handleToggle = (key: keyof SLAConfig) => {
    setConfig((prev) => ({
      ...prev,
      [key]: !prev[key] as any
    }));
  };

  const handleTimeChange = (key: "businessStart" | "businessEnd", val: string) => {
    setConfig((prev) => ({
      ...prev,
      [key]: val
    }));
  };

  const addHoliday = () => {
    if (!newHoliday) return;
    if (config.holidays.includes(newHoliday)) return;
    setConfig((prev) => ({
      ...prev,
      holidays: [...prev.holidays, newHoliday].sort()
    }));
    setNewHoliday("");
  };

  const removeHoliday = (date: string) => {
    setConfig((prev) => ({
      ...prev,
      holidays: prev.holidays.filter((d) => d !== date)
    }));
  };

  const saveConfig = () => {
    onUpdateConfig(config);
    setFeedback("saved");
    setTimeout(() => {
      setFeedback("idle");
    }, 3000);
  };

  return (
    <div id="sla-config-card" className="bg-[#15171C] rounded-xl border border-[#2A2D35] overflow-hidden h-full">
      <div className="bg-[#1A1D23] border-b border-[#2A2D35] px-6 py-4 text-white flex items-center justify-between">
        <div>
          <h2 className="font-sans font-semibold text-sm flex items-center gap-2">
            <Clock className="w-4 h-4 text-orange-500" />
            SLA Clock & Business Rules Calibration
          </h2>
          <p className="text-[11px] text-[#8E9299]">Configure target thresholds and business calendar exclusions.</p>
        </div>
        {feedback === "saved" && (
          <span className="text-[11px] bg-orange-500/20 text-orange-400 border border-orange-500/30 px-2.5 py-0.5 rounded-full font-semibold flex items-center gap-1">
            <Check className="w-3 h-3" /> Clocks Recalculating
          </span>
        )}
      </div>

      <div className="p-6 space-y-5">
        {/* Core SLA Target Limit */}
        <div className="space-y-1.5">
          <label className="text-white font-semibold text-xs flex items-center gap-1">
            Standard Resolver SLA Clock (Hours)
            <span className="text-orange-500">*</span>
          </label>
          <div className="flex items-center gap-2">
            <input
              id="sla-target-hours"
              type="number"
              min="1"
              max="720"
              value={config.targetHours}
              onChange={(e) => setConfig((prev) => ({ ...prev, targetHours: Number(e.target.value) }))}
              className="w-full text-xs border border-[#2A2D35] bg-[#1A1D23] text-white rounded px-3 py-1.5 focus:outline-none focus:border-orange-500 font-medium"
            />
            <span className="text-xs text-[#8E9299] font-medium shrink-0">Hours window</span>
          </div>
          <p className="text-[10px] text-[#8E9299]">Default total lifecycle limit automatically scaling: Critical (4h), High (12h), Medium (24h), Low (48h).</p>
        </div>

        {/* Business clock option */}
        <div className="border border-[#2A2D35] bg-[#0B0C0E] p-3.5 rounded-lg space-y-3">
          <div className="flex items-center justify-between">
            <div className="space-y-0.5">
              <span className="text-white font-semibold text-xs block">Enable Business Clock Exclusion</span>
              <p className="text-[10px] text-[#8E9299]">Exclude nights, non-working hours, and weekends.</p>
            </div>
            <label className="relative inline-flex items-center cursor-pointer select-none">
              <input
                id="sla-use-business"
                type="checkbox"
                checked={config.useBusinessHours}
                onChange={() => handleToggle("useBusinessHours")}
                className="sr-only peer"
              />
              <div className="w-9 h-5 bg-[#2A2D35] peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-slate-300 after:border after:rounded-full after:h-4 after:w-4 after:transition-all peer-checked:bg-orange-600"></div>
            </label>
          </div>

          {config.useBusinessHours && (
            <div className="grid grid-cols-2 gap-3 pt-2 text-xs border-t border-[#2A2D35]">
              <div className="space-y-1">
                <span className="text-[#8E9299] font-medium block text-[10px]">Business Hours Start</span>
                <input
                  id="sla-business-start"
                  type="time"
                  value={config.businessStart}
                  onChange={(e) => handleTimeChange("businessStart", e.target.value)}
                  className="w-full border border-[#2A2D35] bg-[#1A1D23] text-white rounded px-2.5 py-1 text-xs focus:outline-none focus:border-orange-500"
                />
              </div>
              <div className="space-y-1">
                <span className="text-[#8E9299] font-medium block text-[10px]">Business Hours End</span>
                <input
                  id="sla-business-end"
                  type="time"
                  value={config.businessEnd}
                  onChange={(e) => handleTimeChange("businessEnd", e.target.value)}
                  className="w-full border border-[#2A2D35] bg-[#1A1D23] text-white rounded px-2.5 py-1 text-xs focus:outline-none focus:border-orange-500"
                />
              </div>
            </div>
          )}
        </div>

        {/* Weekend exclusion */}
        <div className="flex items-center justify-between border-b border-[#2A2D35] pb-3">
          <div>
            <span className="text-white font-semibold text-xs block">Exclude Weekends</span>
            <span className="text-[10px] text-[#8E9299]">Pause SLA countdown timers on Sat & Sun.</span>
          </div>
          <label className="relative inline-flex items-center cursor-pointer">
            <input
              id="sla-exclude-weekends"
              type="checkbox"
              checked={config.excludeWeekends}
              onChange={() => handleToggle("excludeWeekends")}
              className="sr-only peer"
            />
            <div className="w-9 h-5 bg-[#2A2D35] peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-slate-300 after:border after:rounded-full after:h-4 after:w-4 after:transition-all peer-checked:bg-orange-600"></div>
          </label>
        </div>

        {/* Holidays exclusions */}
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <div className="space-y-0.5">
              <span className="text-white font-semibold text-xs block flex items-center gap-1">
                <Calendar className="w-3.5 h-3.5 text-orange-500" />
                Holiday Exclusions Calendar
              </span>
              <p className="text-[10px] text-[#8E9299]">Configure business shutdown dates to stop clocks.</p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <input
              id="sla-holiday-input"
              type="date"
              value={newHoliday}
              onChange={(e) => setNewHoliday(e.target.value)}
              className="w-full border border-[#2A2D35] bg-[#1A1D23] text-white rounded px-2.5 py-1.5 text-xs focus:outline-none focus:border-orange-500"
            />
            <button
              id="sla-add-holiday-btn"
              onClick={addHoliday}
              className="shrink-0 p-1.5 bg-orange-600 font-bold border border-orange-500/25 rounded hover:bg-orange-700 text-white transition cursor-pointer"
            >
              <Plus className="w-4 h-4" />
            </button>
          </div>

          {/* Holiday Date collection chips */}
          <div id="holiday-capsules" className="flex flex-wrap gap-1.5 max-h-24 overflow-y-auto border border-[#2A2D35] p-2 rounded bg-[#0B0C0E]">
            {config.holidays.length === 0 ? (
              <span className="text-[10px] text-[#8E9299] italic">No custom shutdown dates added yet.</span>
            ) : (
              config.holidays.map((hol) => (
                <span
                  key={hol}
                  className="inline-flex items-center gap-1 bg-[#2A2D35] text-[#E0E0E0] border border-[#3E424B] px-2 py-0.5 rounded text-[10px] font-medium"
                >
                  {hol}
                  <button 
                    id={`remove-holiday-${hol}`}
                    onClick={() => removeHoliday(hol)} 
                    className="text-[#8E9299] hover:text-red-400 cursor-pointer"
                  >
                    <Trash2 className="w-2.5 h-2.5" />
                  </button>
                </span>
              ))
            )}
          </div>
        </div>

        {/* Commitment button */}
        <button
          id="save-sla-config-btn"
          onClick={saveConfig}
          className="w-full py-2 bg-orange-600 hover:bg-orange-700 text-white font-semibold rounded text-xs shadow-sm transition-colors mt-2 cursor-pointer border border-orange-500/25"
        >
          Save Calendar & Recalculate SLA Clocks
        </button>
      </div>
    </div>
  );
}
