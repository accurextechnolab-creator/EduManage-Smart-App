import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { GraduationCap, LogIn, ArrowRight } from "lucide-react";
import { useAuth } from "@/lib/auth";

export default function Login() {
  const { login, error, setError } = useAuth();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const nav = useNavigate();

  const submit = async (e) => {
    e.preventDefault();
    setBusy(true);
    const ok = await login(email, password);
    setBusy(false);
    if (ok) nav("/");
  };

  return (
    <div className="min-h-screen bg-edu-surface grid md:grid-cols-2">
      {/* Left brand panel */}
      <div className="hidden md:flex flex-col justify-between bg-edu-primary text-white p-12 relative overflow-hidden">
        <div className="absolute -bottom-32 -right-32 w-96 h-96 rounded-full bg-white/5" />
        <div className="absolute bottom-24 -left-20 w-72 h-72 rounded-full bg-white/5" />
        <div className="relative">
          <div className="flex items-center gap-3 mb-12">
            <div className="w-10 h-10 rounded-[8px] bg-white text-edu-primary grid place-items-center">
              <GraduationCap className="w-6 h-6" />
            </div>
            <div className="text-[20px] font-bold tracking-tight">EduManage</div>
          </div>
          <h1 className="text-[42px] leading-[1.05] font-bold tracking-tight max-w-md">
            The calm,<br />reliable way to run<br />your coaching class.
          </h1>
          <p className="text-white/80 mt-6 max-w-md text-[15px] leading-relaxed">
            Attendance batch-wise, fees on time, expenses tracked — and clean PDF reports to share. Made for tutors who want their evenings back.
          </p>
        </div>
        <div className="relative text-[12px] uppercase tracking-wider text-white/70">
          INSTRUCTIONAL CLARITY · MOBILE FIRST · BUILT FOR INDIAN TUTORS
        </div>
      </div>

      {/* Form panel */}
      <div className="flex items-center justify-center p-6 md:p-12">
        <div className="w-full max-w-sm reveal">
          <div className="md:hidden flex items-center gap-3 mb-8">
            <div className="w-10 h-10 rounded-[8px] bg-edu-primary text-white grid place-items-center">
              <GraduationCap className="w-5 h-5" />
            </div>
            <div className="text-[20px] font-bold">EduManage</div>
          </div>
          <div className="text-[12px] font-semibold uppercase tracking-wider text-edu-on-variant mb-2">WELCOME BACK</div>
          <h2 className="text-[28px] font-bold tracking-tight mb-6">Sign in to your account</h2>

          <form onSubmit={submit} className="space-y-4">
            <div>
              <label className="edu-label">Email</label>
              <input
                type="email"
                required
                data-testid="login-email-input"
                value={email}
                onChange={(e) => { setEmail(e.target.value); setError(""); }}
                placeholder="you@coaching.com"
                className="edu-input"
              />
            </div>
            <div>
              <label className="edu-label">Password</label>
              <input
                type="password"
                required
                data-testid="login-password-input"
                value={password}
                onChange={(e) => { setPassword(e.target.value); setError(""); }}
                placeholder="••••••••"
                className="edu-input"
              />
            </div>

            {error && (
              <div data-testid="login-error" className="text-[13px] text-edu-error bg-edu-error-bg px-3 py-2 rounded-[6px]">
                {error}
              </div>
            )}

            <button
              type="submit"
              disabled={busy}
              data-testid="login-submit-button"
              className="btn-primary w-full py-3"
            >
              <LogIn className="w-4 h-4" /> {busy ? "Signing in…" : "Sign in"}
            </button>
          </form>

          <div className="text-[14px] text-edu-on-variant mt-6 text-center">
            New here?{" "}
            <Link to="/register" data-testid="goto-register-link" className="text-edu-primary font-semibold inline-flex items-center gap-1">
              Create an account <ArrowRight className="w-3.5 h-3.5" />
            </Link>
          </div>

          <div className="mt-6 text-[12px] text-edu-on-variant text-center">
            Demo: <span className="font-mono">admin@edumanage.app</span> / <span className="font-mono">admin123</span>
          </div>
        </div>
      </div>
    </div>
  );
}
