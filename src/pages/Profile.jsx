import { useEffect, useState } from "react";
import Sidebar from "../components/Sidebar";
import { supabase } from "../lib/supabase";
import { logAudit } from "../utils/audit";

export default function Profile() {
  const [user, setUser] = useState(null);
  const [form, setForm] = useState({ full_name: "", role: "Engineer", department: "" });
  const [toast, setToast] = useState(null);
  const [loading, setLoading] = useState(true);

  function showToast(message, type = "success") {
    setToast({ message, type });
    setTimeout(() => setToast(null), 3000);
  }

  useEffect(() => {
    async function loadProfile() {
      const { data: { user: authUser } } = await supabase.auth.getUser();
      if (!authUser) return;
      setUser(authUser);
      const { data } = await supabase.from("profiles").select("*").eq("id", authUser.id).single();
      if (data) {
        setForm({
          full_name: data.full_name || "",
          role: data.role || "Engineer",
          department: data.department || "",
        });
      }
      setLoading(false);
    }
    loadProfile();
  }, []);

  async function saveProfile(event) {
    event.preventDefault();
    const { error } = await supabase.from("profiles").update({
      full_name: form.full_name,
      department: form.department || null,
    }).eq("id", user.id);

    if (error) {
      showToast(error.message, "error");
      return;
    }

    await logAudit(user.id, "EDIT", "USER", user.id, "Updated own profile");
    showToast("Profile updated");
  }

  async function resetPassword() {
    const { error } = await supabase.auth.resetPasswordForEmail(user.email, {
      redirectTo: window.location.origin,
    });
    showToast(error ? error.message : "Password reset email sent", error ? "error" : "success");
  }

  return (
    <div className="layout">
      <Sidebar />
      <div className="content">
        <div className="page-header">
          <h1>Profile</h1>
          <p>Manage your account details and password reset</p>
        </div>

        {loading ? (
          <div className="loading-screen"><div className="spinner" /></div>
        ) : (
          <div className="upload-section">
            <h2>User Profile</h2>
            <form className="upload-form" onSubmit={saveProfile}>
              <div className="input-group">
                <label>Email</label>
                <input className="input" value={user?.email || ""} disabled />
              </div>
              <div className="input-group">
                <label>Role</label>
                <input className="input" value={form.role} disabled />
              </div>
              <div className="input-group">
                <label>Full Name</label>
                <input className="input" value={form.full_name} onChange={(e) => setForm({ ...form, full_name: e.target.value })} required />
              </div>
              <div className="input-group">
                <label>Department</label>
                <input className="input" value={form.department} onChange={(e) => setForm({ ...form, department: e.target.value })} />
              </div>
              <div className="upload-actions">
                <button className="btn btn-ghost" type="button" onClick={resetPassword}>Send Password Reset</button>
                <button className="btn btn-primary" type="submit">Save Profile</button>
              </div>
            </form>
          </div>
        )}
      </div>
      {toast && <div className={`toast toast-${toast.type}`}>{toast.message}</div>}
    </div>
  );
}
