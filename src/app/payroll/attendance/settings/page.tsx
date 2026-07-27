"use client";

import { useState } from "react";
import { PayrollShell } from "@/components/payroll/PayrollShell";
import { Clock, Coins, ShieldCheck, Sun, TimerReset } from "lucide-react";

/** Attendance Settings — working hours, shifts, overtime, fine and approval rules. */
export default function AttendanceSettingsPage() {
  const [shiftStart, setShiftStart] = useState("09:00");
  const [shiftEnd, setShiftEnd] = useState("18:00");
  const [fullDayHours, setFullDayHours] = useState(8);
  const [halfDayHours, setHalfDayHours] = useState(4);
  const [graceMins, setGraceMins] = useState(15);
  const [weekOff, setWeekOff] = useState("Sunday");
  const [otEnabled, setOtEnabled] = useState(true);
  const [otRate, setOtRate] = useState(1.5);
  const [fineEnabled, setFineEnabled] = useState(true);
  const [autoApprove, setAutoApprove] = useState(false);
  const [saved, setSaved] = useState(false);

  return (
    <PayrollShell requireAdmin>
      <div className="mx-auto max-w-3xl space-y-5">
        <div>
          <h2 className="text-lg font-semibold text-gray-800">Attendance Settings</h2>
          <p className="mt-0.5 text-sm text-gray-500">Working hours, shifts, overtime and approval rules.</p>
        </div>

        <Card icon={Clock} title="Working Hours & Shift">
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
            <F label="Shift Start"><input type="time" value={shiftStart} onChange={(e) => { setShiftStart(e.target.value); setSaved(false); }} className="input" /></F>
            <F label="Shift End"><input type="time" value={shiftEnd} onChange={(e) => { setShiftEnd(e.target.value); setSaved(false); }} className="input" /></F>
            <F label="Grace (mins)"><input type="number" value={graceMins} onChange={(e) => { setGraceMins(Number(e.target.value)); setSaved(false); }} className="input" /></F>
            <F label="Full-day hours"><input type="number" value={fullDayHours} onChange={(e) => { setFullDayHours(Number(e.target.value)); setSaved(false); }} className="input" /></F>
            <F label="Half-day hours"><input type="number" value={halfDayHours} onChange={(e) => { setHalfDayHours(Number(e.target.value)); setSaved(false); }} className="input" /></F>
            <F label="Weekly Off"><input value={weekOff} onChange={(e) => { setWeekOff(e.target.value); setSaved(false); }} className="input" /></F>
          </div>
        </Card>

        <Card icon={TimerReset} title="Overtime Policy">
          <div className="flex items-center justify-between">
            <span className="text-sm text-gray-600">Track overtime beyond shift hours</span>
            <Switch checked={otEnabled} onChange={(v) => { setOtEnabled(v); setSaved(false); }} />
          </div>
          {otEnabled && (
            <div className="mt-3 grid grid-cols-2 gap-3 sm:grid-cols-3">
              <F label="OT rate (× hourly)"><input type="number" step="0.1" value={otRate} onChange={(e) => { setOtRate(Number(e.target.value)); setSaved(false); }} className="input" /></F>
            </div>
          )}
        </Card>

        <Card icon={Coins} title="Late / Fine Policy">
          <div className="flex items-center justify-between">
            <span className="text-sm text-gray-600">Apply fine hours for late arrivals and early departures</span>
            <Switch checked={fineEnabled} onChange={(v) => { setFineEnabled(v); setSaved(false); }} />
          </div>
        </Card>

        <Card icon={ShieldCheck} title="Approvals">
          <div className="flex items-center justify-between">
            <span className="text-sm text-gray-600">Auto-approve attendance without supervisor review</span>
            <Switch checked={autoApprove} onChange={(v) => { setAutoApprove(v); setSaved(false); }} />
          </div>
        </Card>

        <div className="flex items-center gap-3">
          <button onClick={() => setSaved(true)} className="flex items-center gap-1.5 rounded-lg bg-brand-accent px-4 py-2 text-sm font-semibold text-white transition-all hover:opacity-90 active:scale-95">
            <Sun size={15} /> Save Settings
          </button>
          {saved && <span className="text-sm text-emerald-600">Saved</span>}
        </div>
      </div>
    </PayrollShell>
  );
}

function Card({ icon: Icon, title, children }: { icon: React.ComponentType<{ size?: number; className?: string }>; title: string; children: React.ReactNode }) {
  return (
    <div className="rounded-xl border border-gray-200 bg-white p-5">
      <div className="mb-4 flex items-center gap-2">
        <div className="flex h-8 w-8 items-center justify-center rounded-full bg-cyan-50 text-brand-accent"><Icon size={16} /></div>
        <h3 className="text-sm font-semibold text-gray-800">{title}</h3>
      </div>
      {children}
    </div>
  );
}
function F({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="mb-1 block text-[11px] font-medium tracking-wide text-gray-400 uppercase">{label}</span>
      {children}
    </label>
  );
}
function Switch({ checked, onChange }: { checked: boolean; onChange: (v: boolean) => void }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      onClick={() => onChange(!checked)}
      className={`relative h-6 w-11 rounded-full transition-colors duration-200 ${checked ? "bg-brand-accent" : "bg-gray-300"}`}
    >
      <span className={`absolute top-0.5 h-5 w-5 rounded-full bg-white shadow transition-all duration-200 ${checked ? "left-[22px]" : "left-0.5"}`} />
    </button>
  );
}
