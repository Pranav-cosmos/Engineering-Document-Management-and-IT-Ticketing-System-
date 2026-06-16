import { Link, useLocation } from "react-router-dom";
import { supabase } from "../lib/supabase";
import { useEffect, useState } from "react";

export default function Sidebar() {
  const { pathname } = useLocation();
  const [profile, setProfile] = useState(null);
  const [isOpen, setIsOpen] = useState(false);

  useEffect(() => {
    fetchProfile();
  }, []);

  async function fetchProfile() {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;
    const { data } = await supabase.from("profiles").select("*").eq("id", user.id).single();
    if (data) setProfile(data);
  }

  const canManageUsers = profile?.role === "Admin" || profile?.role === "IT";

  const nav = [
    { to: "/dashboard", label: "Dashboard" },
    { to: "/documents", label: "Documents" },
    { to: "/tickets", label: "Tickets" },
    { to: "/audit-logs", label: "Audit Logs" },
    ...(canManageUsers ? [{ to: "/users", label: "Users" }] : []),
  ];

  return (
    <>

      <aside className={`sidebar ${isOpen ? "sidebar-open" : ""}`}>
        <div className="sidebar-logo">
          <div className="logo-icon">TASL</div>
          <span>EDMS</span>
        </div>

        <nav>
          <ul>
            {nav.map((item) => (
              <li key={item.to}>
                <Link
                  to={item.to}
                  className={pathname === item.to || pathname.startsWith(`${item.to}/`) ? "active" : ""}
                  onClick={() => setIsOpen(false)}
                >
                  {item.label}
                </Link>
              </li>
            ))}
          </ul>
        </nav>

        <div className="sidebar-footer">
          <Link to="/profile" className="user-info" onClick={() => setIsOpen(false)}>
            <div className="avatar">{profile?.full_name ? profile.full_name[0].toUpperCase() : "U"}</div>
            <div>
              <div className="user-label">{profile?.full_name || "User"}</div>
              <div className="user-email">{profile?.role || "-"}</div>
            </div>
          </Link>
          <button
            className="btn btn-sm"
            style={{ width: "100%", marginTop: 8, background: "rgba(255,255,255,0.06)", border: "1px solid rgba(255,255,255,0.1)", color: "rgba(255,255,255,0.6)" }}
            onClick={() => supabase.auth.signOut().then(() => { window.location.href = "/"; })}
          >
            Sign Out
          </button>
        </div>
      </aside>

      {isOpen && <div className="sidebar-overlay" onClick={() => setIsOpen(false)} />}
    </>
  );
}
