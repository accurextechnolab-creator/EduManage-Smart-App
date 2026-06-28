import { useEffect, useMemo, useState } from "react";
import { useParams, Link } from "react-router-dom";
import { ArrowLeft, Plus, X, Save, Search, UserPlus, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { api, formatApiError, todayISO } from "@/lib/api";
import Layout from "@/components/Layout";
import { Initials, Loading } from "@/components/ui-edu";

export default function BatchDetail() {
  const { id } = useParams();
  const [batch, setBatch] = useState(null);
  const [date, setDate] = useState(todayISO());
  const [students, setStudents] = useState([]);
  const [search, setSearch] = useState("");
  const [tab, setTab] = useState("attendance");
  const [addOpen, setAddOpen] = useState(false);
  const [form, setForm] = useState({ name: "", student_code: "", phone: "", parent_name: "", parent_phone: "" });
  const [saving, setSaving] = useState(false);

  const loadBatch = async () => {
    const { data } = await api.get(`/batches/${id}`);
    setBatch(data);
  };
  const loadAttendance = async () => {
    const { data } = await api.get(`/attendance`, { params: { batch_id: id, date } });
    setStudents(data.students);
  };
  const loadStudents = async () => {
    const { data } = await api.get(`/batches/${id}/students`);
    // map them to a compatible structure (status undefined)
    setStudents(data.map((s) => ({ ...s, status: undefined })));
  };

  useEffect(() => { loadBatch(); }, [id]);
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

  const addStudent = async (e) => {
    e.preventDefault();
    try {
      await api.post(`/batches/${id}/students`, form);
      toast.success("Student added");
      setForm({ name: "", student_code: "", phone: "", parent_name: "", parent_phone: "" });
      setAddOpen(false);
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

  if (!batch) return (
    <Layout title="Loading…"><Loading /></Layout>
  );

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
        <button onClick={() => setAddOpen(true)} data-testid="add-student-btn" className="btn-secondary">
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
              <div className="flex items-center gap-3 min-w-0">
                <Initials name={s.name} />
                <div className="min-w-0">
                  <div className="font-semibold text-[15px] truncate">{s.name}</div>
                  <div className="text-[12px] text-edu-on-variant truncate">
                    {s.student_code ? `ID: ${s.student_code}` : (s.phone || "—")}
                  </div>
                </div>
              </div>
              {tab === "attendance" ? (
                <div className="pill-group">
                  <button
                    data-testid={`mark-present-${s.id}`}
                    onClick={() => setStatus(s.id, "present")}
                    className={`pill ${s.status === "present" ? "pill-active-present" : "pill-inactive"}`}>
                    Present
                  </button>
                  <button
                    data-testid={`mark-absent-${s.id}`}
                    onClick={() => setStatus(s.id, "absent")}
                    className={`pill ${s.status === "absent" ? "pill-active-absent" : "pill-inactive"}`}>
                    Absent
                  </button>
                </div>
              ) : (
                <button onClick={() => removeStudent(s.id)} data-testid={`student-delete-${s.id}`}
                        className="btn-danger-ghost">
                  <Trash2 className="w-4 h-4" />
                </button>
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

      {/* Add student modal */}
      {addOpen && (
        <div className="fixed inset-0 z-40 bg-black/40 backdrop-blur-[2px] grid place-items-center p-4">
          <div className="bg-white rounded-edu w-full max-w-md p-6 reveal">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-[18px] font-semibold">Add Student</h3>
              <button onClick={() => setAddOpen(false)} className="p-1 text-edu-on-variant"
                      data-testid="add-student-close"><X className="w-5 h-5" /></button>
            </div>
            <form onSubmit={addStudent} className="space-y-3">
              <div>
                <label className="edu-label">Name *</label>
                <input required data-testid="new-student-name" value={form.name}
                       onChange={(e) => setForm({ ...form, name: e.target.value })}
                       placeholder="Alex Johnson" className="edu-input" />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="edu-label">Student Code</label>
                  <input data-testid="new-student-code" value={form.student_code}
                         onChange={(e) => setForm({ ...form, student_code: e.target.value })}
                         placeholder="#202401" className="edu-input" />
                </div>
                <div>
                  <label className="edu-label">Phone</label>
                  <input data-testid="new-student-phone" value={form.phone}
                         onChange={(e) => setForm({ ...form, phone: e.target.value })}
                         placeholder="98xxxxxxxx" className="edu-input" />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="edu-label">Parent name</label>
                  <input value={form.parent_name}
                         onChange={(e) => setForm({ ...form, parent_name: e.target.value })}
                         className="edu-input" />
                </div>
                <div>
                  <label className="edu-label">Parent phone</label>
                  <input value={form.parent_phone}
                         onChange={(e) => setForm({ ...form, parent_phone: e.target.value })}
                         className="edu-input" />
                </div>
              </div>
              <div className="flex gap-2 pt-2">
                <button type="button" onClick={() => setAddOpen(false)} className="btn-ghost flex-1">Cancel</button>
                <button type="submit" data-testid="new-student-submit" className="btn-primary flex-1">
                  <Plus className="w-4 h-4" /> Add student
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </Layout>
  );
}
