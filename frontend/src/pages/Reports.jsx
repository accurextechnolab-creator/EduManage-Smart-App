import { useEffect, useState, useCallback } from "react";
import { Download, Share2, FileText, CalendarRange, IndianRupee, Receipt, BarChart3, TrendingUp, TrendingDown, ArrowUpRight, ArrowDownRight, Minus, GitCompareArrows } from "lucide-react";
import { toast } from "sonner";
import { api, downloadPdf, formatApiError, todayISO, currentMonth, inr } from "@/lib/api";
import Layout from "@/components/Layout";
import { Loading } from "@/components/ui-edu";

function Section({ icon: Icon, title, subtitle, children }) {
  return (
    <div className="edu-card">
      <div className="flex items-start gap-3 mb-4">
        <div className="w-10 h-10 rounded-[8px] bg-edu-primary-fixed text-edu-primary grid place-items-center">
          <Icon className="w-5 h-5" />
        </div>
        <div>
          <div className="font-semibold text-[16px]">{title}</div>
          <div className="text-[12px] text-edu-on-variant">{subtitle}</div>
        </div>
      </div>
      {children}
    </div>
  );
}

const shareFile = async (blob, filename, title) => {
  try {
    if (navigator.canShare && window.File) {
      const file = new File([blob], filename, { type: "application/pdf" });
      if (navigator.canShare({ files: [file] })) {
        await navigator.share({ files: [file], title });
        return true;
      }
    }
  } catch (_err) { /* ignore */ }
  return false;
};

const MONTH_NAMES = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

function YearlySection() {
  const [year, setYear] = useState(new Date().getFullYear());
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const { data } = await api.get("/reports/yearly", { params: { year } });
      setData(data);
    } catch (e) { toast.error(formatApiError(e)); }
    setLoading(false);
  }, [year]);

  useEffect(() => { load(); }, [load]);

  const download = async () => {
    try {
      await downloadPdf("/reports/yearly.pdf", { year }, `annual_${year}.pdf`);
      toast.success("PDF downloaded");
    } catch (e) { toast.error(formatApiError(e)); }
  };

  const share = async () => {
    try {
      const res = await api.get("/reports/yearly.pdf", { params: { year }, responseType: "blob" });
      const blob = new Blob([res.data], { type: "application/pdf" });
      const shared = await shareFile(blob, `annual_${year}.pdf`, `Annual Summary ${year}`);
      if (!shared) {
        const link = URL.createObjectURL(blob);
        window.open(link, "_blank");
        toast.info("Sharing not supported — opened in a new tab");
      }
    } catch (e) { toast.error(formatApiError(e)); }
  };

  const t = data?.totals;
  const maxAbs = data ? Math.max(
    1,
    ...data.rows.map((r) => Math.max(Math.abs(r.fees), Math.abs(r.expenses)))
  ) : 1;

  return (
    <div className="edu-card lg:col-span-2">
      <div className="flex flex-wrap items-start justify-between gap-3 mb-4">
        <div className="flex items-start gap-3">
          <div className="w-10 h-10 rounded-[8px] bg-edu-primary-fixed text-edu-primary grid place-items-center">
            <BarChart3 className="w-5 h-5" />
          </div>
          <div>
            <div className="font-semibold text-[16px]">Annual Summary &amp; Profit / Loss</div>
            <div className="text-[12px] text-edu-on-variant">Month-by-month fees, expenses and net for the full year</div>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <select data-testid="yearly-year-select" value={year}
                  onChange={(e) => setYear(Number(e.target.value))}
                  className="edu-input !py-2 max-w-[110px]">
            {Array.from({ length: 6 }, (_, i) => new Date().getFullYear() - 3 + i).map((y) =>
              <option key={y} value={y}>{y}</option>)}
          </select>
          <button onClick={download} data-testid="yearly-download" className="btn-primary">
            <Download className="w-4 h-4" /> PDF
          </button>
          <button onClick={share} data-testid="yearly-share" className="btn-secondary hidden sm:inline-flex">
            <Share2 className="w-4 h-4" />
          </button>
        </div>
      </div>

      {loading || !data ? <Loading /> : (
        <>
          {/* P&L summary tiles */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-5">
            <div className="bg-edu-surface-low rounded-edu p-3" data-testid="yearly-stat-fees">
              <div className="text-[10px] font-semibold uppercase tracking-wider text-edu-on-variant flex items-center gap-1"><TrendingUp className="w-3 h-3" /> Fees</div>
              <div className="text-[18px] font-bold tabular-nums text-[#15803d] mt-1">{inr(t.fees)}</div>
            </div>
            <div className="bg-edu-surface-low rounded-edu p-3" data-testid="yearly-stat-expenses">
              <div className="text-[10px] font-semibold uppercase tracking-wider text-edu-on-variant flex items-center gap-1"><TrendingDown className="w-3 h-3" /> Expenses</div>
              <div className="text-[18px] font-bold tabular-nums text-edu-error mt-1">{inr(t.expenses)}</div>
            </div>
            <div className="bg-edu-surface-low rounded-edu p-3" data-testid="yearly-stat-net">
              <div className="text-[10px] font-semibold uppercase tracking-wider text-edu-on-variant">Net P&amp;L</div>
              <div className={`text-[18px] font-bold tabular-nums mt-1 ${t.net >= 0 ? "text-[#15803d]" : "text-edu-error"}`}>{inr(t.net)}</div>
            </div>
            <div className="bg-edu-surface-low rounded-edu p-3" data-testid="yearly-stat-attendance">
              <div className="text-[10px] font-semibold uppercase tracking-wider text-edu-on-variant">Class days</div>
              <div className="text-[18px] font-bold tabular-nums mt-1">{t.present + t.absent}</div>
              <div className="text-[10px] text-edu-on-variant mt-0.5">{t.present} present · {t.absent} absent</div>
            </div>
          </div>

          {/* Monthly mini bar chart */}
          <div className="space-y-1.5">
            <div className="grid grid-cols-[64px_1fr_90px_90px_90px] gap-3 px-1 text-[10px] font-semibold uppercase tracking-wider text-edu-on-variant">
              <div>Month</div>
              <div>Fees / Expenses</div>
              <div className="text-right">Fees</div>
              <div className="text-right">Expenses</div>
              <div className="text-right">Net</div>
            </div>
            {data.rows.map((r, i) => {
              const feesPct = (r.fees / maxAbs) * 100;
              const expPct = (r.expenses / maxAbs) * 100;
              return (
                <div key={r.month} data-testid={`yearly-row-${r.month}`}
                     className="grid grid-cols-[64px_1fr_90px_90px_90px] gap-3 items-center px-1 py-1.5 hover:bg-edu-surface-low rounded-[6px]">
                  <div className="text-[13px] font-semibold tabular-nums">{MONTH_NAMES[i]}</div>
                  <div className="space-y-0.5">
                    <div className="h-2 rounded-full bg-edu-surface-mid overflow-hidden">
                      <div className="h-full bg-[#15803d] transition-all" style={{ width: `${feesPct}%` }} />
                    </div>
                    <div className="h-2 rounded-full bg-edu-surface-mid overflow-hidden">
                      <div className="h-full bg-edu-error transition-all" style={{ width: `${expPct}%` }} />
                    </div>
                  </div>
                  <div className="text-right text-[13px] tabular-nums text-[#15803d] font-semibold">{inr(r.fees)}</div>
                  <div className="text-right text-[13px] tabular-nums text-edu-error font-semibold">{inr(r.expenses)}</div>
                  <div className={`text-right text-[13px] tabular-nums font-bold ${r.net >= 0 ? "text-[#15803d]" : "text-edu-error"}`}>
                    {inr(r.net)}
                  </div>
                </div>
              );
            })}
          </div>
        </>
      )}
    </div>
  );
}

function DeltaTile({ label, prevValue, currValue, amt, pct, accent = "primary", testId }) {
  const positive = amt > 0;
  const Icon = amt === 0 ? Minus : positive ? ArrowUpRight : ArrowDownRight;
  // For expenses, "up" is bad. Caller can pass invert.
  const goodColor = amt === 0
    ? "text-edu-on-variant"
    : accent === "expense"
      ? (positive ? "text-edu-error" : "text-[#15803d]")
      : (positive ? "text-[#15803d]" : "text-edu-error");
  return (
    <div className="bg-edu-surface-low rounded-edu p-4" data-testid={testId}>
      <div className="text-[10px] font-semibold uppercase tracking-wider text-edu-on-variant">{label}</div>
      <div className="flex items-baseline gap-2 mt-1">
        <div className="text-[20px] font-bold tabular-nums">{inr(currValue)}</div>
        <div className="text-[12px] text-edu-on-variant tabular-nums">vs {inr(prevValue)}</div>
      </div>
      <div className={`flex items-center gap-1 text-[12px] font-semibold mt-1 ${goodColor}`}>
        <Icon className="w-3.5 h-3.5" />
        <span className="tabular-nums">
          {amt >= 0 ? "+" : ""}{inr(amt)}
          {pct !== null && pct !== undefined ? (
            <span className="ml-1">({pct >= 0 ? "+" : ""}{pct}%)</span>
          ) : (
            <span className="ml-1">(—)</span>
          )}
        </span>
      </div>
    </div>
  );
}

function YearOverYearSection() {
  const [year, setYear] = useState(new Date().getFullYear());
  const [data, setData] = useState(null);
  const [metric, setMetric] = useState("fees"); // fees | expenses | net
  const [loading, setLoading] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const { data } = await api.get("/reports/yearly-compare", { params: { year } });
      setData(data);
    } catch (e) { toast.error(formatApiError(e)); }
    setLoading(false);
  }, [year]);

  useEffect(() => { load(); }, [load]);

  const download = async () => {
    try {
      await downloadPdf("/reports/yearly-compare.pdf", { year }, `yoy_${year - 1}_vs_${year}.pdf`);
      toast.success("PDF downloaded");
    } catch (e) { toast.error(formatApiError(e)); }
  };

  const share = async () => {
    try {
      const res = await api.get("/reports/yearly-compare.pdf", { params: { year }, responseType: "blob" });
      const blob = new Blob([res.data], { type: "application/pdf" });
      const shared = await shareFile(blob, `yoy_${year - 1}_vs_${year}.pdf`, `Year-over-Year ${year - 1} vs ${year}`);
      if (!shared) {
        const link = URL.createObjectURL(blob);
        window.open(link, "_blank");
        toast.info("Sharing not supported — opened in a new tab");
      }
    } catch (e) { toast.error(formatApiError(e)); }
  };

  if (loading || !data) {
    return (
      <div className="edu-card lg:col-span-2">
        <Loading />
      </div>
    );
  }

  const cy = data.current_year, py = data.previous_year;
  const d = data.deltas;
  const ct = data.current.totals, pt = data.previous.totals;

  // Build per-month side-by-side values for selected metric
  const valuesCurr = data.current.rows.map((r) => Number(r[metric]) || 0);
  const valuesPrev = data.previous.rows.map((r) => Number(r[metric]) || 0);
  const maxAbs = Math.max(1, ...valuesCurr.map(Math.abs), ...valuesPrev.map(Math.abs));

  const metricColor = metric === "expenses" ? "#ba1a1a" : "#15803d";

  return (
    <div className="edu-card lg:col-span-2" data-testid="yoy-section">
      <div className="flex flex-wrap items-start justify-between gap-3 mb-4">
        <div className="flex items-start gap-3">
          <div className="w-10 h-10 rounded-[8px] bg-edu-primary-fixed text-edu-primary grid place-items-center">
            <GitCompareArrows className="w-5 h-5" />
          </div>
          <div>
            <div className="font-semibold text-[16px]">Year-over-Year — {py} vs {cy}</div>
            <div className="text-[12px] text-edu-on-variant">See how this year stacks up against last year</div>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <select data-testid="yoy-year-select" value={year}
                  onChange={(e) => setYear(Number(e.target.value))}
                  className="edu-input !py-2 max-w-[110px]">
            {Array.from({ length: 6 }, (_, i) => new Date().getFullYear() - 3 + i).map((y) =>
              <option key={y} value={y}>{y}</option>)}
          </select>
          <button onClick={download} data-testid="yoy-download" className="btn-primary">
            <Download className="w-4 h-4" /> PDF
          </button>
          <button onClick={share} data-testid="yoy-share" className="btn-secondary hidden sm:inline-flex">
            <Share2 className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* Delta tiles */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 mb-5">
        <DeltaTile testId="yoy-delta-fees" label="Fees collected"
                   prevValue={pt.fees} currValue={ct.fees}
                   amt={d.fees} pct={d.fees_pct} accent="primary" />
        <DeltaTile testId="yoy-delta-expenses" label="Expenses"
                   prevValue={pt.expenses} currValue={ct.expenses}
                   amt={d.expenses} pct={d.expenses_pct} accent="expense" />
        <DeltaTile testId="yoy-delta-net" label="Net P&L"
                   prevValue={pt.net} currValue={ct.net}
                   amt={d.net} pct={d.net_pct} accent="primary" />
      </div>

      {/* Metric toggle */}
      <div className="flex items-center justify-between flex-wrap gap-3 mb-3">
        <div className="text-[11px] font-semibold uppercase tracking-wider text-edu-on-variant">Monthly Side-by-Side</div>
        <div className="inline-flex items-center bg-edu-surface-low border border-edu-outline-variant rounded-full p-1 gap-1">
          {[
            { id: "fees", label: "Fees" },
            { id: "expenses", label: "Expenses" },
            { id: "net", label: "Net" },
          ].map((m) => (
            <button key={m.id} onClick={() => setMetric(m.id)}
                    data-testid={`yoy-metric-${m.id}`}
                    className={`px-3 py-1 rounded-full text-[12px] font-semibold transition-all ${metric === m.id ? "bg-edu-primary text-white" : "text-edu-on-variant"}`}>
              {m.label}
            </button>
          ))}
        </div>
      </div>

      {/* Legend */}
      <div className="flex items-center gap-4 text-[12px] text-edu-on-variant mb-2 pl-1">
        <div className="flex items-center gap-1.5"><span className="inline-block w-3 h-2 rounded-sm bg-edu-outline-variant" /> {py}</div>
        <div className="flex items-center gap-1.5">
          <span className="inline-block w-3 h-2 rounded-sm" style={{ background: metricColor }} /> {cy}
        </div>
      </div>

      {/* Monthly side-by-side bars */}
      <div className="space-y-1.5">
        <div className="grid grid-cols-[64px_1fr_90px_90px_70px] gap-3 px-1 text-[10px] font-semibold uppercase tracking-wider text-edu-on-variant">
          <div>Month</div>
          <div>{py} vs {cy}</div>
          <div className="text-right">{py}</div>
          <div className="text-right">{cy}</div>
          <div className="text-right">Δ</div>
        </div>
        {MONTH_NAMES.map((mn, i) => {
          const v_prev = valuesPrev[i];
          const v_curr = valuesCurr[i];
          const delta = v_curr - v_prev;
          const wPrev = (Math.abs(v_prev) / maxAbs) * 100;
          const wCurr = (Math.abs(v_curr) / maxAbs) * 100;
          const deltaGood = metric === "expenses" ? delta <= 0 : delta >= 0;
          return (
            <div key={mn} data-testid={`yoy-row-${i + 1}`}
                 className="grid grid-cols-[64px_1fr_90px_90px_70px] gap-3 items-center px-1 py-1.5 hover:bg-edu-surface-low rounded-[6px]">
              <div className="text-[13px] font-semibold tabular-nums">{mn}</div>
              <div className="space-y-0.5">
                <div className="h-2 rounded-full bg-edu-surface-mid overflow-hidden">
                  <div className="h-full bg-edu-outline-variant transition-all" style={{ width: `${wPrev}%` }} />
                </div>
                <div className="h-2 rounded-full bg-edu-surface-mid overflow-hidden">
                  <div className="h-full transition-all" style={{ width: `${wCurr}%`, background: metricColor }} />
                </div>
              </div>
              <div className="text-right text-[13px] tabular-nums text-edu-on-variant">{inr(v_prev)}</div>
              <div className="text-right text-[13px] tabular-nums font-semibold" style={{ color: metricColor }}>{inr(v_curr)}</div>
              <div className={`text-right text-[12px] tabular-nums font-bold ${deltaGood ? "text-[#15803d]" : "text-edu-error"}`}>
                {delta >= 0 ? "+" : ""}{inr(delta)}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

export default function Reports() {
  const [batches, setBatches] = useState([]);

  // attendance
  const [attBatch, setAttBatch] = useState("");
  const today = todayISO();
  const monthAgo = new Date(); monthAgo.setDate(monthAgo.getDate() - 30);
  const monthAgoStr = monthAgo.toISOString().slice(0, 10);
  const [attStart, setAttStart] = useState(monthAgoStr);
  const [attEnd, setAttEnd] = useState(today);

  // fees
  const [feeBatch, setFeeBatch] = useState("");
  const [feeMonth, setFeeMonth] = useState(currentMonth());

  // expenses
  const [expMonth, setExpMonth] = useState(currentMonth());

  useEffect(() => {
    api.get("/batches").then(({ data }) => {
      setBatches(data);
      if (data[0]) { setAttBatch(data[0].id); setFeeBatch(data[0].id); }
    });
  }, []);

  const download = async (kind) => {
    try {
      if (kind === "attendance") {
        if (!attBatch) return toast.warning("Choose a batch first");
        await downloadPdf("/reports/attendance.pdf", { batch_id: attBatch, start: attStart, end: attEnd },
                          `attendance_${attStart}_${attEnd}.pdf`);
      } else if (kind === "fees") {
        if (!feeBatch) return toast.warning("Choose a batch first");
        await downloadPdf("/reports/fees.pdf", { batch_id: feeBatch, month: feeMonth },
                          `fees_${feeMonth}.pdf`);
      } else {
        await downloadPdf("/reports/expenses.pdf", { month: expMonth }, `expenses_${expMonth}.pdf`);
      }
      toast.success("PDF downloaded");
    } catch (e) { toast.error(formatApiError(e)); }
  };

  const share = async (kind) => {
    try {
      let url, params, filename, title;
      if (kind === "attendance") {
        url = "/reports/attendance.pdf"; params = { batch_id: attBatch, start: attStart, end: attEnd };
        filename = `attendance_${attStart}_${attEnd}.pdf`; title = "Attendance Report";
      } else if (kind === "fees") {
        url = "/reports/fees.pdf"; params = { batch_id: feeBatch, month: feeMonth };
        filename = `fees_${feeMonth}.pdf`; title = "Fees Report";
      } else {
        url = "/reports/expenses.pdf"; params = { month: expMonth };
        filename = `expenses_${expMonth}.pdf`; title = "Expenses Report";
      }
      const res = await api.get(url, { params, responseType: "blob" });
      const blob = new Blob([res.data], { type: "application/pdf" });
      const shared = await shareFile(blob, filename, title);
      if (!shared) {
        const link = URL.createObjectURL(blob);
        window.open(link, "_blank");
        toast.info("Sharing not supported — opened in a new tab");
      }
    } catch (e) { toast.error(formatApiError(e)); }
  };

  return (
    <Layout title="Reports" subtitle="Download or share PDF reports">
      <div className="grid lg:grid-cols-2 gap-5">
        <YearlySection />
        <YearOverYearSection />

        <Section icon={CalendarRange} title="Attendance Report" subtitle="Per-student summary for a batch within a date range">
          <div className="space-y-3">
            <div>
              <label className="edu-label">Batch</label>
              <select data-testid="att-report-batch" value={attBatch} onChange={(e) => setAttBatch(e.target.value)} className="edu-input">
                {batches.map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}
              </select>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="edu-label">From</label>
                <input type="date" data-testid="att-report-start" value={attStart} onChange={(e) => setAttStart(e.target.value)} className="edu-input" />
              </div>
              <div>
                <label className="edu-label">To</label>
                <input type="date" data-testid="att-report-end" value={attEnd} onChange={(e) => setAttEnd(e.target.value)} className="edu-input" />
              </div>
            </div>
            <div className="flex gap-2 pt-1">
              <button onClick={() => download("attendance")} data-testid="att-report-download" className="btn-primary flex-1"><Download className="w-4 h-4" /> Download</button>
              <button onClick={() => share("attendance")} data-testid="att-report-share" className="btn-secondary flex-1"><Share2 className="w-4 h-4" /> Share</button>
            </div>
          </div>
        </Section>

        <Section icon={IndianRupee} title="Fee Collection Report" subtitle="Paid/unpaid breakdown for a specific month">
          <div className="space-y-3">
            <div>
              <label className="edu-label">Batch</label>
              <select data-testid="fee-report-batch" value={feeBatch} onChange={(e) => setFeeBatch(e.target.value)} className="edu-input">
                {batches.map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}
              </select>
            </div>
            <div>
              <label className="edu-label">Month</label>
              <input type="month" data-testid="fee-report-month" value={feeMonth} onChange={(e) => setFeeMonth(e.target.value)} className="edu-input" />
            </div>
            <div className="flex gap-2 pt-1">
              <button onClick={() => download("fees")} data-testid="fee-report-download" className="btn-primary flex-1"><Download className="w-4 h-4" /> Download</button>
              <button onClick={() => share("fees")} data-testid="fee-report-share" className="btn-secondary flex-1"><Share2 className="w-4 h-4" /> Share</button>
            </div>
          </div>
        </Section>

        <Section icon={Receipt} title="Expense Report" subtitle="All expenses for a month">
          <div className="space-y-3">
            <div>
              <label className="edu-label">Month</label>
              <input type="month" data-testid="exp-report-month" value={expMonth} onChange={(e) => setExpMonth(e.target.value)} className="edu-input" />
            </div>
            <div className="flex gap-2 pt-1">
              <button onClick={() => download("expenses")} data-testid="exp-report-download" className="btn-primary flex-1"><Download className="w-4 h-4" /> Download</button>
              <button onClick={() => share("expenses")} data-testid="exp-report-share" className="btn-secondary flex-1"><Share2 className="w-4 h-4" /> Share</button>
            </div>
          </div>
        </Section>

        <Section icon={FileText} title="How to share" subtitle="Tips for getting reports to parents &amp; friends">
          <ul className="space-y-2 text-[14px] text-edu-on-variant list-disc pl-5">
            <li>Tap <span className="font-semibold text-edu-on">Share</span> on phones to send via WhatsApp, email or anywhere your device supports.</li>
            <li>On desktop, Share opens the PDF in a new tab — you can attach it to email or messaging.</li>
            <li>Reports use a clean, printable format suitable for archives.</li>
          </ul>
        </Section>
      </div>
    </Layout>
  );
}
