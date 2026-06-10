import { Link, useLocation } from "react-router-dom";
import { supabase } from "../lib/supabase";
import { useEffect, useState } from "react";

export default function Sidebar() {
  const { pathname } = useLocation();
  const [profile, setProfile] = useState(null);
  const [isOpen, setIsOpen] = useState(false)

  useEffect(() => {
    fetchProfile();
  }, []);

  async function fetchProfile() {
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) return;

    const { data, error } = await supabase
      .from("profiles")
      .select("*")
      .eq("id", user.id)
      .single();

    if (error) {
      console.error(error);
      return;
    }

    setProfile(data);
  }

  const nav = [
    { to: "/dashboard", label: "Dashboard" },
    { to: "/documents", label: "Documents" },
    { to: "/tickets", label: "Tickets" },
  ];

  return (
    <aside className="sidebar">
      <div className="sidebar-logo">
        <div className="logo-icon">TASL</div>
        <span>EDMS</span>
      </div>

      <nav>
        <ul>
          {nav.map(l => (
            <li key={l.to}>
              <Link to={l.to} className={pathname === l.to ? "active" : ""}>{l.label}</Link>
            </li>
          ))}
        </ul>
      </nav>

      <div className="sidebar-footer">
        <div className="user-info">
          <div className="avatar">{profile?.full_name ? profile.full_name[0].toUpperCase() : "U"}</div>
          <div>
            <div className="user-label">{profile?.full_name}</div>
            <div className="user-email">{profile?.role}</div>
          </div>
        </div>
        <button className="btn btn-ghost btn-sm" style={{ width: "100%", marginTop: 8 }}
          onClick={() => supabase.auth.signOut().then(() => window.location.href = "/")}>
          Sign Out
        </button>
      </div>
    </aside>
  );
}