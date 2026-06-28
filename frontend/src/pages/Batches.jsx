import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { Plus, Users, X, Trash2, BookOpen } from "lucide-react";
import { toast } from "sonner";
import { api, formatApiError, inr } from "@/lib/api";
import Layout from "@/components/Layout";
import { Loading, Empty } from "@/components/ui-edu";

export default function Batches() {
  const [batches, setBatches] = useState(null);
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState({ name: "", subject: "", session: "", monthly_fee: 0 });
  const [busy, setBusy] = useState(false);

  const load = async () => {
    const { data } = await api.get("/batches");
    setBatches(data);
  };
  useEffect(() => { load(); }, []);

  const create = async (e) => {
    e.preventDefault();
    setBusy(true);
    try {
      await api.post("/batches", { ...form, monthly_fee: Number(form.monthly_fee) || 0 });
      toast.success("Batch created");
      setOpen(false);
      setForm({ name: "", subject: "", session: "", monthly_fee: 0 });
      load();
    } catch (e) { toast.error(formatApiError(e)); }
    setBusy(false);
  };

  const remove = async (id) => {
    if (!confirm("Delete this batch? Students, attendance and fees in it will also be removed.")) return;
    try {
      await api.delete(`/batches/${id}`);
      toast.success("Batch deleted");
      load();
    } catch (e) { toast.error(formatApiError(e)); }
  };

  return (
    <Layout
      title="Batches"
      subtitle="Group your students by class, subject or session"
      action={
        <button onClick={() => setOpen(true)} data-testid="batches-add-btn" className="btn-primary">
          <Plus className="w-4 h-4" /> New Batch
        </button>
      }
    >
      {batches === null ? <Loading /> : batches.length === 0 ? (
        <Empty
          title="No batches yet"
          subtitle="Start by creating a batch — like '10th Class Batch A — Mathematics — Morning Session'."
          action={
            <button onClick={() => setOpen(true)} data-testid="batches-empty-add-btn" className="btn-primary">
              <Plus className="w-4 h-4" /> Create your first batch
            </button>
          }
        />
      ) : (
        <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {batches.map((b) => (
            <div key={b.id} className="edu-card hover:border-edu-primary/40 group" data-testid={`batch-card-${b.id}`}>
              <div className="flex items-start justify-between">
                <div className="w-10 h-10 rounded-[8px] bg-edu-primary-fixed text-edu-primary grid place-items-center">
                  <BookOpen className="w-5 h-5" />
                </div>
                <button onClick={() => remove(b.id)} data-testid={`batch-delete-${b.id}`}
                        className="text-edu-on-variant hover:text-edu-error p-1 rounded transition-colors">
                  <Trash2 className="w-4 h-4" />
                </button>
              </div>
              <Link to={`/batches/${b.id}`} data-testid={`batch-open-${b.id}`} className="block mt-3">
                <div className="font-semibold text-[16px] group-hover:text-edu-primary transition-colors">{b.name}</div>
                <div className="text-[12px] text-edu-on-variant mt-0.5">
                  {[b.subject, b.session].filter(Boolean).join(" • ") || "—"}
                </div>
              </Link>
              <div className="flex items-center justify-between mt-4 pt-3 border-t border-edu-outline-variant">
                <div className="flex items-center gap-1.5 text-[13px] text-edu-on-variant">
                  <Users className="w-4 h-4" /> {b.student_count} students
                </div>
                <div className="text-[13px] font-semibold tabular-nums">{inr(b.monthly_fee)}<span className="text-[11px] font-normal text-edu-on-variant">/mo</span></div>
              </div>
            </div>
          ))}
        </div>
      )}

      {open && (
        <div className="fixed inset-0 z-40 bg-black/40 backdrop-blur-[2px] grid place-items-center p-4">
          <div className="bg-white rounded-edu w-full max-w-md p-6 reveal">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-[18px] font-semibold">New Batch</h3>
              <button onClick={() => setOpen(false)} className="p-1 text-edu-on-variant" data-testid="new-batch-close"><X className="w-5 h-5" /></button>
            </div>
            <form onSubmit={create} className="space-y-3">
              <div>
                <label className="edu-label">Batch name *</label>
                <input required data-testid="new-batch-name" value={form.name}
                       onChange={(e) => setForm({ ...form, name: e.target.value })}
                       placeholder="10th Class Batch A" className="edu-input" />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="edu-label">Subject</label>
                  <input data-testid="new-batch-subject" value={form.subject}
                         onChange={(e) => setForm({ ...form, subject: e.target.value })}
                         placeholder="Mathematics" className="edu-input" />
                </div>
                <div>
                  <label className="edu-label">Session</label>
                  <input data-testid="new-batch-session" value={form.session}
                         onChange={(e) => setForm({ ...form, session: e.target.value })}
                         placeholder="Morning" className="edu-input" />
                </div>
              </div>
              <div>
                <label className="edu-label">Monthly Fee (₹)</label>
                <input type="number" min="0" data-testid="new-batch-fee" value={form.monthly_fee}
                       onChange={(e) => setForm({ ...form, monthly_fee: e.target.value })}
                       placeholder="1500" className="edu-input" />
              </div>
              <div className="flex gap-2 pt-2">
                <button type="button" onClick={() => setOpen(false)} className="btn-ghost flex-1">Cancel</button>
                <button type="submit" disabled={busy} data-testid="new-batch-submit" className="btn-primary flex-1">
                  {busy ? "Creating…" : "Create batch"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </Layout>
  );
}
