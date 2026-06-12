import { useEffect, useState } from "react";
import Sidebar from "../components/Sidebar";
import { supabase } from "../lib/supabase";

export default function AuditLogs() {
  const [logs, setLogs] = useState([]);
  const [loading, setLoading] = useState(true);
  const [filterAction, setFilterAction] = useState("");
  const [filterEntity, setFilterEntity] = useState("");

  async function fetchLogs() {
    setLoading(true);
    let query = supabase.from("audit_logs").select(`
      *,
      user:user_id (
        full_name,
        role
      )
    `).order("created_at", { ascending: false }).limit(25);

    if (filterAction) query = query.eq("action", filterAction);
    if (filterEntity) query = query.eq("entity_type", filterEntity);

    const { data, error } = await query;
    if (error) {
      console.error("Audit logs fetch error:", error);
      setLogs([]);
    } else {
      setLogs(data || []);
    }
    setLoading(false);
  }

  useEffect(() => {
    fetchLogs();
  }, [filterAction, filterEntity]);

  return (
    <div className="layout">
      <Sidebar />
      <div className="content">
        <div className="page-header">
          <h1>Audit Logs</h1>
          <p>Track user, document, ticket, problem, and knowledge-base actions</p>
        </div>

        <div className="upload-section">
          <h2>Filters</h2>
          <div className="upload-form">
            <div className="input-group">
              <label>Action</label>
              <select className="input" value={filterAction} onChange={(e) => setFilterAction(e.target.value)}>
                <option value="">All Actions</option>
                {["CREATE", "EDIT", "DELETE", "UPLOAD", "STATUS_CHANGE", "ASSIGN", "LINK_PROBLEM", "APPROVE", "REJECT"].map((action) => (
                  <option key={action} value={action}>{action.replace(/_/g, " ")}</option>
                ))}
              </select>
            </div>
            <div className="input-group">
              <label>Entity Type</label>
              <select className="input" value={filterEntity} onChange={(e) => setFilterEntity(e.target.value)}>
                <option value="">All Entities</option>
                {["USER", "DOCUMENT", "DOCUMENT_VERSION", "TICKET", "PROBLEM", "KNOWLEDGE_ARTICLE", "NOTIFICATION", "ANALYTICS"].map((entity) => (
                  <option key={entity} value={entity}>{entity.replace(/_/g, " ")}</option>
                ))}
              </select>
            </div>
            <div className="upload-actions">
              <button className="btn btn-ghost" onClick={() => { setFilterAction(""); setFilterEntity(""); }}>Clear Filters</button>
              <button className="btn btn-primary" onClick={fetchLogs}>Refresh</button>
            </div>
          </div>
        </div>

        <div className="upload-section">
          <h2>Activity Log ({logs.length})</h2>
          {loading ? (
            <div className="loading-screen" style={{ minHeight: 200 }}><div className="spinner" /></div>
          ) : logs.length === 0 ? (
            <div className="empty-state"><h3>No logs found</h3><p>No audit entries match the current filters</p></div>
          ) : (
            <div className="doc-grid">
              {logs.map((log) => (
                <div key={log.id} className="doc-card">
                  <div className="doc-card-header"><h3>{log.action?.replace(/_/g, " ")}</h3></div>
                  <div className="doc-card-body"><p>{log.details || "No details provided"}</p></div>
                  <div className="doc-card-meta">
                    <span className="badge">{log.entity_type}</span>
                    <span>{new Date(log.created_at).toLocaleString()}</span>
                    <span>By {log.user?.full_name || "N/A"} ({log.user?.role || "N/A"}) </span>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
