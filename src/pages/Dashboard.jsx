import { useEffect, useState, useMemo } from "react";
import { Link } from "react-router-dom";
import Sidebar from "../components/Sidebar";
import { supabase } from "../lib/supabase";

// ── Warm Professional Color Palette ──────────────────────────────────────────
const COLORS = {
  teal: "#0d9488",
  emerald: "#059669",
  amber: "#d97706",
  rose: "#e11d48",
  indigo: "#4f46e5",
  violet: "#7c3aed",
  slate: "#475569",
};

// ── Mini SVG Sparkline ───────────────────────────────────────────────────────
function Sparkline({ color = "#fff", points = [20, 60, 40, 80, 50, 90, 70] }) {
  const w = 80, h = 36;
  const max = Math.max(...points);
  const min = Math.min(...points);
  const range = max - min || 1;
  const coords = points.map((p, i) => {
    const x = (i / (points.length - 1)) * w;
    const y = h - ((p - min) / range) * h;
    return `${x},${y}`;
  });
  return (
    <svg width={w} height={h} viewBox={`0 0 ${w} ${h}`} style={{ opacity: 0.45 }}>
      <polyline points={coords.join(" ")} fill="none" stroke={color} strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

// ── Donut Chart ──────────────────────────────────────────────────────────────
function DonutChart({ data, size = 170 }) {
  const total = data.reduce((s, d) => s + d.value, 0) || 1;
  const cx = size / 2, cy = size / 2, r = size * 0.35;
  const strokeW = size * 0.17;
  const circumference = 2 * Math.PI * r;
  let offset = 0;

  return (
    <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`}>
      {data.map((d, i) => {
        const pct = d.value / total;
        const dash = pct * circumference;
        const gap = circumference - dash;
        const currentOffset = offset;
        offset += dash;
        return (
          <circle key={i} cx={cx} cy={cy} r={r} fill="none" stroke={d.color} strokeWidth={strokeW}
            strokeDasharray={`${dash} ${gap}`} strokeDashoffset={-currentOffset} strokeLinecap="butt"
            transform={`rotate(-90 ${cx} ${cy})`}
            style={{ transition: "stroke-dasharray 0.6s ease, stroke-dashoffset 0.6s ease" }}
          />
        );
      })}
      <text x={cx} y={cy - 4} textAnchor="middle" fill="var(--text-heading)" fontFamily="var(--font-heading)" fontWeight="800" fontSize="20">{total}</text>
      <text x={cx} y={cy + 13} textAnchor="middle" fill="var(--text-muted)" fontFamily="var(--font)" fontWeight="500" fontSize="9">TOTAL</text>
    </svg>
  );
}

// ── Area Chart ───────────────────────────────────────────────────────────────
function AreaChart({ datasets, labels, height = 210 }) {
  const padding = { top: 20, right: 16, bottom: 28, left: 38 };
  const chartW = 540;
  const innerW = chartW - padding.left - padding.right;
  const innerH = height - padding.top - padding.bottom;
  const allValues = datasets.flatMap(d => d.data);
  const maxVal = Math.max(...allValues, 1);
  const gridLines = 4;

  function getX(i) { return padding.left + (i / Math.max(labels.length - 1, 1)) * innerW; }
  function getY(v) { return padding.top + innerH - (v / maxVal) * innerH; }

  return (
    <svg width="100%" viewBox={`0 0 ${chartW} ${height}`} style={{ overflow: "visible" }}>
      {Array.from({ length: gridLines + 1 }).map((_, i) => {
        const val = Math.round((maxVal / gridLines) * i);
        const y = getY(val);
        return (
          <g key={i}>
            <line x1={padding.left} y1={y} x2={chartW - padding.right} y2={y} stroke="var(--border)" strokeWidth="1" />
            <text x={padding.left - 6} y={y + 3} textAnchor="end" fill="var(--text-muted)" fontSize="9.5" fontFamily="var(--font)">{val}</text>
          </g>
        );
      })}
      {labels.map((label, i) => (
        <text key={i} x={getX(i)} y={height - 5} textAnchor="middle" fill="var(--text-muted)" fontSize="9.5" fontFamily="var(--font)">{label}</text>
      ))}
      {datasets.map((ds, di) => {
        if (ds.data.length === 0) return null;
        const linePath = ds.data.map((v, i) => `${i === 0 ? "M" : "L"}${getX(i)},${getY(v)}`).join(" ");
        const areaPath = `${linePath} L${getX(ds.data.length - 1)},${getY(0)} L${getX(0)},${getY(0)} Z`;
        return (
          <g key={di}>
            <defs>
              <linearGradient id={`agrad-${di}`} x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor={ds.color} stopOpacity="0.2" />
                <stop offset="100%" stopColor={ds.color} stopOpacity="0.01" />
              </linearGradient>
            </defs>
            <path d={areaPath} fill={`url(#agrad-${di})`} />
            <path d={linePath} fill="none" stroke={ds.color} strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" />
            {ds.data.map((v, i) => (
              <circle key={i} cx={getX(i)} cy={getY(v)} r="3" fill="#fff" stroke={ds.color} strokeWidth="2" />
            ))}
          </g>
        );
      })}
    </svg>
  );
}

// ── Bar Chart ────────────────────────────────────────────────────────────────
function BarChart({ data, height = 190 }) {
  const padding = { top: 14, right: 14, bottom: 30, left: 38 };
  const chartW = 540;
  const innerW = chartW - padding.left - padding.right;
  const innerH = height - padding.top - padding.bottom;
  const maxVal = Math.max(...data.map(d => d.value), 1);
  const barW = Math.min(44, (innerW - 10 * data.length) / data.length);

  return (
    <svg width="100%" viewBox={`0 0 ${chartW} ${height}`}>
      {[0, 0.25, 0.5, 0.75, 1].map((pct, i) => {
        const y = padding.top + innerH * (1 - pct);
        return (
          <g key={i}>
            <line x1={padding.left} y1={y} x2={chartW - padding.right} y2={y} stroke="var(--border)" strokeWidth="1" />
            <text x={padding.left - 6} y={y + 3} textAnchor="end" fill="var(--text-muted)" fontSize="9.5" fontFamily="var(--font)">{Math.round(maxVal * pct)}</text>
          </g>
        );
      })}
      {data.map((d, i) => {
        const x = padding.left + (innerW / data.length) * i + (innerW / data.length - barW) / 2;
        const barH = (d.value / maxVal) * innerH;
        const y = padding.top + innerH - barH;
        return (
          <g key={i}>
            <rect x={x} y={y} width={barW} height={barH} rx={5} fill={d.color}>
              <animate attributeName="height" from="0" to={barH} dur="0.5s" fill="freeze" />
              <animate attributeName="y" from={padding.top + innerH} to={y} dur="0.5s" fill="freeze" />
            </rect>
            <text x={x + barW / 2} y={y - 5} textAnchor="middle" fill="var(--text-heading)" fontSize="10.5" fontWeight="700" fontFamily="var(--font-heading)">{d.value}</text>
            <text x={x + barW / 2} y={height - 7} textAnchor="middle" fill="var(--text-muted)" fontSize="9.5" fontFamily="var(--font)">{d.label}</text>
          </g>
        );
      })}
    </svg>
  );
}

// ── Card Theme Colors ────────────────────────────────────────────────────────
const cardThemes = [
  { bg: "linear-gradient(135deg, #1e293b, #334155)", sparkColor: "#94a3b8" },
  { bg: "linear-gradient(135deg, #0d9488, #14b8a6)", sparkColor: "#ccfbf1" },
  { bg: "linear-gradient(135deg, #d97706, #f59e0b)", sparkColor: "#fef3c7" },
  { bg: "linear-gradient(135deg, #e11d48, #f43f5e)", sparkColor: "#ffe4e6" },
];

const statusColor = {
  Open: "var(--accent)", "In Progress": "var(--warning)",
  Resolved: "var(--success)", Closed: "var(--text-muted)",
};

// ── Utility: group by time period ────────────────────────────────────────────
function groupByPeriod(items, range) {
  const now = new Date();
  const labels = [];
  const counts = [];

  if (range === "7d") {
    // Last 7 days
    for (let i = 6; i >= 0; i--) {
      const d = new Date(now);
      d.setDate(d.getDate() - i);
      d.setHours(0, 0, 0, 0);
      const nextD = new Date(d);
      nextD.setDate(nextD.getDate() + 1);
      labels.push(d.toLocaleDateString("default", { weekday: "short" }));
      const count = items.filter(item => {
        const created = new Date(item.created_at);
        return created >= d && created < nextD;
      }).length;
      counts.push(count);
    }
  } else if (range === "30d") {
    // Last 30 days in ~5-day buckets (6 points)
    for (let i = 5; i >= 0; i--) {
      const endOffset = i * 5;
      const startOffset = endOffset + 5;
      const start = new Date(now);
      start.setDate(start.getDate() - startOffset);
      start.setHours(0, 0, 0, 0);
      const end = new Date(now);
      end.setDate(end.getDate() - endOffset);
      end.setHours(23, 59, 59, 999);
      labels.push(start.toLocaleDateString("default", { month: "short", day: "numeric" }));
      const count = items.filter(item => {
        const created = new Date(item.created_at);
        return created >= start && created <= end;
      }).length;
      counts.push(count);
    }
  } else {
    // 90d — monthly buckets
    for (let i = 2; i >= 0; i--) {
      const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
      const end = new Date(d.getFullYear(), d.getMonth() + 1, 1);
      labels.push(d.toLocaleDateString("default", { month: "short" }));
      const count = items.filter(item => {
        const created = new Date(item.created_at);
        return created >= d && created < end;
      }).length;
      counts.push(count);
    }
  }

  return { labels, counts };
}

// ══════════════════════════════════════════════════════════════════════════════
//  MAIN DASHBOARD
// ══════════════════════════════════════════════════════════════════════════════
export default function Dashboard() {
  const [user, setUser] = useState(null);
  const [profile, setProfile] = useState(null);
  const [stats, setStats] = useState({ totalDocs: 0, openTickets: 0, resolvedTickets: 0, myUploads: 0 });
  const [recentLogs, setRecentLogs] = useState([]);
  const [myWork, setMyWork] = useState([]);
  const [loading, setLoading] = useState(true);

  // Raw data for analytics
  const [allTickets, setAllTickets] = useState([]);
  const [allDocs, setAllDocs] = useState([]);
  const [activeRange, setActiveRange] = useState("30d");

  useEffect(() => { fetchData(); }, []);

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

      // Fetch raw data for charts
      const { data: tickets } = await supabase.from("tickets").select("category, priority, status, created_at").order("created_at", { ascending: true });
      setAllTickets(tickets || []);

      const { data: docs } = await supabase.from("documents").select("created_at").order("created_at", { ascending: true });
      setAllDocs(docs || []);

      // Recent activity (last 12h)
      const twelveHoursAgo = new Date(Date.now() - 12 * 60 * 60 * 1000).toISOString();
      const { data: logs } = await supabase.from("audit_logs").select(`*, user:user_id ( full_name, role )`).gte("created_at", twelveHoursAgo).order("created_at", { ascending: false });
      setRecentLogs(logs || []);

      // My assigned work — role-based visibility
      // Admins: see tickets assigned to them + all unassigned open tickets
      // Others: only see tickets explicitly assigned to them
      const isAdmin = prof?.role === "Admin";
      let workQuery = supabase
        .from("tickets")
        .select("id, title, status, priority, category, assigned_to")
        .in("status", ["Open", "In Progress"])
        .order("created_at", { ascending: false })
        .limit(8);

      if (isAdmin) {
        workQuery = workQuery.or(`assigned_to.eq.${userId},assigned_to.is.null`);
      } else {
        workQuery = workQuery.eq("assigned_to", userId);
      }

      const { data: assignedWork } = await workQuery;
      setMyWork(assignedWork || []);
    } catch (err) {
      console.error("Dashboard fetch error:", err);
    } finally {
      setLoading(false);
    }
  }

  // ── Derived analytics (recalculated when range or data changes) ────────────
  const chartData = useMemo(() => {
    // Category breakdown
    const catColors = { Hardware: COLORS.teal, Software: COLORS.emerald, Access: COLORS.amber, Network: COLORS.rose, Email: COLORS.violet };
    const catMap = {};
    allTickets.forEach(t => { const c = t.category || "Other"; catMap[c] = (catMap[c] || 0) + 1; });
    const byCategory = Object.entries(catMap).map(([label, value]) => ({ label, value, color: catColors[label] || COLORS.slate }));

    // Priority breakdown
    const priColors = { High: COLORS.rose, Medium: COLORS.amber, Low: COLORS.emerald };
    const priMap = {};
    allTickets.forEach(t => { const p = t.priority || "Medium"; priMap[p] = (priMap[p] || 0) + 1; });
    const byPriority = Object.entries(priMap).map(([label, value]) => ({ label, value, color: priColors[label] || COLORS.slate }));

    // Status donut
    const statusColors = { Open: COLORS.teal, "In Progress": COLORS.amber, Resolved: COLORS.emerald, Closed: COLORS.slate };
    const statusMap = {};
    allTickets.forEach(t => { const s = t.status || "Open"; statusMap[s] = (statusMap[s] || 0) + 1; });
    const byStatus = Object.entries(statusMap).map(([label, value]) => ({ label, value, color: statusColors[label] || "#94a3b8" }));

    // Time-series (reacts to activeRange)
    const ticketTrend = groupByPeriod(allTickets, activeRange);
    const docTrend = groupByPeriod(allDocs, activeRange);

    return { byCategory, byPriority, byStatus, ticketTrend, docTrend };
  }, [allTickets, allDocs, activeRange]);

  const statCards = [
    { title: "Total Documents", value: stats.totalDocs, ...cardThemes[0], sparkData: [20, 35, 28, 45, 32, 50, stats.totalDocs || 10] },
    { title: "Open Tickets", value: stats.openTickets, ...cardThemes[1], sparkData: [10, 20, 15, 30, 25, 18, stats.openTickets || 5] },
    { title: "Resolved Tickets", value: stats.resolvedTickets, ...cardThemes[2], sparkData: [5, 12, 18, 22, 28, 35, stats.resolvedTickets || 8] },
    { title: "My Uploads", value: stats.myUploads, ...cardThemes[3], sparkData: [3, 8, 5, 12, 7, 15, stats.myUploads || 4] },
  ];

  const rangeLabel = { "7d": "Last 7 Days", "30d": "Last 30 Days", "90d": "Last 3 Months" };

  return (
    <div className="layout">
      <Sidebar />
      <div className="content">
        <div className="page-header">
          <h1>Analytics</h1>
          {profile && <p>Welcome back, <strong>{profile.full_name || user?.email}</strong></p>}
        </div>

        {loading ? (
          <div className="loading-screen" style={{ minHeight: 300 }}><div className="spinner" /></div>
        ) : (
          <>
            {/* ── Stat Cards ── */}
            <div className="stats-grid" style={{ gridTemplateColumns: "repeat(4, 1fr)" }}>
              {statCards.map((card, i) => (
                <div key={i} style={{
                  background: card.bg, borderRadius: "var(--radius)", padding: "22px 24px", color: "#fff",
                  position: "relative", overflow: "hidden", boxShadow: "var(--shadow-md)",
                  transition: "transform 0.25s ease, box-shadow 0.25s ease", cursor: "default", minHeight: 120,
                }}
                  onMouseEnter={e => { e.currentTarget.style.transform = "translateY(-3px)"; e.currentTarget.style.boxShadow = "var(--shadow-lg)"; }}
                  onMouseLeave={e => { e.currentTarget.style.transform = "translateY(0)"; e.currentTarget.style.boxShadow = "var(--shadow-md)"; }}
                >
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
                    <div>
                      <div style={{ fontSize: "0.76rem", fontWeight: 600, opacity: 0.8, textTransform: "uppercase", letterSpacing: "0.05em", marginBottom: 6 }}>{card.title}</div>
                      <div style={{ fontFamily: "var(--font-heading)", fontSize: "1.85rem", fontWeight: 800, lineHeight: 1.1 }}>{card.value.toLocaleString()}</div>
                    </div>
                    <Sparkline color={card.sparkColor} points={card.sparkData} />
                  </div>
                  <div style={{ marginTop: 10, fontSize: "0.74rem", opacity: 0.65 }}>↑ Updated just now</div>
                </div>
              ))}
            </div>

            {/* ── Charts Row 1: Area + Donut ── */}
            <div style={{ display: "grid", gridTemplateColumns: "1fr 340px", gap: 18, marginBottom: 18 }}>
              {/* Area Chart */}
              <div className="upload-section" style={{ marginBottom: 0 }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 14 }}>
                  <h2 style={{ marginBottom: 0 }}>{rangeLabel[activeRange]} Trend</h2>
                  <div style={{ display: "flex", gap: 4 }}>
                    {["7d", "30d", "90d"].map(r => (
                      <button key={r} onClick={() => setActiveRange(r)} style={{
                        padding: "5px 14px", borderRadius: 7, border: "1px solid var(--border)",
                        background: activeRange === r ? "var(--accent)" : "transparent",
                        color: activeRange === r ? "#fff" : "var(--text-muted)",
                        cursor: "pointer", fontSize: "0.78rem", fontWeight: 600, fontFamily: "var(--font)", transition: "all 0.2s ease",
                      }}>{r}</button>
                    ))}
                  </div>
                </div>
                {/* Summary numbers */}
                <div style={{ display: "flex", gap: 28, marginBottom: 18 }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                    <div style={{ width: 36, height: 36, borderRadius: 9, background: "rgba(13,148,136,0.1)", display: "flex", alignItems: "center", justifyContent: "center", fontSize: "1rem" }}>🎫</div>
                    <div>
                      <div style={{ fontFamily: "var(--font-heading)", fontWeight: 700, fontSize: "0.72rem", color: "var(--text-muted)", textTransform: "uppercase", letterSpacing: "0.05em" }}>Tickets</div>
                      <div style={{ fontFamily: "var(--font-heading)", fontSize: "1.3rem", fontWeight: 800, color: "var(--text-heading)" }}>
                        {chartData.ticketTrend.counts.reduce((a, b) => a + b, 0)}
                      </div>
                    </div>
                  </div>
                  <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                    <div style={{ width: 36, height: 36, borderRadius: 9, background: "rgba(217,119,6,0.1)", display: "flex", alignItems: "center", justifyContent: "center", fontSize: "1rem" }}>📄</div>
                    <div>
                      <div style={{ fontFamily: "var(--font-heading)", fontWeight: 700, fontSize: "0.72rem", color: "var(--text-muted)", textTransform: "uppercase", letterSpacing: "0.05em" }}>Documents</div>
                      <div style={{ fontFamily: "var(--font-heading)", fontSize: "1.3rem", fontWeight: 800, color: "var(--text-heading)" }}>
                        {chartData.docTrend.counts.reduce((a, b) => a + b, 0)}
                      </div>
                    </div>
                  </div>
                </div>
                <AreaChart
                  labels={chartData.ticketTrend.labels}
                  datasets={[
                    { data: chartData.ticketTrend.counts, color: COLORS.teal, label: "Tickets" },
                    { data: chartData.docTrend.counts, color: COLORS.amber, label: "Documents" },
                  ]}
                />
                <div style={{ display: "flex", gap: 18, marginTop: 10, justifyContent: "center" }}>
                  <span style={{ display: "flex", alignItems: "center", gap: 5, fontSize: "0.78rem", color: "var(--text-muted)" }}>
                    <span style={{ width: 7, height: 7, borderRadius: "50%", background: COLORS.teal, display: "inline-block" }} /> Tickets
                  </span>
                  <span style={{ display: "flex", alignItems: "center", gap: 5, fontSize: "0.78rem", color: "var(--text-muted)" }}>
                    <span style={{ width: 7, height: 7, borderRadius: "50%", background: COLORS.amber, display: "inline-block" }} /> Documents
                  </span>
                </div>
              </div>

              {/* Donut Chart */}
              <div className="upload-section" style={{ marginBottom: 0, display: "flex", flexDirection: "column" }}>
                <h2 style={{ marginBottom: 14 }}>Ticket Status</h2>
                <div style={{ display: "flex", justifyContent: "center", marginBottom: 16, flex: 1, alignItems: "center" }}>
                  {chartData.byStatus.length > 0 ? (
                    <DonutChart data={chartData.byStatus} size={170} />
                  ) : (
                    <div style={{ color: "var(--text-muted)", fontSize: "0.88rem" }}>No ticket data</div>
                  )}
                </div>
                <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                  {chartData.byStatus.map((item, i) => {
                    const total = chartData.byStatus.reduce((s, d) => s + d.value, 0) || 1;
                    const pct = ((item.value / total) * 100).toFixed(1);
                    return (
                      <div key={i} style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                          <span style={{ width: 10, height: 10, borderRadius: 3, background: item.color, display: "inline-block" }} />
                          <span style={{ fontSize: "0.84rem", fontWeight: 500, color: "var(--text)" }}>{item.label}</span>
                        </div>
                        <span style={{ fontSize: "0.84rem", fontWeight: 700, color: "var(--text-heading)" }}>{pct}%</span>
                      </div>
                    );
                  })}
                </div>
              </div>
            </div>

            {/* ── Charts Row 2: Category + Priority ── */}
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 18, marginBottom: 18 }}>
              <div className="upload-section" style={{ marginBottom: 0 }}>
                <h2 style={{ marginBottom: 14 }}>Tickets by Category</h2>
                {chartData.byCategory.length > 0 ? <BarChart data={chartData.byCategory} /> : (
                  <div className="empty-state" style={{ padding: "36px 20px" }}><p>No category data yet</p></div>
                )}
              </div>
              <div className="upload-section" style={{ marginBottom: 0 }}>
                <h2 style={{ marginBottom: 14 }}>Tickets by Priority</h2>
                {chartData.byPriority.length > 0 ? <BarChart data={chartData.byPriority} /> : (
                  <div className="empty-state" style={{ padding: "36px 20px" }}><p>No priority data yet</p></div>
                )}
              </div>
            </div>

            {/* ── Assigned Work ── */}
            <div className="upload-section" style={{ marginBottom: 24 }}>
              <h2>{profile?.role === "Admin" ? "Open Tickets Overview" : "My Assigned Work"}</h2>
              {myWork.length === 0 ? (
                <div className="empty-state" style={{ padding: "32px 20px" }}>
                  <p>{profile?.role === "Admin" ? "No open or unassigned tickets." : "No tickets assigned to you."}</p>
                </div>
              ) : (
                <div className="doc-grid">
                  {myWork.map(ticket => {
                    const color = statusColor[ticket.status] || "var(--text-muted)";
                    return (
                      <Link key={ticket.id} to={`/tickets/${ticket.id}`} className="doc-card" style={{ textDecoration: "none", color: "inherit" }}>
                        <div className="doc-card-header"><h3>{ticket.title}</h3></div>
                        <div className="doc-card-meta">
                          <span className="badge" style={{ background: `${color}15`, color, border: `1px solid ${color}30` }}>{ticket.status}</span>
                          <span className="badge">{ticket.priority}</span>
                          {ticket.category && <span className="badge">{ticket.category}</span>}
                          {!ticket.assigned_to && (
                            <span className="badge" style={{ background: "var(--warning-glow)", color: "var(--warning)", border: "1px solid rgba(217,119,6,0.2)" }}>Unassigned</span>
                          )}
                        </div>
                      </Link>
                    );
                  })}
                </div>
              )}
            </div>

            {/* ── Recent Activity ── */}
            <div className="upload-section">
              <h2>Recent Activity</h2>
              {recentLogs.length === 0 ? (
                <div className="empty-state" style={{ padding: "36px 20px" }}><p>No recent activity logged yet.</p></div>
              ) : (
                <div className="comments-list">
                  {recentLogs.map(log => (
                    <div key={log.id} className="doc-card" style={{ padding: "14px 18px" }}>
                      <p style={{ margin: 0, fontWeight: 600, color: "var(--text-heading)" }}>{log.details || log.action}</p>
                      <small style={{ color: "var(--text-muted)" }}>{log.action} · {log.entity_type} · {new Date(log.created_at).toLocaleString()} · {log.user?.full_name || "N/A"} ({log.user?.role || "N/A"})</small>
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
