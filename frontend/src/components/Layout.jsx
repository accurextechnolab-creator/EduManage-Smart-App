import { NavLink, useNavigate } from "react-router-dom";
import { LayoutDashboard, Users, Wallet, FileText, LogOut, GraduationCap } from "lucide-react";
import { useAuth } from "../lib/auth";

const NAV = [
  { to: "/", label: "Dashboard", icon: LayoutDashboard, testId: "nav-dashboard" },
  { to: "/batches", label: "Batches", icon: Users, testId: "nav-batches" },
  { to: "/finance", label: "Finance", icon: Wallet, testId: "nav-finance" },
  { to: "/reports", label: "Reports", icon: FileText, testId: "nav-reports" },
];

export default function Layout({ children, title, subtitle, action }) {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const handleLogout = async () => {
    await logout();
    navigate("/login");
  };

  return (
    <div className="min-h-screen bg-edu-surface text-edu-on">
      {/* Sidebar (desktop) */}
      <aside className="hidden md:flex md:fixed md:inset-y-0 md:left-0 md:w-64 md:flex-col bg-white border-r border-edu-outline-variant">
        <div className="px-6 py-6 flex items-center gap-3 border-b border-edu-outline-variant">
          <div className="w-9 h-9 rounded-[8px] bg-edu-primary text-white grid place-items-center">
            <GraduationCap className="w-5 h-5" />
          </div>
          <div className="leading-tight">
            <div className="font-bold text-[18px] tracking-tight">EduManage</div>
            <div className="text-[11px] uppercase tracking-wider text-edu-on-variant">Instructional Clarity</div>
          </div>
        </div>
        <nav className="flex-1 px-3 py-4 space-y-1">
          {NAV.map((n) => (
            <NavLink
              key={n.to}
              to={n.to}
              end={n.to === "/"}
              data-testid={`${n.testId}-desktop`}
              className={({ isActive }) =>
                `flex items-center gap-3 px-3 py-2.5 rounded-[6px] text-[14px] font-medium transition-colors ${
                  isActive
                    ? "bg-edu-primary-fixed text-edu-primary"
                    : "text-edu-on-variant hover:bg-edu-surface-low"
                }`
              }
            >
              <n.icon className="w-4 h-4" /> {n.label}
            </NavLink>
          ))}
        </nav>
        <div className="px-3 py-4 border-t border-edu-outline-variant">
          <div className="px-3 mb-2">
            <div className="text-[13px] font-semibold truncate" data-testid="sidebar-user-name">{user?.name}</div>
            <div className="text-[11px] text-edu-on-variant truncate">{user?.email}</div>
          </div>
          <button
            onClick={handleLogout}
            data-testid="logout-btn-desktop"
            className="w-full flex items-center gap-2 px-3 py-2 rounded-[6px] text-[13px] text-edu-on-variant hover:bg-edu-error-bg hover:text-edu-error transition-colors"
          >
            <LogOut className="w-4 h-4" /> Logout
          </button>
        </div>
      </aside>

      {/* Main */}
      <div className="md:pl-64">
        {/* TopAppBar (mobile) */}
        <header className="md:hidden sticky top-0 z-30 bg-white border-b border-edu-outline-variant px-5 py-3 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-[6px] bg-edu-primary text-white grid place-items-center">
              <GraduationCap className="w-4 h-4" />
            </div>
            <div className="font-bold text-[16px]">EduManage</div>
          </div>
          <button onClick={handleLogout} data-testid="logout-btn-mobile" className="text-edu-on-variant p-2">
            <LogOut className="w-5 h-5" />
          </button>
        </header>

        {/* Title row */}
        <div className="px-5 md:px-10 pt-5 md:pt-8 pb-2 flex items-start justify-between gap-3">
          <div>
            <h1 className="text-[22px] md:text-[28px] font-bold tracking-tight">{title}</h1>
            {subtitle && <p className="text-edu-on-variant text-[14px] mt-1">{subtitle}</p>}
          </div>
          {action}
        </div>

        <main className="px-5 md:px-10 pt-3 pb-28 md:pb-12 reveal">{children}</main>
      </div>

      {/* Bottom nav (mobile) */}
      <nav className="md:hidden fixed bottom-0 left-0 right-0 z-30 bg-white border-t border-edu-outline-variant px-2 py-1.5 flex items-center justify-around">
        {NAV.map((n) => (
          <NavLink
            key={n.to}
            to={n.to}
            end={n.to === "/"}
            data-testid={`${n.testId}-mobile`}
            className={({ isActive }) =>
              `flex flex-col items-center justify-center px-3 py-1.5 rounded-[8px] transition-colors min-w-[64px] ${
                isActive
                  ? "bg-edu-primary-fixed text-edu-primary"
                  : "text-edu-on-variant"
              }`
            }
          >
            <n.icon className="w-5 h-5" />
            <span className="text-[10px] font-semibold uppercase tracking-wider mt-0.5">{n.label}</span>
          </NavLink>
        ))}
      </nav>
    </div>
  );
}
