import { Link, useLocation } from "react-router-dom";
import { supabase } from "../lib/supabase";
import { useEffect, useState } from "react";

export default function Sidebar() {
  const { pathname } = useLocation();
  const [email, setEmail] = useState("");

  useEffect(() => {
    supabase.auth.getUser().then(({ data }) => data?.user && setEmail(data.user.email));
  }, []);

  const nav = [
    { to: "/dashboard", label: "Dashboard" },
    { to: "/documents", label: "Documents" },
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
          <div className="avatar">{email ? email[0].toUpperCase() : "U"}</div>
          <div>
            <div className="user-label">Account</div>
            <div className="user-email">{email || "..."}</div>
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