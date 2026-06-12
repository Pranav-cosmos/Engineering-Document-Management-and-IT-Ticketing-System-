import { useState } from "react";
import { useNavigate, Link } from "react-router-dom";
import { supabase } from "../lib/supabase";

export default function Register() {
  const navigate = useNavigate();

  const [formData, setFormData] = useState({
    full_name: "",
    role: "",
    email: "",
    password: "",
  });

  const [ui, setUi] = useState({
    error: "",
    busy: false,
  });

  async function handleSubmit(e) {
    e.preventDefault();

    setUi({
      error: "",
      busy: true,
    });

    try {
      // Create auth user
      const { data, error } = await supabase.auth.signUp({
        email: formData.email,
        password: formData.password,
        options: {
          data: {
            full_name: formData.full_name,
            role: formData.role,
          },
        },
      });

      if (error) throw error;

      const user = data.user;

      if (!user) {
        throw new Error("User creation failed.");
      }

      // Create or update profile. A database trigger may already create this row.
      const { error: profileError } = await supabase
        .from("profiles")
        .upsert([
          {
            id: user.id,
            full_name: formData.full_name,
            role: formData.role,
          },
        ]);

      if (profileError) throw profileError;

      navigate("/dashboard");
    } catch (err) {
      setUi({
        error: err.message,
        busy: false,
      });
      return;
    }

    setUi({
      error: "",
      busy: false,
    });
  }

  return (
    <div className="auth-page">
      <div className="auth-card">
        <div className="auth-logo">
          <div className="logo-icon">TASL</div>
        </div>

        <h1>Create Account</h1>
        <p className="auth-subtitle">
          Get started with EDMS today
        </p>

        {ui.error && (
          <div className="auth-error">
            {ui.error}
          </div>
        )}

        <form onSubmit={handleSubmit}>
          <div className="input-group">
            <label htmlFor="name">
              Full Name
            </label>

            <input
              id="name"
              className="input"
              type="text"
              placeholder="Enter your full name"
              value={formData.full_name}
              onChange={(e) =>
                setFormData({
                  ...formData,
                  full_name: e.target.value,
                })
              }
              required
            />
          </div>

          <div className="input-group">
            <label htmlFor="role">
              Role
            </label>

            <select
              id="role"
              className="input"
              value={formData.role}
              onChange={(e) =>
                setFormData({
                  ...formData,
                  role: e.target.value,
                })
              }
              required
            >
              <option value="">
                Select Role
              </option>

              <option value="Engineer">
                Engineer
              </option>

              <option value="IT">
                IT
              </option>
            </select>
          </div>

          <div className="input-group">
            <label htmlFor="email">
              Email
            </label>

            <input
              id="email"
              className="input"
              type="email"
              placeholder="you@company.com"
              value={formData.email}
              onChange={(e) =>
                setFormData({
                  ...formData,
                  email: e.target.value,
                })
              }
              required
            />
          </div>

          <div className="input-group">
            <label htmlFor="password">
              Password
            </label>

            <input
              id="password"
              className="input"
              type="password"
              placeholder="Minimum 6 characters"
              value={formData.password}
              onChange={(e) =>
                setFormData({
                  ...formData,
                  password: e.target.value,
                })
              }
              minLength={6}
              required
            />
          </div>

          <button
            type="submit"
            className="btn btn-primary"
            disabled={ui.busy}
          >
            {ui.busy
              ? "Creating..."
              : "Create Account"}
          </button>
        </form>

        <div className="auth-switch">
          Already have an account?{" "}
          <Link to="/">
            Sign In
          </Link>
        </div>
      </div>
    </div>
  );
}
