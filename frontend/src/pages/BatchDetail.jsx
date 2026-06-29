import { useEffect, useMemo, useState } from "react";
import { useParams, Link } from "react-router-dom";
import { ArrowLeft, Plus, X, Save, Search, UserPlus, Trash2, Pencil, CheckSquare, ExternalLink } from "lucide-react";
import { toast } from "sonner";
import { api, formatApiError, todayISO } from "@/lib/api";
import Layout from "@/components/Layout";
import { Initials, Loading } from "@/components/ui-edu";

const blankStudent = { name: "", student_code: "", phone: "", parent_name: "", parent_phone: "", monthly_fee: 0, discount_amount: 0, discount_percent: 0, discount_reason: "", joining_date: "" };

const DISCOUNT_REASONS = ["", "Sibling", "Scholarship", "Financial Aid", "Early Bird", "Referral", "Other"];

export default function BatchDetail() {
  const { id } = useParams();
  const [batch, setBatch] = useState(null);
  const [date, setDate] = useState(todayISO());
  const [students, setStudents] = useState([]);
  const [search, setSearch] = useState("");
  const [tab, setTab] = useState("attendance");
  const [modal, setModal] = useState(null); // null | { mode: 'add' | 'edit', id?, ...form }
  const [saving, setSaving] = useState(false);
  const [batchFee, setBatchFee] = useState(0); // for discount preview
  const loadBatch = async () => {
    const { data } = await api.get(`/batches/${id}`);
    setBatch(data);
    setBatchFee(Number(data?.monthly_fee) || 0);
  };
  const loadAttendance = async () => {
    const { data } = await api.get(`/attendance`, { params: { batch_id: id, date } });
    setStudents(data.students);
  };
  const loadStudents = async () => {
    const { data } = await api.get(`/batches/${id}/students`);
    setStudents(data.map((s) => ({ ...s, status: undefined })));
  };

  useEffect(() => { loadBatch(); /* eslint-disable-next-line */ }, [id]);
  useEffect(() => {
    if (tab === "attendance") loadAttendance();
    else loadStudents();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id, date, tab]);

  const filtered = useMemo(() => {
    const q = search.toLowerCase();
    return students.filter((s) => s.name.toLowerCase().includes(q) || (s.student_code || "").toLowerCase().includes(q));
  }, [students, search]);

  const setStatus = (sid, status) => {
    setStudents((prev) => prev.map((s) => (s.id === sid ? { ...s, status } : s)));
  };

  const markAllPresent = () => {
    if (students.length === 0) return;
    setStudents((prev) => prev.map((s) => ({ ...s, status: s.status === "absent" ? s.status : "present" })));
    toast.info("All marked present. Toggle absentees, then Save.");
  };

  const markAllAbsent = () => {
    if (students.length === 0) return;
    setStudents((prev) => prev.map((s) => ({ ...s, status: "absent" })));
  };

  const saveAttendance = async () => {
    setSaving(true);
    try {
      const marks = students
        .filter((s) => s.status === "present" || s.status === "absent")
        .map((s) => ({ student_id: s.id, status: s.status }));
      if (marks.length === 0) {
        toast.warning("Mark at least one student first");
        setSaving(false);
        return;
      }
      await api.post("/attendance/save", { batch_id: id, date, marks });
      toast.success(`Attendance saved (${marks.length})`);
    } catch (e) { toast.error(formatApiError(e)); }
    setSaving(false);
  };

  const openAdd = () => setModal({ mode: "add", ...blankStudent, joining_date: new Date().toISOString().slice(0, 10), reason_other: "" });
  const openEdit = (s) => {
    const reasonInList = DISCOUNT_REASONS.includes(s.discount_reason || "");
    // Prefer joining_date; fall back to legacy joining_month + "-01"; finally created_at; finally today
    const jd =
      s.joining_date ||
      (s.joining_month ? `${s.joining_month}-01` : "") ||
      (s.created_at ? s.created_at.slice(0, 10) : new Date().toISOString().slice(0, 10));
    setModal({
      mode: "edit", id: s.id,
      name: s.name || "", student_code: s.student_code || "", phone: s.phone || "",
      parent_name: s.parent_name || "", parent_phone: s.parent_phone || "",
      monthly_fee: s.monthly_fee || 0,
      discount_amount: s.discount_amount || 0,
      discount_percent: s.discount_percent || 0,
      discount_reason: reasonInList ? (s.discount_reason || "") : "Other",
      reason_other: reasonInList ? "" : (s.discount_reason || ""),
      joining_date: jd,
    });
  };

  const submitStudent = async (e) => {
    e.preventDefault();
    const reason = modal.discount_reason === "Other" ? (modal.reason_other || "Other") : modal.discount_reason;
    const payload = {
      name: modal.name, student_code: modal.student_code, phone: modal.phone,
      parent_name: modal.parent_name, parent_phone: modal.parent_phone,
      monthly_fee: Number(modal.monthly_fee) || 0,
      discount_amount: Number(modal.discount_amount) || 0,
      discount_percent: Number(modal.discount_percent) || 0,
      discount_reason: reason || "",
      joining_date: modal.joining_date || "",
    };
    try {
      if (modal.mode === "edit") {
        await api.put(`/students/${modal.id}`, payload);
        toast.success("Student updated");
      } else {
        await api.post(`/batches/${id}/students`, payload);
        toast.success("Student added");
      }
      setModal(null);
      if (tab === "attendance") loadAttendance(); else loadStudents();
    } catch (e) { toast.error(formatApiError(e)); }
  };

  const removeStudent = async (sid) => {
    if (!confirm("Remove this student? Attendance and fee records will be deleted.")) return;
    try {
      await api.delete(`/students/${sid}`);
      toast.success("Student removed");
      if (tab === "attendance") loadAttendance(); else loadStudents();
    } catch (e) { toast.error(formatApiError(e)); }
  };

  const presentCount = students.filter((s) => s.status === "present").length;
  const absentCount = students.filter((s) => s.status === "absent").length;

  if (!batch) return <Layout title="Loading…"><Loading /></Layout>;

  return (
    <Layout
      title={batch.name}
      subtitle={[batch.subject, batch.session].filter(Boolean).join(" • ") || "Batch"}
      action={
        <Link to="/batches" className="btn-ghost hidden md:inline-flex" data-testid="back-to-batches">
          <ArrowLeft className="w-4 h-4" /> All batches
        </Link>
      }
    >
      {/* Tabs */}
      <div className="flex items-center gap-1 mb-5 bg-white border border-edu-outline-variant rounded-full p-1 w-fit">
        <button onClick={() => setTab("attendance")} data-testid="tab-attendance"
                className={`px-4 py-1.5 rounded-full text-[13px] font-semibold transition-all ${tab === "attendance" ? "bg-edu-primary text-white" : "text-edu-on-variant"}`}>
          Attendance
        </button>
        <button onClick={() => setTab("students")} data-testid="tab-students"
                className={`px-4 py-1.5 rounded-full text-[13px] font-semibold transition-all ${tab === "students" ? "bg-edu-primary text-white" : "text-edu-on-variant"}`}>
          Students
        </button>
      </div>

      {/* Toolbar */}
      <div className="flex flex-col sm:flex-row gap-3 mb-4">
        {tab === "attendance" && (
          <input type="date" value={date} onChange={(e) => setDate(e.target.value)}
                 data-testid="attendance-date" className="edu-input sm:max-w-[200px]" />
        )}
        <div className="relative flex-1">
          <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-edu-on-variant" />
          <input value={search} onChange={(e) => setSearch(e.target.value)}
                 data-testid="student-search" placeholder="Search student name or code…"
                 className="edu-input pl-9" />
        </div>
        {tab === "attendance" && students.length > 0 && (
          <button onClick={markAllPresent} data-testid="mark-all-present-btn" className="btn-secondary">
            <CheckSquare className="w-4 h-4" /> Mark all present
          </button>
        )}
        <button onClick={openAdd} data-testid="add-student-btn" className="btn-secondary">
          <UserPlus className="w-4 h-4" /> Add student
        </button>
      </div>

      {/* List */}
      {filtered.length === 0 ? (
        <div className="edu-card text-center py-10 text-edu-on-variant">
          {students.length === 0 ? "No students yet. Add your first student." : "No students match your search."}
        </div>
      ) : (
        <div className="space-y-2">
          {filtered.map((s) => (
            <div key={s.id} data-testid={`student-row-${s.id}`}
                 className="edu-card !p-3.5 flex items-center justify-between gap-3 hover:border-edu-primary/30">
              <Link to={`/students/${s.id}`} data-testid={`student-link-${s.id}`}
                    className="flex items-center gap-3 min-w-0 group flex-1">
                <Initials name={s.name} />
                <div className="min-w-0">
                  <div className="font-semibold text-[15px] truncate group-hover:text-edu-primary transition-colors">{s.name}</div>
                  <div className="text-[12px] text-edu-on-variant truncate">
                    {s.student_code ? `ID: ${s.student_code}` : (s.phone || "—")}
                  </div>
                </div>
              </Link>
              {tab === "attendance" ? (
                <div className="pill-group">
                  <button data-testid={`mark-present-${s.id}`} onClick={() => setStatus(s.id, "present")}
                          className={`pill ${s.status === "present" ? "pill-active-present" : "pill-inactive"}`}>
                    Present
                  </button>
                  <button data-testid={`mark-absent-${s.id}`} onClick={() => setStatus(s.id, "absent")}
                          className={`pill ${s.status === "absent" ? "pill-active-absent" : "pill-inactive"}`}>
                    Absent
                  </button>
                </div>
              ) : (
                <div className="flex items-center gap-1">
                  <Link to={`/students/${s.id}`} data-testid={`student-open-${s.id}`}
                        className="text-edu-on-variant hover:text-edu-primary p-2 rounded transition-colors" title="Open profile">
                    <ExternalLink className="w-4 h-4" />
                  </Link>
                  <button onClick={() => openEdit(s)} data-testid={`student-edit-${s.id}`}
                          className="text-edu-on-variant hover:text-edu-primary p-2 rounded transition-colors" title="Edit">
                    <Pencil className="w-4 h-4" />
                  </button>
                  <button onClick={() => removeStudent(s.id)} data-testid={`student-delete-${s.id}`}
                          className="btn-danger-ghost"><Trash2 className="w-4 h-4" /></button>
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      {/* Sticky save bar (attendance) */}
      {tab === "attendance" && students.length > 0 && (
        <div className="fixed left-0 right-0 bottom-16 md:bottom-6 px-4 md:left-64 z-20">
          <div className="max-w-3xl mx-auto bg-white/95 backdrop-blur-md border border-edu-outline-variant rounded-edu p-3 shadow-lg flex items-center justify-between">
            <div className="flex items-center gap-5 pl-2">
              <div>
                <div className="text-[10px] uppercase tracking-wider text-edu-on-variant">Present</div>
                <div className="font-bold text-edu-primary tabular-nums text-[16px]" data-testid="present-count">{presentCount}</div>
              </div>
              <div>
                <div className="text-[10px] uppercase tracking-wider text-edu-on-variant">Absent</div>
                <div className="font-bold text-edu-error tabular-nums text-[16px]" data-testid="absent-count">{absentCount}</div>
              </div>
            </div>
            <button onClick={saveAttendance} disabled={saving} data-testid="save-attendance-btn" className="btn-primary">
              <Save className="w-4 h-4" /> {saving ? "Saving…" : "Save Attendance"}
            </button>
          </div>
        </div>
      )}

      {/* Student modal (add/edit) */}
      {modal && (
        <div className="fixed inset-0 z-40 bg-black/40 backdrop-blur-[2px] grid place-items-center p-4">
          <div className="bg-white rounded-edu w-full max-w-md p-6 reveal max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-[18px] font-semibold">{modal.mode === "edit" ? "Edit Student" : "Add Student"}</h3>
              <button onClick={() => setModal(null)} className="p-1 text-edu-on-variant" data-testid="student-modal-close">
                <X className="w-5 h-5" />
              </button>
            </div>
            <form onSubmit={submitStudent} className="space-y-3">
              <div>
                <label className="edu-label">Name *</label>
                <input required data-testid="student-name-input" value={modal.name}
                       onChange={(e) => setModal({ ...modal, name: e.target.value })}
                       placeholder="Alex Johnson" className="edu-input" />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="edu-label">Student Code</label>
                  <input data-testid="student-code-input" value={modal.student_code}
                         onChange={(e) => setModal({ ...modal, student_code: e.target.value })}
                         placeholder="#202401" className="edu-input" />
                </div>
                <div>
                  <label className="edu-label">Phone</label>
                  <input data-testid="student-phone-input" value={modal.phone}
                         onChange={(e) => setModal({ ...modal, phone: e.target.value })}
                         placeholder="98xxxxxxxx" className="edu-input" />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="edu-label">Parent name</label>
                  <input data-testid="parent-name-input" value={modal.parent_name}
                         onChange={(e) => setModal({ ...modal, parent_name: e.target.value })}
                         className="edu-input" />
                </div>
                <div>
                  <label className="edu-label">Parent phone</label>
                  <input data-testid="parent-phone-input" value={modal.parent_phone}
                         onChange={(e) => setModal({ ...modal, parent_phone: e.target.value })}
                         placeholder="for WhatsApp reminders" className="edu-input" />
                </div>
              </div>
              <div>
                <label className="edu-label">Joining date</label>
                <input type="date" data-testid="student-joining-date-input"
                       value={modal.joining_date || ""}
                       onChange={(e) => setModal({ ...modal, joining_date: e.target.value })}
                       className="edu-input" />
              </div>
              <div>
                <label className="edu-label">Override monthly fee (₹, optional)</label>
                <input type="number" min="0" data-testid="student-fee-input" value={modal.monthly_fee}
                       onChange={(e) => setModal({ ...modal, monthly_fee: e.target.value })}
                       placeholder="0 = use batch default" className="edu-input" />
              </div>

              {/* Discount block */}
              <div className="border-t border-edu-outline-variant pt-3 mt-1">
                <div className="text-[11px] font-semibold uppercase tracking-wider text-edu-on-variant mb-2">
                  Discount (optional)
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="edu-label">Amount off (₹)</label>
                    <input type="number" min="0" step="any"
                           data-testid="student-discount-amount-input"
                           value={modal.discount_amount}
                           onChange={(e) => setModal({ ...modal, discount_amount: e.target.value })}
                           placeholder="e.g. 300" className="edu-input" />
                  </div>
                  <div>
                    <label className="edu-label">Percent off (%)</label>
                    <input type="number" min="0" max="100" step="any"
                           data-testid="student-discount-percent-input"
                           value={modal.discount_percent}
                           onChange={(e) => setModal({ ...modal, discount_percent: e.target.value })}
                           placeholder="e.g. 20" className="edu-input" />
                  </div>
                </div>
                <div className="mt-3">
                  <label className="edu-label">Reason</label>
                  <select data-testid="student-discount-reason-select"
                          value={modal.discount_reason}
                          onChange={(e) => setModal({ ...modal, discount_reason: e.target.value })}
                          className="edu-input">
                    <option value="">— None —</option>
                    {DISCOUNT_REASONS.filter((r) => r).map((r) =>
                      <option key={r} value={r}>{r}</option>)}
                  </select>
                </div>
                {modal.discount_reason === "Other" && (
                  <div className="mt-3">
                    <label className="edu-label">Custom reason</label>
                    <input data-testid="student-discount-reason-other-input"
                           value={modal.reason_other || ""}
                           onChange={(e) => setModal({ ...modal, reason_other: e.target.value })}
                           placeholder="e.g. Long-term commitment" className="edu-input" />
                  </div>
                )}
                {(() => {
                  const base = Number(modal.monthly_fee) || batchFee || 0;
                  const amt = Number(modal.discount_amount) || 0;
                  const pct = Number(modal.discount_percent) || 0;
                  const savings = Math.max(0, amt + base * pct / 100);
                  const final = Math.max(0, base - savings);
                  if (base === 0) return null;
                  return (
                    <div className="mt-3 bg-edu-surface-low rounded-[6px] px-3 py-2 flex items-center justify-between"
                         data-testid="student-discount-preview">
                      <div>
                        <div className="text-[11px] uppercase tracking-wider text-edu-on-variant">Final monthly fee</div>
                        <div className="font-bold text-[18px] tabular-nums">₹{final.toLocaleString("en-IN", { maximumFractionDigits: 0 })}</div>
                      </div>
                      {savings > 0 && (
                        <div className="text-right">
                          <div className="text-[11px] uppercase tracking-wider text-edu-on-variant">You save</div>
                          <div className="font-semibold text-[14px] text-[#15803d] tabular-nums">
                            ₹{savings.toLocaleString("en-IN", { maximumFractionDigits: 0 })}/mo
                          </div>
                        </div>
                      )}
                    </div>
                  );
                })()}
              </div>
              <div className="flex gap-2 pt-2">
                <button type="button" onClick={() => setModal(null)} className="btn-ghost flex-1">Cancel</button>
                <button type="submit" data-testid="student-submit-btn" className="btn-primary flex-1">
                  {modal.mode === "edit" ? "Save changes" : (<><Plus className="w-4 h-4" /> Add student</>)}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </Layout>
  );
}
