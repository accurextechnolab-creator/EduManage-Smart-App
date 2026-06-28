import { useEffect, useState } from "react";
import { useParams, Link, useNavigate } from "react-router-dom";
import { ArrowLeft, Phone, Mail, User as UserIcon, MessageCircle, CheckCircle2, XCircle, CalendarDays, IndianRupee } from "lucide-react";
import { toast } from "sonner";
import { api, formatApiError, inr } from "@/lib/api";
import Layout from "@/components/Layout";
import { Loading, Initials } from "@/components/ui-edu";

function buildWhatsAppUrl(phone, text) {
  const clean = (phone || "").replace(/[^\d]/g, "");
  if (!clean) return null;
  // If phone has no country code (10 digits, Indian common case), prefix 91
  const number = clean.length === 10 ? "91" + clean : clean;
  return `https://wa.me/${number}?text=${encodeURIComponent(text)}`;
}

export default function StudentProfile() {
  const { id } = useParams();
  const navigate = useNavigate();
  const [data, setData] = useState(null);

  const load = async () => {
    try {
      const { data } = await api.get(`/students/${id}/history`);
      setData(data);
    } catch (e) {
      toast.error(formatApiError(e));
      navigate("/batches");
    }
  };
  useEffect(() => { load(); /* eslint-disable-next-line */ }, [id]);

  if (!data) return <Layout title="Loading…"><Loading /></Layout>;

  const { student, batch, attendance_summary, attendance_records, fees, expected_monthly_fee, total_paid } = data;

  const sendParentWhatsApp = () => {
    const phone = student.parent_phone || student.phone;
    if (!phone) {
      toast.warning("No parent/student phone on file");
      return;
    }
    const text = `Hi! This is a quick update from EduManage about ${student.name}'s class — ${batch?.name || ""}. Please let me know if you have any questions.`;
    const url = buildWhatsAppUrl(phone, text);
    if (url) window.open(url, "_blank");
  };

  return (
    <Layout
      title={student.name}
      subtitle={batch ? `${batch.name} · ${[batch.subject, batch.session].filter(Boolean).join(" • ")}` : "Student profile"}
      action={
        <Link to={batch ? `/batches/${batch.id}` : "/batches"} className="btn-ghost hidden md:inline-flex" data-testid="back-to-batch">
          <ArrowLeft className="w-4 h-4" /> Back to batch
        </Link>
      }
    >
      {/* Header card */}
      <div className="edu-card mb-5 flex flex-col sm:flex-row gap-5 items-start sm:items-center">
        <Initials name={student.name} />
        <div className="flex-1 min-w-0">
          <div className="font-semibold text-[18px]">{student.name}</div>
          <div className="text-[12px] text-edu-on-variant uppercase tracking-wider mt-0.5">
            {student.student_code ? `ID ${student.student_code}` : "Student"}
          </div>
          <div className="mt-3 grid grid-cols-1 sm:grid-cols-3 gap-2 text-[13px] text-edu-on-variant">
            {student.phone && <div className="flex items-center gap-2"><Phone className="w-4 h-4" /> {student.phone}</div>}
            {student.parent_name && <div className="flex items-center gap-2"><UserIcon className="w-4 h-4" /> Parent: {student.parent_name}</div>}
            {student.parent_phone && <div className="flex items-center gap-2"><Phone className="w-4 h-4" /> {student.parent_phone}</div>}
          </div>
        </div>
        {(student.parent_phone || student.phone) && (
          <button onClick={sendParentWhatsApp} data-testid="student-whatsapp-btn"
                  className="btn-secondary"
                  style={{ background: "rgba(22,163,74,0.12)", color: "#15803d" }}>
            <MessageCircle className="w-4 h-4" /> Message parent
          </button>
        )}
      </div>

      {/* Stat grid */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
        <div className="edu-card" data-testid="stat-attendance-percent">
          <div className="text-[11px] font-semibold uppercase tracking-wider text-edu-on-variant">Attendance</div>
          <div className="text-[28px] font-bold tabular-nums mt-1 text-edu-primary">{attendance_summary.percent}%</div>
          <div className="text-[12px] text-edu-on-variant mt-1">
            {attendance_summary.present} present · {attendance_summary.absent} absent
          </div>
        </div>
        <div className="edu-card">
          <div className="text-[11px] font-semibold uppercase tracking-wider text-edu-on-variant">Classes attended</div>
          <div className="text-[28px] font-bold tabular-nums mt-1 text-[#15803d]">{attendance_summary.present}</div>
          <div className="text-[12px] text-edu-on-variant mt-1">of {attendance_summary.total} marked</div>
        </div>
        <div className="edu-card">
          <div className="text-[11px] font-semibold uppercase tracking-wider text-edu-on-variant">Monthly fee</div>
          <div className="text-[28px] font-bold tabular-nums mt-1">{inr(expected_monthly_fee)}</div>
          <div className="text-[12px] text-edu-on-variant mt-1">
            {student.monthly_fee ? "Custom" : "From batch"}
          </div>
        </div>
        <div className="edu-card">
          <div className="text-[11px] font-semibold uppercase tracking-wider text-edu-on-variant">Total paid</div>
          <div className="text-[28px] font-bold tabular-nums mt-1 text-[#15803d]">{inr(total_paid)}</div>
          <div className="text-[12px] text-edu-on-variant mt-1">{fees.length} payments</div>
        </div>
      </div>

      {/* Two columns: attendance + fees */}
      <div className="grid lg:grid-cols-2 gap-5">
        <div className="edu-card">
          <div className="flex items-center gap-2 mb-3">
            <CalendarDays className="w-4 h-4 text-edu-primary" />
            <div className="font-semibold text-[15px]">Attendance log</div>
          </div>
          {attendance_records.length === 0 ? (
            <div className="text-center py-6 text-edu-on-variant text-[14px]">No attendance recorded yet.</div>
          ) : (
            <div className="max-h-[420px] overflow-auto scrollbar-thin pr-1">
              <ul className="divide-y divide-edu-outline-variant">
                {attendance_records.map((r, i) => (
                  <li key={i} className="flex items-center justify-between py-2.5">
                    <div className="text-[14px] tabular-nums">{r.date}</div>
                    {r.status === "present" ? (
                      <span className="chip-success"><CheckCircle2 className="w-3 h-3 mr-1" /> Present</span>
                    ) : (
                      <span className="chip-error"><XCircle className="w-3 h-3 mr-1" /> Absent</span>
                    )}
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>

        <div className="edu-card">
          <div className="flex items-center gap-2 mb-3">
            <IndianRupee className="w-4 h-4 text-edu-primary" />
            <div className="font-semibold text-[15px]">Fee ledger</div>
          </div>
          {fees.length === 0 ? (
            <div className="text-center py-6 text-edu-on-variant text-[14px]">No payments yet.</div>
          ) : (
            <div className="max-h-[420px] overflow-auto scrollbar-thin pr-1">
              <ul className="divide-y divide-edu-outline-variant">
                {fees.map((f, i) => (
                  <li key={i} className="flex items-center justify-between py-2.5">
                    <div>
                      <div className="font-semibold text-[14px]">{f.month}</div>
                      <div className="text-[12px] text-edu-on-variant">{f.paid_on || "—"}{f.note ? ` · ${f.note}` : ""}</div>
                    </div>
                    <div className="font-bold tabular-nums text-[15px]">{inr(f.amount)}</div>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
      </div>
    </Layout>
  );
}
