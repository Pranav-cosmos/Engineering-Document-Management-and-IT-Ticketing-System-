import { useState } from "react";
import { useNavigate, Link } from "react-router-dom";
import { supabase } from "../lib/supabase";

export default function Register() {
  const [formData, setFormData] = useState({
    email: "",
    password: "",
  });
  const [ui, setUi] = useState({
    error: "",
    busy: false,
  });
  const navigate = useNavigate();

  async function handleSubmit(e) {
    e.preventDefault();
    setUi({
      ...ui,
      error: "",
      busy: true,
    });

    const { error } = await supabase.auth.signUp({
      email: formData.email,
      password: formData.password,
    });

    if (error) {
      setUi({
        error: error.message,
        busy: false,
      });
      return;
    }

    setUi({
      error: "",
      busy: false,
    });

    navigate("/dashboard");
  }

  return (
    <div className="auth-page">
      <div className="auth-card">
        <div className="auth-logo"><div className="logo-icon">E</div></div>
        <h1>Create account</h1>
        <p className="auth-subtitle">Get started with EDMS today</p>

        {ui.error && <div className="auth-error">{ui.error}</div>}

        <form onSubmit={handleSubmit}>
          <div className="input-group">
            <label htmlFor="reg-email">Email</label>
            <input id="reg-email" className="input" type="email" placeholder="you@company.com" value={formData.email} onChange={(e) => setFormData({ ...formData, email: e.target.value })} required />
          </div>
          <div className="input-group">
            <label htmlFor="reg-password">Password</label>
            <input id="reg-password" className="input" type="password" placeholder="Min 6 characters" value={formData.password} onChange={e => setFormData({ ...formData, password: e.target.value })} required minLength={6} />
          </div>
          <button className="btn btn-primary" type="submit" disabled={ui.busy}>
            {ui.busy ? "Creating..." : "Create Account"}
          </button>
        </form>

        <div className="auth-switch">
          Already have an account? <Link to="/">Sign in</Link>
        </div>
      </div>
    </div>
  );
}