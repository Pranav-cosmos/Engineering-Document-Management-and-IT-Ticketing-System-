import { useEffect, useMemo, useState } from "react";
import Sidebar from "../components/Sidebar";
import { supabase } from "../lib/supabase";
import { logAudit } from "../utils/audit";

const roles = ["Admin", "Engineer", "IT"];

export default function Users() {
  const [profiles, setProfiles] = useState([]);
  const [currentProfile, setCurrentProfile] = useState(null);
  const [editing, setEditing] = useState(null);
  const [form, setForm] = useState({ full_name: "", role: "Engineer", department: "" });
  const [search, setSearch] = useState("");
  const [toast, setToast] = useState(null);
  const [loading, setLoading] = useState(true);

  function showToast(message, type = "success") {
    setToast({ message, type });
    setTimeout(() => setToast(null), 3000);
  }

  async function loadUsers() {
    setLoading(true);
    const { data: { user } } = await supabase.auth.getUser();
    if (user) {
      const { data: me } = await supabase.from("profiles").select("*").eq("id", user.id).single();
      setCurrentProfile(me);
    }
    const { data, error } = await supabase.from("profiles").select("*").order("created_at", { ascending: false });
    if (error) {
      showToast(error.message, "error");
    } else {
      setProfiles(data || []);
    }
    setLoading(false);
  }

  useEffect(() => {
    loadUsers();
  }, []);

  const canManage = currentProfile?.role === "Admin";

  const filtered = useMemo(() => {
    const needle = search.toLowerCase();
    return profiles.filter((profile) =>
      !needle ||
      String(profile.full_name || "").toLowerCase().includes(needle) ||
      String(profile.role || "").toLowerCase().includes(needle) ||
      String(profile.department || "").toLowerCase().includes(needle)
    );
  }, [profiles, search]);

  function startEdit(profile) {
    setEditing(profile);
    setForm({
      full_name: profile.full_name || "",
      role: profile.role || "Engineer",
      department: profile.department || "",
    });
  }

  async function saveUser(event) {
    event.preventDefault();
    if (!editing || !canManage) return;
    const payload = {
      full_name: form.full_name,
      role: form.role,
      department: form.department || null,
    };
    const { error } = await supabase.from("profiles").update(payload).eq("id", editing.id);
    if (error) { showToast(error.message, "error"); return; }
    const { data: { user } } = await supabase.auth.getUser();
    await logAudit(user?.id, "EDIT", "USER", editing.id, `Updated user ${form.full_name}`);
    setEditing(null);
    showToast("User updated");
    loadUsers();
  }

  return (
    <div className="layout">
      <Sidebar />
      <div className="content">
        <div className="page-header">
          <h1>Users</h1>
          <p>Manage user profiles, roles, and departments</p>
        </div>

        {!canManage && (
          <div className="auth-error" style={{ marginBottom: 24 }}>
            Only Admin can manage users.
          </div>
        )}

        {editing && canManage && (
          <div className="upload-section">
            <h2>Edit User</h2>
            <form className="upload-form" onSubmit={saveUser}>
              <div className="input-group">
                <label>Full Name</label>
                <input className="input" value={form.full_name} onChange={(e) => setForm({ ...form, full_name: e.target.value })} required />
              </div>
              <div className="input-group">
                <label>Role</label>
                <select className="input" value={form.role} onChange={(e) => setForm({ ...form, role: e.target.value })}>
                  {roles.map((role) => <option key={role} value={role}>{role}</option>)}
                </select>
              </div>
              <div className="input-group">
                <label>Department</label>
                <input className="input" value={form.department} onChange={(e) => setForm({ ...form, department: e.target.value })} />
              </div>
              <div className="upload-actions">
                <button className="btn btn-ghost" type="button" onClick={() => setEditing(null)}>Cancel</button>
                <button className="btn btn-primary" type="submit">Save User</button>
              </div>
            </form>
          </div>
        )}

        <div className="upload-section">
          <h2>All Users</h2>
          <div className="input-group" style={{ marginBottom: 20 }}>
            <label>Search</label>
            <input className="input" value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search by name, role, or department" />
          </div>

          {loading ? (
            <div className="loading-screen" style={{ minHeight: 180 }}><div className="spinner" /></div>
          ) : filtered.length === 0 ? (
            <div className="empty-state"><h3>No users found</h3><p>Adjust search or register a user</p></div>
          ) : (
            <div className="doc-grid">
              {filtered.map((profile) => (
                <div key={profile.id} className="doc-card">
                  <div className="doc-card-header"><h3>{profile.full_name || "Unnamed User"}</h3></div>
                  <div className="doc-card-meta">
                    <span className="badge">{profile.role || "Engineer"}</span>
                    {profile.department && <span className="badge">{profile.department}</span>}
                  </div>
                  {canManage && (
                    <div className="doc-card-actions">
                      <button className="btn btn-ghost btn-sm" onClick={() => startEdit(profile)}>Edit</button>
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
      {toast && <div className={`toast toast-${toast.type}`}>{toast.message}</div>}
    </div>
  );
}
