import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import Sidebar from "../components/Sidebar";
import StatCard from "../components/Statcard";
import { supabase } from "../lib/supabase";

export default function Dashboard() {
  const [user, setUser] = useState(null);
  const [profile, setProfile] = useState(null);
  const [stats, setStats] = useState({
    totalDocs: 0,
    openTickets: 0,
    resolvedTickets: 0,
    openProblems: 0,
    myUploads: 0,
    myAssigned: 0,
  });
  const [recentLogs, setRecentLogs] = useState([]);
  const [myWork, setMyWork] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchData();
  }, []);

  async function safeCount(query) {
    const { count, error } = await query;
    return error ? 0 : count || 0;
  }

  async function fetchData() {
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) return;
      setUser(session.user);
      const userId = session.user.id;

      const { data: prof } = await supabase.from("profiles").select("*").eq("id", userId).single();
      setProfile(prof);

      const [totalDocs, openTickets, resolvedTickets, myUploads] = await Promise.all([
        safeCount(supabase.from("documents").select("*", { count: "exact", head: true })),
        safeCount(supabase.from("tickets").select("*", { count: "exact", head: true }).in("status", ["Open", "In Progress"])),
        safeCount(supabase.from("tickets").select("*", { count: "exact", head: true }).in("status", ["Resolved", "Closed"])),
        safeCount(supabase.from("documents").select("*", { count: "exact", head: true }).eq("uploaded_by", userId)),
      ]);

      setStats({ totalDocs, openTickets, resolvedTickets, myUploads });

      const twelveHoursAgo = new Date(
        Date.now() - 12 * 60 * 60 * 1000
      ).toISOString();

      const { data: logs } = await supabase
        .from("audit_logs")
        .select(`
          *,
          user:user_id (
            full_name,
            role
          )
        `)
        .gte("created_at", twelveHoursAgo)
        .order("created_at", { ascending: false });

      setRecentLogs(logs || []);

      setMyWork(work || []);
    } catch (err) {
      console.error("Dashboard fetch error:", err);
    } finally {
      setLoading(false);
    }
  }

  const statusColor = {
    Open: "var(--accent)",
    "In Progress": "var(--warning)",
    "Pending Approval": "var(--warning)",
    Approved: "var(--success)",
    Resolved: "var(--success)",
    Fulfilled: "var(--success)",
    Closed: "var(--text-muted)",
  };

  return (
    <div className="layout">
      <Sidebar />
      <div className="content">
        <div className="page-header">
          <h1>Dashboard</h1>
          {profile && <p>Welcome back, <strong>{profile.full_name || user?.email}</strong> - {profile.role}</p>}
        </div>

        {loading ? (
          <div className="loading-screen" style={{ minHeight: 300 }}><div className="spinner" /></div>
        ) : (
          <>
            <div className="stats-grid">
              <StatCard title="Total Documents" value={stats.totalDocs} />
              <StatCard title="Open Tickets" value={stats.openTickets} />
              <StatCard title="Resolved Tickets" value={stats.resolvedTickets} />
              <StatCard title="My Uploads" value={stats.myUploads} />
            </div>

            <div className="upload-section" style={{ marginBottom: 32 }}>
              <h2>My Assigned Work</h2>
              {myWork.length === 0 ? (
                <div className="empty-state" style={{ padding: "36px 20px" }}><p>No assigned open work.</p></div>
              ) : (
                <div className="doc-grid">
                  {myWork.map((ticket) => {
                    const color = statusColor[ticket.status] || "var(--text-muted)";
                    return (
                      <Link key={ticket.id} to={`/tickets/${ticket.id}`} className="doc-card" style={{ textDecoration: "none", color: "inherit" }}>
                        <div className="doc-card-header"><h3>{ticket.title}</h3></div>
                        <div className="doc-card-meta">
                          <span className="badge" style={{ background: `${color}15`, color, border: `1px solid ${color}30` }}>{ticket.status}</span>
                          <span className="badge">{ticket.priority}</span>
                          <span className="badge">Request</span>
                        </div>
                      </Link>
                    );
                  })}
                </div>
              )}
            </div>

            <div className="upload-section">
              <h2>Recent Activity</h2>
              {recentLogs.length === 0 ? (
                <div className="empty-state" style={{ padding: "40px 20px" }}><p>No recent activity logged yet.</p></div>
              ) : (
                <div className="comments-list">
                  {recentLogs.map((log) => (
                    <div key={log.id} className="doc-card" style={{ padding: "16px 20px" }}>
                      <p style={{ margin: 0, fontWeight: 600, color: "var(--text-heading)" }}>{log.details || log.action}</p>
                      <small style={{ color: "var(--text-muted)" }}>{log.action} - {log.entity_type} - {new Date(log.created_at).toLocaleString()} - {log.user?.full_name || "N/A"} ({log.user?.role || "N/A"}) </small>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </>
        )}
      </div>
    </div>
  );
}
