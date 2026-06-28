import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { GraduationCap, UserPlus } from "lucide-react";
import { useAuth } from "@/lib/auth";

export default function Register() {
  const { register, error, setError } = useAuth();
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const nav = useNavigate();

  const submit = async (e) => {
    e.preventDefault();
    setBusy(true);
    const ok = await register(email, password, name);
    setBusy(false);
    if (ok) nav("/");
  };

  return (
    <div className="min-h-screen bg-edu-surface grid md:grid-cols-2">
      <div className="hidden md:flex flex-col justify-between bg-edu-primary text-white p-12 relative overflow-hidden">
        <div className="absolute -top-24 -right-24 w-96 h-96 rounded-full bg-white/5" />
        <div>
          <div className="flex items-center gap-3 mb-12">
            <div className="w-10 h-10 rounded-[8px] bg-white text-edu-primary grid place-items-center">
              <GraduationCap className="w-6 h-6" />
            </div>
            <div className="text-[20px] font-bold tracking-tight">EduManage</div>
          </div>
          <h1 className="text-[40px] leading-[1.05] font-bold tracking-tight max-w-md">
            Set up your<br />coaching class in<br />under a minute.
          </h1>
          <ul className="mt-8 space-y-3 text-white/85 text-[15px]">
            <li>• Create batches and add students</li>
            <li>• Mark attendance batch-wise, every day</li>
            <li>• Track monthly fees collection</li>
            <li>• Log expenses and share PDF reports</li>
          </ul>
        </div>
      </div>

      <div className="flex items-center justify-center p-6 md:p-12">
        <div className="w-full max-w-sm reveal">
          <div className="md:hidden flex items-center gap-3 mb-8">
            <div className="w-10 h-10 rounded-[8px] bg-edu-primary text-white grid place-items-center">
              <GraduationCap className="w-5 h-5" />
            </div>
            <div className="text-[20px] font-bold">EduManage</div>
          </div>
          <div className="text-[12px] font-semibold uppercase tracking-wider text-edu-on-variant mb-2">GET STARTED</div>
          <h2 className="text-[28px] font-bold tracking-tight mb-6">Create your account</h2>

          <form onSubmit={submit} className="space-y-4">
            <div>
              <label className="edu-label">Your name</label>
              <input data-testid="register-name-input" required value={name}
                     onChange={(e) => { setName(e.target.value); setError(""); }}
                     placeholder="e.g. Rohan Mehta" className="edu-input" />
            </div>
            <div>
              <label className="edu-label">Email</label>
              <input type="email" required data-testid="register-email-input" value={email}
                     onChange={(e) => { setEmail(e.target.value); setError(""); }}
                     placeholder="you@coaching.com" className="edu-input" />
            </div>
            <div>
              <label className="edu-label">Password</label>
              <input type="password" required minLength={6} data-testid="register-password-input"
                     value={password} onChange={(e) => { setPassword(e.target.value); setError(""); }}
                     placeholder="At least 6 characters" className="edu-input" />
            </div>

            {error && (
              <div data-testid="register-error" className="text-[13px] text-edu-error bg-edu-error-bg px-3 py-2 rounded-[6px]">
                {error}
              </div>
            )}

            <button type="submit" disabled={busy} data-testid="register-submit-button" className="btn-primary w-full py-3">
              <UserPlus className="w-4 h-4" /> {busy ? "Creating…" : "Create account"}
            </button>
          </form>

          <div className="text-[14px] text-edu-on-variant mt-6 text-center">
            Already have an account?{" "}
            <Link to="/login" data-testid="goto-login-link" className="text-edu-primary font-semibold">Sign in</Link>
          </div>
        </div>
      </div>
    </div>
  );
}
