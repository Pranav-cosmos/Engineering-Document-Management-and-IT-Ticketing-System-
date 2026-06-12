import { useState } from "react";
import { useNavigate, Link } from "react-router-dom";
import { supabase } from "../lib/supabase";

export default function Login() {
  const [formData, setFormData] = useState({
    email: "",
    password: "",
  });

  const [ui, setUi] = useState({
    error: "",
    message: "",
    busy: false
  });
  const navigate = useNavigate();

  async function handleSubmit(e) {
    e.preventDefault();
    setUi({
      error: "",
      message: "",
      busy: true
    })

    const { error } = await supabase.auth.signInWithPassword({
      email: formData.email,
      password: formData.password
    });

    if (error) {
      setUi({
        error: error.message,
        message: "",
        busy: false
      });
      return;
    }

    setUi({
      error: "",
      message: "",
      busy: false,
    });

    navigate("/dashboard");
  }

  async function handlePasswordReset() {
    if (!formData.email) {
      setUi({ error: "Enter your email first.", message: "", busy: false });
      return;
    }

    setUi({ error: "", message: "", busy: true });
    const { error } = await supabase.auth.resetPasswordForEmail(formData.email, {
      redirectTo: window.location.origin,
    });
    setUi({
      error: error?.message || "",
      message: error ? "" : "Password reset email sent.",
      busy: false,
    });
  }

  return (
    <div className="auth-page">
      <div className="auth-card">
        <div className="auth-logo"><div className="logo-icon">TASL</div></div>
        <h1>Welcome back</h1>
        <p className="auth-subtitle">Sign in to your EDMS account</p>

        {ui.error && <div className="auth-error">{ui.error}</div>}
        {ui.message && <div className="auth-success">{ui.message}</div>}

        <form onSubmit={handleSubmit}>
          <div className="input-group">
            <label htmlFor="login-email">Email</label>

            <input id="login-email" className="input" type="email" placeholder="you@company.com" value={formData.email} onChange={e => setFormData({
              ...formData,
              email: e.target.value
            })} required />

          </div>
          <div className="input-group">
            <label htmlFor="login-password">Password</label>

            <input id="login-password" className="input" type="password" placeholder="Enter password" value={formData.password} onChange={e => setFormData({
              ...formData,
              password: e.target.value
            })} required minLength={6} />

          </div>
          <button className="btn btn-primary" type="submit" disabled={ui.busy}>
            {ui.busy ? "Signing in..." : "Sign In"}
          </button>
        </form>

        <div className="auth-switch">
          Don't have an account? <Link to="/register">Create one</Link>
        </div>
        <div className="auth-switch">
          <button className="link-button" type="button" onClick={handlePasswordReset} disabled={ui.busy}>
            Forgot password?
          </button>
        </div>
      </div>
    </div>
  );
}
