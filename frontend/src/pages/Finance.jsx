import { useEffect, useState } from "react";
import { Plus, X, CheckCircle2, XCircle, Trash2, IndianRupee, Receipt, MessageCircle, Send, ExternalLink } from "lucide-react";
import { toast } from "sonner";
import { api, formatApiError, inr, currentMonth, todayISO } from "@/lib/api";
import Layout from "@/components/Layout";
import { Loading, Initials } from "@/components/ui-edu";

function MonthInput({ value, onChange, testId }) {
  return (
    <input type="month" data-testid={testId} value={value}
           onChange={(e) => onChange(e.target.value)}
           className="edu-input sm:max-w-[180px]" />
  );
}

function FeesPanel() {
  const [batches, setBatches] = useState([]);
  const [batchId, setBatchId] = useState("");
  const [month, setMonth] = useState(currentMonth());
  const [data, setData] = useState(null);
  const [payOpen, setPayOpen] = useState(false);
  const [payForm, setPayForm] = useState({ student_id: "", student_name: "", amount: 0, paid_on: todayISO(), note: "" });
  const [bulkOpen, setBulkOpen] = useState(false);
  const [bulkSent, setBulkSent] = useState({}); // { [student_id]: true }

  const formatMonthLong = (m) => {
    const [y, mm] = m.split("-").map(Number);
    return new Date(y, mm - 1, 1).toLocaleString("en-IN", { month: "long", year: "numeric" });
  };

  const buildWhatsAppUrl = (phone, text) => {
    const clean = (phone || "").replace(/[^\d]/g, "");
    if (!clean) return null;
    const number = clean.length === 10 ? "91" + clean : clean;
    return `https://wa.me/${number}?text=${encodeURIComponent(text)}`;
  };

  const sendReminder = (row) => {
    const phone = row.student.parent_phone || row.student.phone;
    if (!phone) {
      toast.warning("No phone number on file for this student");
      return;
    }
    const greeting = row.student.parent_name ? `Hi ${row.student.parent_name}` : "Hi";
    const text =
`${greeting},

This is a gentle reminder that ${row.student.name}'s coaching fee of ₹${row.expected} for ${formatMonthLong(month)} is still pending.

Please share the payment when convenient.

Thank you!`;
    const url = buildWhatsAppUrl(phone, text);
    if (url) window.open(url, "_blank");
  };

  useEffect(() => {
    api.get("/batches").then(({ data }) => {
      setBatches(data);
      if (!batchId && data[0]) setBatchId(data[0].id);
    });
  }, []);

  const load = async () => {
    if (!batchId) return;
    const { data } = await api.get("/fees", { params: { batch_id: batchId, month } });
    setData(data);
  };
  useEffect(() => { load(); /* eslint-disable-next-line */ }, [batchId, month]);

  const totalPaid = data?.rows.reduce((s, r) => s + r.paid, 0) || 0;
  const totalExpected = data?.rows.reduce((s, r) => s + r.expected, 0) || 0;
  const totalDiscount = data?.rows.reduce((s, r) => s + (r.discount_savings || 0), 0) || 0;
  const totalBalanceDue = data?.rows.reduce((s, r) => s + Math.max(0, r.balance || 0), 0) || 0;
  const totalBalanceAdvance = data?.rows.reduce((s, r) => s + Math.max(0, -(r.balance || 0)), 0) || 0;

  const openPay = (r) => {
    setPayForm({
      student_id: r.student.id,
      student_name: r.student.name,
      amount: r.paid > 0 ? r.paid : r.expected,
      paid_on: r.paid_on || todayISO(),
      note: r.note || "",
    });
    setPayOpen(true);
  };

  const submitPay = async (e) => {
    e.preventDefault();
    try {
      await api.post("/fees/pay", {
        batch_id: batchId,
        student_id: payForm.student_id,
        month,
        amount: Number(payForm.amount) || 0,
        paid_on: payForm.paid_on,
        note: payForm.note || "",
      });
      toast.success("Payment recorded");
      setPayOpen(false);
      load();
    } catch (e) { toast.error(formatApiError(e)); }
  };

  const unmark = async (sid) => {
    if (!confirm("Mark as unpaid? This deletes the payment record for this month.")) return;
    try {
      await api.delete("/fees", { params: { batch_id: batchId, student_id: sid, month } });
      toast.success("Marked as unpaid");
      load();
    } catch (e) { toast.error(formatApiError(e)); }
  };

  if (batches.length === 0) {
    return <div className="edu-card text-center py-10 text-edu-on-variant">Create a batch first to track fees.</div>;
  }

  const unpaidWithPhone = (data?.rows || []).filter(
    (r) => r.status !== "paid" && ((r.student.parent_phone || "").trim() || (r.student.phone || "").trim())
  );
  const unpaidNoPhone = (data?.rows || []).filter(
    (r) => r.status !== "paid" && !((r.student.parent_phone || "").trim() || (r.student.phone || "").trim())
  );

  const openBulk = () => { setBulkSent({}); setBulkOpen(true); };

  const sendBulkOne = (r) => {
    sendReminder(r);
    setBulkSent((prev) => ({ ...prev, [r.student.id]: true }));
  };

  return (
    <>
      <div className="flex flex-col sm:flex-row gap-3 mb-4">
        <select data-testid="fees-batch-select" value={batchId} onChange={(e) => setBatchId(e.target.value)} className="edu-input sm:max-w-[240px]">
          {batches.map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}
        </select>
        <MonthInput value={month} onChange={setMonth} testId="fees-month" />
        {data && unpaidWithPhone.length > 0 && (
          <button onClick={openBulk} data-testid="bulk-remind-btn"
                  className="btn-primary sm:ml-auto"
                  style={{ background: "#15803d" }}>
            <Send className="w-4 h-4" /> Send {unpaidWithPhone.length} reminder{unpaidWithPhone.length === 1 ? "" : "s"}
          </button>
        )}
      </div>

      {!data ? <Loading /> : (
        <>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-4">
            <div className="edu-card !p-3">
              <div className="text-[10px] uppercase tracking-wider text-edu-on-variant">Collected this month</div>
              <div className="text-[18px] font-bold text-[#15803d] tabular-nums">{inr(totalPaid)}</div>
            </div>
            <div className="edu-card !p-3" data-testid="fees-summary-expected">
              <div className="text-[10px] uppercase tracking-wider text-edu-on-variant">Expected this month</div>
              <div className="text-[18px] font-bold tabular-nums">{inr(totalExpected)}</div>
              {totalDiscount > 0 && (
                <div className="text-[11px] text-[#15803d] mt-0.5 tabular-nums" data-testid="fees-summary-discount">
                  after {inr(totalDiscount)} discount
                </div>
              )}
            </div>
            <div className="edu-card !p-3" data-testid="fees-summary-balance-due">
              <div className="text-[10px] uppercase tracking-wider text-edu-on-variant">Balance due (carry-forward)</div>
              <div className="text-[18px] font-bold text-edu-error tabular-nums">{inr(totalBalanceDue)}</div>
              <div className="text-[10px] text-edu-on-variant mt-0.5">cumulative up to {month}</div>
            </div>
            <div className="edu-card !p-3" data-testid="fees-summary-balance-advance">
              <div className="text-[10px] uppercase tracking-wider text-edu-on-variant">Advance held</div>
              <div className="text-[18px] font-bold text-[#15803d] tabular-nums">{inr(totalBalanceAdvance)}</div>
              <div className="text-[10px] text-edu-on-variant mt-0.5">prepayments</div>
            </div>
          </div>

          {data.rows.length === 0 ? (
            <div className="edu-card text-center py-10 text-edu-on-variant">No students in this batch yet.</div>
          ) : (
            <div className="space-y-2">
              {data.rows.map((r) => (
                <div key={r.student.id} className="edu-card !p-3.5 flex items-center justify-between gap-3" data-testid={`fee-row-${r.student.id}`}>
                  <div className="flex items-center gap-3 min-w-0">
                    <Initials name={r.student.name} />
                    <div className="min-w-0">
                      <div className="font-semibold text-[15px] truncate flex items-center gap-2">
                        {r.student.name}
                        {r.discount_savings > 0 && (
                          <span className="chip-success !px-2 !py-0 text-[10px]"
                                data-testid={`fee-discount-chip-${r.student.id}`}
                                title={r.discount_reason || "Discount applied"}>
                            {r.discount_percent > 0
                              ? `${Math.round(r.discount_percent)}% off`
                              : `${inr(r.discount_savings)} off`}
                          </span>
                        )}
                      </div>
                      <div className="text-[12px] text-edu-on-variant">
                        {r.discount_savings > 0 ? (
                          <>
                            <span className="line-through tabular-nums opacity-70">{inr(r.list_fee)}</span>
                            {" → "}
                            <span className="tabular-nums font-semibold text-edu-on">{inr(r.expected)}</span>
                            {r.discount_reason && <span className="ml-1 opacity-80">· {r.discount_reason}</span>}
                          </>
                        ) : (
                          <>Expected <span className="tabular-nums">{inr(r.expected)}</span></>
                        )}
                        {r.paid > 0 && <> · Paid <span className="tabular-nums">{inr(r.paid)}</span> on {r.paid_on}</>}
                        {(r.balance || 0) !== 0 && (
                          <span className="sm:hidden ml-1">
                            {" · "}
                            <span className={`font-semibold ${r.balance > 0 ? "text-edu-error" : "text-[#15803d]"}`}>
                              {r.balance > 0 ? `Bal ${inr(r.balance)}` : `Adv ${inr(-r.balance)}`}
                            </span>
                          </span>
                        )}
                      </div>
                    </div>
                  </div>
                  <div className="flex items-center gap-2 flex-shrink-0">
                    {(r.balance || 0) !== 0 && (
                      <div className="text-right hidden sm:block" data-testid={`fee-balance-${r.student.id}`}>
                        <div className="text-[10px] uppercase tracking-wider text-edu-on-variant">Balance</div>
                        <div className={`text-[14px] font-bold tabular-nums ${r.balance > 0 ? "text-edu-error" : "text-[#15803d]"}`}>
                          {r.balance > 0 ? inr(r.balance) : `+${inr(-r.balance)}`}
                        </div>
                      </div>
                    )}
                    {r.status === "paid" ? (
                      <>
                        <span className="chip-success"><CheckCircle2 className="w-3 h-3 mr-1" /> Paid</span>
                        <button onClick={() => unmark(r.student.id)} data-testid={`fee-unmark-${r.student.id}`}
                                className="btn-danger-ghost text-[12px] !px-2 !py-1">Unmark</button>
                      </>
                    ) : (
                      <>
                        <span className="chip-error"><XCircle className="w-3 h-3 mr-1" /> Unpaid</span>
                        <button onClick={() => sendReminder(r)} data-testid={`fee-whatsapp-${r.student.id}`}
                                title="Send WhatsApp reminder"
                                className="inline-flex items-center justify-center gap-1.5 rounded-[6px] px-2.5 py-1 text-[12px] font-semibold transition-all active:scale-[0.98]"
                                style={{ background: "rgba(22,163,74,0.12)", color: "#15803d" }}>
                          <MessageCircle className="w-3.5 h-3.5" /> Remind
                        </button>
                        <button onClick={() => openPay(r)} data-testid={`fee-pay-${r.student.id}`} className="btn-secondary text-[12px] !px-3 !py-1">
                          <IndianRupee className="w-3.5 h-3.5" /> Record
                        </button>
                      </>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </>
      )}

      {payOpen && (
        <div className="fixed inset-0 z-40 bg-black/40 backdrop-blur-[2px] grid place-items-center p-4">
          <div className="bg-white rounded-edu w-full max-w-md p-6 reveal max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-[18px] font-semibold">Record payment</h3>
              <button onClick={() => setPayOpen(false)} className="p-1 text-edu-on-variant" data-testid="pay-close"><X className="w-5 h-5" /></button>
            </div>
            <div className="text-[14px] text-edu-on-variant mb-3">For <span className="font-semibold text-edu-on">{payForm.student_name}</span> · {month}</div>
            <form onSubmit={submitPay} className="space-y-3">
              <div>
                <label className="edu-label">Amount (₹) *</label>
                <input required type="number" min="0" data-testid="pay-amount" value={payForm.amount}
                       onChange={(e) => setPayForm({ ...payForm, amount: e.target.value })}
                       className="edu-input" />
              </div>
              <div>
                <label className="edu-label">Paid on</label>
                <input type="date" data-testid="pay-date" value={payForm.paid_on}
                       onChange={(e) => setPayForm({ ...payForm, paid_on: e.target.value })}
                       className="edu-input" />
              </div>
              <div>
                <label className="edu-label">Note (optional)</label>
                <input value={payForm.note} data-testid="pay-note"
                       onChange={(e) => setPayForm({ ...payForm, note: e.target.value })}
                       placeholder="UPI / Cash / Cheque" className="edu-input" />
              </div>
              <div className="flex gap-2 pt-2">
                <button type="button" onClick={() => setPayOpen(false)} className="btn-ghost flex-1">Cancel</button>
                <button type="submit" data-testid="pay-submit" className="btn-primary flex-1">Save payment</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {bulkOpen && (
        <div className="fixed inset-0 z-40 bg-black/40 backdrop-blur-[2px] grid place-items-center p-4">
          <div className="bg-white rounded-edu w-full max-w-lg p-6 reveal max-h-[90vh] flex flex-col">
            <div className="flex items-center justify-between mb-2">
              <div>
                <h3 className="text-[18px] font-semibold">Send fee reminders</h3>
                <p className="text-[12px] text-edu-on-variant mt-0.5">
                  {Object.keys(bulkSent).length} of {unpaidWithPhone.length} sent · {formatMonthLong(month)}
                </p>
              </div>
              <button onClick={() => setBulkOpen(false)} className="p-1 text-edu-on-variant" data-testid="bulk-close">
                <X className="w-5 h-5" />
              </button>
            </div>

            <p className="text-[13px] text-edu-on-variant bg-edu-surface-low rounded-[6px] px-3 py-2 mb-3 mt-2">
              Tap each parent to open WhatsApp with a pre-filled reminder. We can&apos;t auto-open many tabs (browsers block that), but each tap is one click away.
            </p>

            <div className="overflow-auto scrollbar-thin -mx-1 px-1 flex-1">
              {unpaidWithPhone.length === 0 ? (
                <div className="text-center py-6 text-edu-on-variant text-[14px]">
                  No unpaid students with a phone number on file for this batch.
                </div>
              ) : (
                <ul className="divide-y divide-edu-outline-variant">
                  {unpaidWithPhone.map((r) => {
                    const sent = !!bulkSent[r.student.id];
                    const phone = r.student.parent_phone || r.student.phone;
                    return (
                      <li key={r.student.id} className="flex items-center justify-between gap-3 py-2.5"
                          data-testid={`bulk-row-${r.student.id}`}>
                        <div className="flex items-center gap-3 min-w-0">
                          <Initials name={r.student.name} />
                          <div className="min-w-0">
                            <div className="font-semibold text-[14px] truncate">{r.student.name}</div>
                            <div className="text-[12px] text-edu-on-variant truncate">
                              {phone} · {inr(r.expected)} pending
                            </div>
                          </div>
                        </div>
                        <button
                          onClick={() => sendBulkOne(r)}
                          data-testid={`bulk-send-${r.student.id}`}
                          className="inline-flex items-center justify-center gap-1.5 rounded-[6px] px-3 py-1.5 text-[12px] font-semibold transition-all active:scale-[0.98]"
                          style={
                            sent
                              ? { background: "#ededf8", color: "#434654" }
                              : { background: "rgba(22,163,74,0.15)", color: "#15803d" }
                          }>
                          {sent ? (<><CheckCircle2 className="w-3.5 h-3.5" /> Sent</>) : (<><MessageCircle className="w-3.5 h-3.5" /> Send</>)}
                          {!sent && <ExternalLink className="w-3 h-3 opacity-60" />}
                        </button>
                      </li>
                    );
                  })}
                </ul>
              )}

              {unpaidNoPhone.length > 0 && (
                <div className="mt-4 pt-3 border-t border-edu-outline-variant">
                  <div className="text-[11px] font-semibold uppercase tracking-wider text-edu-on-variant mb-2">
                    {unpaidNoPhone.length} unpaid · no phone on file
                  </div>
                  <ul className="space-y-1.5">
                    {unpaidNoPhone.map((r) => (
                      <li key={r.student.id} className="text-[13px] text-edu-on-variant flex items-center justify-between">
                        <span>{r.student.name}</span>
                        <span className="tabular-nums">{inr(r.expected)}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </div>

            <div className="flex gap-2 pt-4 mt-3 border-t border-edu-outline-variant">
              <button onClick={() => setBulkOpen(false)} className="btn-ghost flex-1" data-testid="bulk-done">
                Done
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}

function ExpensesPanel() {
  const [month, setMonth] = useState(currentMonth());
  const [expenses, setExpenses] = useState(null);
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState({ title: "", amount: 0, category: "Utilities", date: todayISO(), note: "" });

  const load = async () => {
    const { data } = await api.get("/expenses", { params: { month } });
    setExpenses(data);
  };
  useEffect(() => { load(); /* eslint-disable-next-line */ }, [month]);

  const submit = async (e) => {
    e.preventDefault();
    try {
      await api.post("/expenses", { ...form, amount: Number(form.amount) || 0 });
      toast.success("Expense added");
      setForm({ title: "", amount: 0, category: "Utilities", date: todayISO(), note: "" });
      setOpen(false);
      load();
    } catch (e) { toast.error(formatApiError(e)); }
  };

  const remove = async (id) => {
    if (!confirm("Delete this expense?")) return;
    try { await api.delete(`/expenses/${id}`); toast.success("Deleted"); load(); }
    catch (e) { toast.error(formatApiError(e)); }
  };

  const total = expenses?.reduce((s, e) => s + (e.amount || 0), 0) || 0;

  return (
    <>
      <div className="flex flex-col sm:flex-row gap-3 mb-4">
        <MonthInput value={month} onChange={setMonth} testId="exp-month" />
        <button onClick={() => setOpen(true)} data-testid="exp-add-btn" className="btn-primary sm:ml-auto">
          <Plus className="w-4 h-4" /> New Expense
        </button>
      </div>

      <div className="edu-card !p-3 mb-4 flex items-center justify-between">
        <div className="text-[12px] uppercase tracking-wider text-edu-on-variant">Total for {month}</div>
        <div className="text-[20px] font-bold text-edu-error tabular-nums">{inr(total)}</div>
      </div>

      {expenses === null ? <Loading /> : expenses.length === 0 ? (
        <div className="edu-card text-center py-10 text-edu-on-variant">
          No expenses logged for this month.
        </div>
      ) : (
        <div className="space-y-2">
          {expenses.map((e) => (
            <div key={e.id} className="edu-card !p-3.5 flex items-center justify-between" data-testid={`exp-row-${e.id}`}>
              <div className="flex items-center gap-3 min-w-0">
                <div className="w-10 h-10 rounded-[8px] bg-edu-error-bg text-edu-error grid place-items-center">
                  <Receipt className="w-5 h-5" />
                </div>
                <div className="min-w-0">
                  <div className="font-semibold text-[15px] truncate">{e.title}</div>
                  <div className="text-[12px] text-edu-on-variant">
                    {e.date} · {e.category}{e.note ? ` · ${e.note}` : ""}
                  </div>
                </div>
              </div>
              <div className="flex items-center gap-2">
                <div className="text-[15px] font-bold tabular-nums">{inr(e.amount)}</div>
                <button onClick={() => remove(e.id)} data-testid={`exp-delete-${e.id}`} className="btn-danger-ghost"><Trash2 className="w-4 h-4" /></button>
              </div>
            </div>
          ))}
        </div>
      )}

      {open && (
        <div className="fixed inset-0 z-40 bg-black/40 backdrop-blur-[2px] grid place-items-center p-4">
          <div className="bg-white rounded-edu w-full max-w-md p-6 reveal max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-[18px] font-semibold">New Expense</h3>
              <button onClick={() => setOpen(false)} className="p-1 text-edu-on-variant" data-testid="exp-close"><X className="w-5 h-5" /></button>
            </div>
            <form onSubmit={submit} className="space-y-3">
              <div>
                <label className="edu-label">Title *</label>
                <input required data-testid="exp-title" value={form.title}
                       onChange={(e) => setForm({ ...form, title: e.target.value })}
                       placeholder="Electricity bill" className="edu-input" />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="edu-label">Amount (₹) *</label>
                  <input required type="number" min="0" data-testid="exp-amount" value={form.amount}
                         onChange={(e) => setForm({ ...form, amount: e.target.value })}
                         className="edu-input" />
                </div>
                <div>
                  <label className="edu-label">Date</label>
                  <input type="date" data-testid="exp-date" value={form.date}
                         onChange={(e) => setForm({ ...form, date: e.target.value })}
                         className="edu-input" />
                </div>
              </div>
              <div>
                <label className="edu-label">Category</label>
                <select data-testid="exp-category" value={form.category}
                        onChange={(e) => setForm({ ...form, category: e.target.value })}
                        className="edu-input">
                  {["Utilities", "Rent", "Stationery", "Salary", "Marketing", "Travel", "Internet", "Other"].map((c) =>
                    <option key={c} value={c}>{c}</option>)}
                </select>
              </div>
              <div>
                <label className="edu-label">Note</label>
                <input value={form.note} data-testid="exp-note"
                       onChange={(e) => setForm({ ...form, note: e.target.value })}
                       className="edu-input" />
              </div>
              <div className="flex gap-2 pt-2">
                <button type="button" onClick={() => setOpen(false)} className="btn-ghost flex-1">Cancel</button>
                <button type="submit" data-testid="exp-submit" className="btn-primary flex-1">Add expense</button>
              </div>
            </form>
          </div>
        </div>
      )}
    </>
  );
}

export default function Finance() {
  const [tab, setTab] = useState("fees");
  return (
    <Layout title="Finance" subtitle="Manage fees collection and expenses">
      <div className="flex items-center gap-1 mb-5 bg-white border border-edu-outline-variant rounded-full p-1 w-fit">
        <button onClick={() => setTab("fees")} data-testid="finance-tab-fees"
                className={`px-4 py-1.5 rounded-full text-[13px] font-semibold transition-all ${tab === "fees" ? "bg-edu-primary text-white" : "text-edu-on-variant"}`}>
          Fees
        </button>
        <button onClick={() => setTab("expenses")} data-testid="finance-tab-expenses"
                className={`px-4 py-1.5 rounded-full text-[13px] font-semibold transition-all ${tab === "expenses" ? "bg-edu-primary text-white" : "text-edu-on-variant"}`}>
          Expenses
        </button>
      </div>

      {tab === "fees" ? <FeesPanel /> : <ExpensesPanel />}
    </Layout>
  );
}
