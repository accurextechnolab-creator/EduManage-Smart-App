import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { api, inr } from "@/lib/api";
import Layout from "@/components/Layout";
import { Stat, Loading } from "@/components/ui-edu";
import { useAuth } from "@/lib/auth";
import { Plus, ArrowRight, TrendingUp, TrendingDown, Users, CalendarCheck } from "lucide-react";

export default function Dashboard() {
  const { user } = useAuth();
  const [stats, setStats] = useState(null);
  const [batches, setBatches] = useState([]);

  useEffect(() => {
    (async () => {
      const [s, b] = await Promise.all([api.get("/dashboard/stats"), api.get("/batches")]);
      setStats(s.data);
      setBatches(b.data);
    })();
  }, []);

  return (
    <Layout
      title={`Hello, ${user?.name?.split(" ")[0] || "Teacher"} 👋`}
      subtitle={stats ? `Today is ${new Date(stats.today).toLocaleDateString("en-IN", { weekday: "long", day: "numeric", month: "long" })}` : ""}
      action={
        <Link to="/batches" data-testid="dashboard-new-batch-link" className="btn-primary hidden sm:inline-flex">
          <Plus className="w-4 h-4" /> Add Batch
        </Link>
      }
    >
      {!stats ? <Loading /> : (
        <>
          {/* Top stat cards */}
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
            <Stat testId="stat-students" label="Total Students" value={stats.total_students} sub={`Across ${stats.total_batches} batches`} />
            <Stat testId="stat-attendance" label="Today's Attendance" value={`${stats.present_today}`} sub={`${stats.absent_today} absent`} accent="success" />
            <Stat testId="stat-fees" label={`Fees in ${stats.month}`} value={inr(stats.fees_collected)} sub={`of ${inr(stats.fees_expected)} expected`} />
            <Stat testId="stat-expenses" label={`Expenses in ${stats.month}`} value={inr(stats.expenses_total)} sub={`Net ${inr(stats.net)}`} accent={stats.net >= 0 ? "success" : "error"} />
          </div>

          {/* Two columns */}
          <div className="grid lg:grid-cols-3 gap-5 mt-6">
            {/* Batches list */}
            <div className="lg:col-span-2 edu-card">
              <div className="flex items-center justify-between mb-4">
                <div>
                  <div className="text-[11px] font-semibold uppercase tracking-wider text-edu-on-variant">Batches</div>
                  <h3 className="text-[18px] font-semibold">Your active batches</h3>
                </div>
                <Link to="/batches" className="btn-ghost" data-testid="dashboard-view-all-batches">View all <ArrowRight className="w-4 h-4" /></Link>
              </div>
              {batches.length === 0 ? (
                <div className="text-center py-10 text-edu-on-variant text-[14px]">
                  No batches yet. <Link to="/batches" className="text-edu-primary font-semibold">Create your first batch</Link>.
                </div>
              ) : (
                <ul className="divide-y divide-edu-outline-variant">
                  {batches.slice(0, 5).map((b) => (
                    <li key={b.id}>
                      <Link to={`/batches/${b.id}`} data-testid={`batch-link-${b.id}`}
                            className="flex items-center justify-between py-3 group">
                        <div>
                          <div className="font-semibold text-[15px] group-hover:text-edu-primary transition-colors">{b.name}</div>
                          <div className="text-[12px] text-edu-on-variant mt-0.5">
                            {[b.subject, b.session].filter(Boolean).join(" • ")}
                          </div>
                        </div>
                        <div className="text-right">
                          <div className="text-[13px] font-semibold tabular-nums">{b.student_count}</div>
                          <div className="text-[11px] uppercase tracking-wider text-edu-on-variant">students</div>
                        </div>
                      </Link>
                    </li>
                  ))}
                </ul>
              )}
            </div>

            {/* Quick glance */}
            <div className="space-y-5">
              <div className="edu-card">
                <div className="text-[11px] font-semibold uppercase tracking-wider text-edu-on-variant mb-3">Today at a glance</div>
                <div className="flex items-center justify-between py-2">
                  <div className="flex items-center gap-2 text-edu-on-variant text-[13px]"><CalendarCheck className="w-4 h-4" /> Attendance marked</div>
                  <div className="font-semibold tabular-nums">{stats.present_today + stats.absent_today}</div>
                </div>
                <div className="flex items-center justify-between py-2">
                  <div className="flex items-center gap-2 text-edu-on-variant text-[13px]"><Users className="w-4 h-4" /> Active students</div>
                  <div className="font-semibold tabular-nums">{stats.total_students}</div>
                </div>
                <div className="flex items-center justify-between py-2">
                  <div className="flex items-center gap-2 text-edu-on-variant text-[13px]"><TrendingUp className="w-4 h-4 text-[#15803d]" /> Fees this month</div>
                  <div className="font-semibold tabular-nums">{inr(stats.fees_collected)}</div>
                </div>
                <div className="flex items-center justify-between py-2">
                  <div className="flex items-center gap-2 text-edu-on-variant text-[13px]"><TrendingDown className="w-4 h-4 text-edu-error" /> Expenses</div>
                  <div className="font-semibold tabular-nums">{inr(stats.expenses_total)}</div>
                </div>
                <div className="border-t border-edu-outline-variant mt-3 pt-3 flex items-center justify-between">
                  <div className="text-[12px] font-semibold uppercase tracking-wider">Net</div>
                  <div className={`font-bold tabular-nums ${stats.net >= 0 ? "text-[#15803d]" : "text-edu-error"}`}>{inr(stats.net)}</div>
                </div>
              </div>

              <Link to="/reports" data-testid="dashboard-reports-link"
                    className="edu-card flex items-center justify-between hover:border-edu-primary/40">
                <div>
                  <div className="text-[11px] font-semibold uppercase tracking-wider text-edu-on-variant">Reports</div>
                  <div className="font-semibold text-[15px]">Generate PDF reports</div>
                  <div className="text-[12px] text-edu-on-variant">Attendance • Fees • Expenses</div>
                </div>
                <ArrowRight className="w-5 h-5 text-edu-primary" />
              </Link>
            </div>
          </div>
        </>
      )}
    </Layout>
  );
}
