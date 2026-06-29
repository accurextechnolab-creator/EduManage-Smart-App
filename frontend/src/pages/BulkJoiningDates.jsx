import { useEffect, useMemo, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { ArrowLeft, Save, Info, Search } from "lucide-react";
import { toast } from "sonner";
import { api, formatApiError } from "@/lib/api";
import Layout from "@/components/Layout";
import { Loading, Initials } from "@/components/ui-edu";

export default function BulkJoiningDates() {
  const navigate = useNavigate();
  const [rows, setRows] = useState(null);
  const [edits, setEdits] = useState({}); // { student_id: "YYYY-MM-DD" }
  const [saving, setSaving] = useState(false);
  const [search, setSearch] = useState("");

  const load = async () => {
    try {
      const { data } = await api.get("/students/all");
      setRows(data);
    } catch (e) { toast.error(formatApiError(e)); }
  };
  useEffect(() => { load(); }, []);

  const grouped = useMemo(() => {
    if (!rows) return {};
    const q = search.trim().toLowerCase();
    const out = {};
    for (const s of rows) {
      if (q && !(s.name.toLowerCase().includes(q) || (s.batch_name || "").toLowerCase().includes(q))) continue;
      const key = s.batch_name || "— Ungrouped —";
      (out[key] ||= []).push(s);
    }
    return out;
  }, [rows, search]);

  const setDate = (id, value) => setEdits((prev) => ({ ...prev, [id]: value }));

  const changed = Object.keys(edits).filter((id) => {
    const s = rows?.find((r) => r.id === id);
    if (!s) return false;
    const existing = (s.joining_date || (s.joining_month ? `${s.joining_month}-01` : "")) || "";
    return (edits[id] || "") !== existing && (edits[id] || "").length >= 10;
  });

  const saveAll = async () => {
    if (changed.length === 0) {
      toast.info("Nothing to save");
      return;
    }
    setSaving(true);
    try {
      const updates = changed.map((id) => ({ id, joining_date: edits[id] }));
      const { data } = await api.post("/students/bulk-joining-dates", { updates });
      toast.success(`Updated ${data.updated} student${data.updated === 1 ? "" : "s"}`);
      setEdits({});
      load();
    } catch (e) { toast.error(formatApiError(e)); }
    setSaving(false);
  };

  const formatToDate = (s) => {
    // Display the resolved joining date in a friendly way
    if (s.joining_date) return s.joining_date;
    if (s.joining_month) return `${s.joining_month}-01 (legacy)`;
    if (s.effective_joining_month) return `${s.effective_joining_month} (from created_at)`;
    return "—";
  };

  return (
    <Layout
      title="Bulk-edit joining dates"
      subtitle="Set the correct joining date for each student. The month portion is used for fee balance carry-forward."
      action={
        <button onClick={() => navigate(-1)} className="btn-ghost hidden md:inline-flex" data-testid="bulk-joining-back">
          <ArrowLeft className="w-4 h-4" /> Back
        </button>
      }
    >
      <div className="edu-card mb-4 flex items-start gap-3 bg-edu-primary-fixed/40">
        <Info className="w-5 h-5 text-edu-primary mt-0.5 shrink-0" />
        <div className="text-[13px] text-edu-on-variant leading-relaxed">
          <div className="text-edu-on font-semibold mb-0.5">One-time cleanup tool</div>
          Students without an explicit joining date fall back to the month they were created in EduManage,
          which may not match when they actually joined your coaching class. Set the correct dates here
          so the fee balance (carry-forward) shows the right numbers from now on.
        </div>
      </div>

      {rows === null ? <Loading /> : rows.length === 0 ? (
        <div className="edu-card text-center py-10 text-edu-on-variant">
          No students yet. Add students to a batch first.
        </div>
      ) : (
        <>
          <div className="flex flex-col sm:flex-row gap-3 mb-4 items-stretch sm:items-center">
            <div className="relative flex-1">
              <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-edu-on-variant" />
              <input value={search} onChange={(e) => setSearch(e.target.value)}
                     data-testid="bulk-joining-search"
                     placeholder="Filter by student or batch name…" className="edu-input pl-9" />
            </div>
            <div className="text-[12px] text-edu-on-variant px-1">
              {changed.length > 0 ? (
                <span><span className="text-edu-primary font-semibold">{changed.length}</span> pending change{changed.length === 1 ? "" : "s"}</span>
              ) : (
                <span>{rows.length} students total</span>
              )}
            </div>
            <button onClick={saveAll} disabled={saving || changed.length === 0}
                    data-testid="bulk-joining-save-all" className="btn-primary">
              <Save className="w-4 h-4" /> {saving ? "Saving…" : `Save${changed.length > 0 ? ` (${changed.length})` : ""}`}
            </button>
          </div>

          <div className="space-y-5">
            {Object.entries(grouped).map(([batchName, items]) => (
              <div key={batchName} className="edu-card !p-0 overflow-hidden">
                <div className="px-4 py-3 bg-edu-surface-low border-b border-edu-outline-variant flex items-center justify-between">
                  <div className="font-semibold text-[14px]">{batchName}</div>
                  <div className="text-[11px] uppercase tracking-wider text-edu-on-variant">
                    {items.length} student{items.length === 1 ? "" : "s"}
                  </div>
                </div>
                <ul className="divide-y divide-edu-outline-variant">
                  {items.map((s) => {
                    const currentVal =
                      edits[s.id] ??
                      s.joining_date ??
                      (s.joining_month ? `${s.joining_month}-01` : "");
                    const isChanged = changed.includes(s.id);
                    return (
                      <li key={s.id} className="px-3 sm:px-4 py-2.5 flex items-center justify-between gap-3"
                          data-testid={`bulk-joining-row-${s.id}`}>
                        <Link to={`/students/${s.id}`}
                              className="flex items-center gap-3 min-w-0 flex-1 group">
                          <Initials name={s.name} />
                          <div className="min-w-0">
                            <div className="font-semibold text-[14px] truncate group-hover:text-edu-primary transition-colors">
                              {s.name}
                            </div>
                            <div className="text-[11px] text-edu-on-variant truncate">
                              Currently: {formatToDate(s)}
                            </div>
                          </div>
                        </Link>
                        <input type="date" value={currentVal}
                               onChange={(e) => setDate(s.id, e.target.value)}
                               data-testid={`bulk-joining-input-${s.id}`}
                               className={`edu-input !py-1.5 max-w-[170px] ${isChanged ? "border-edu-primary" : ""}`} />
                      </li>
                    );
                  })}
                </ul>
              </div>
            ))}
            {Object.keys(grouped).length === 0 && (
              <div className="edu-card text-center py-10 text-edu-on-variant">No matches.</div>
            )}
          </div>
        </>
      )}
    </Layout>
  );
}
