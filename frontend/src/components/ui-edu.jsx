import { Loader2 } from "lucide-react";

export function Initials({ name }) {
  const t = (name || "?")
    .split(" ")
    .map((p) => p[0])
    .slice(0, 2)
    .join("")
    .toUpperCase();
  return (
    <div className="w-10 h-10 rounded-full bg-edu-primary-fixed text-edu-primary grid place-items-center font-semibold">
      {t}
    </div>
  );
}

export function Empty({ title, subtitle, action }) {
  return (
    <div className="edu-card flex flex-col items-center text-center py-12">
      <div className="text-edu-on-variant text-[14px] uppercase tracking-wider mb-1">Empty</div>
      <h3 className="text-[18px] font-semibold mb-1">{title}</h3>
      {subtitle && <p className="text-edu-on-variant max-w-md mb-4">{subtitle}</p>}
      {action}
    </div>
  );
}

export function Loading({ label = "Loading" }) {
  return (
    <div className="flex items-center justify-center text-edu-on-variant py-12">
      <Loader2 className="w-4 h-4 mr-2 animate-spin" /> {label}…
    </div>
  );
}

export function Stat({ label, value, sub, accent = "primary", testId }) {
  const color = accent === "success" ? "text-[#15803d]" :
                accent === "error" ? "text-edu-error" :
                accent === "tertiary" ? "text-[#852b00]" : "text-edu-primary";
  return (
    <div className="edu-card hover:border-edu-primary/30" data-testid={testId}>
      <div className="text-[11px] font-semibold uppercase tracking-wider text-edu-on-variant">{label}</div>
      <div className={`text-[28px] font-bold tabular-nums mt-1 ${color}`}>{value}</div>
      {sub && <div className="text-[12px] text-edu-on-variant mt-1">{sub}</div>}
    </div>
  );
}
