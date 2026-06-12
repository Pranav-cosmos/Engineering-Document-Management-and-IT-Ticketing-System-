import { useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import Sidebar from "../components/Sidebar";
import { supabase } from "../lib/supabase";
import { logAudit } from "../utils/audit";

const statuses = ["Open", "In Progress", "Resolved", "Closed"];

export default function TicketDetails() {
  const { id } = useParams();
  const navigate = useNavigate();
  const [ticket, setTicket] = useState(null);
  const [users, setUsers] = useState([]);
  const [comments, setComments] = useState([]);
  const [commentText, setCommentText] = useState("");
  const [editing, setEditing] = useState(false);
  const [editForm, setEditForm] = useState({});
  const [toast, setToast] = useState(null);

  function showToast(message, type = "success") {
    setToast({ message, type });
    setTimeout(() => setToast(null), 3000);
  }

  async function fetchTicket() {
    const { data, error } = await supabase.from("tickets").select("*").eq("id", id).single();
    if (error) { showToast(error.message, "error"); return; }
    setTicket(data);
    setEditForm({
      title: data.title || "",
      description: data.description || "",
      category: data.category || "",
      priority: data.priority || "Medium",
      root_cause: data.root_cause || "",
      resolution: data.resolution || "",
    });
  }

  async function fetchUsers() {
    const { data } = await supabase.from("profiles").select("id, full_name, role");
    setUsers(data || []);
  }

  async function fetchComments() {
    const { data } = await supabase
      .from("ticket_comments")
      .select("*, profiles(full_name)")
      .eq("ticket_id", id)
      .order("created_at", { ascending: true });
    setComments(data || []);
  }

  useEffect(() => {
    fetchTicket();
    fetchUsers();
    fetchComments();
  }, [id]);

  async function handleComment() {
    if (!commentText.trim()) return;
    const { data: { user } } = await supabase.auth.getUser();
    const { error } = await supabase.from("ticket_comments").insert([{ ticket_id: id, user_id: user.id, message: commentText }]);
    if (error) { showToast(error.message, "error"); return; }
    await logAudit(user.id, "CREATE", "TICKET", id, `Commented on ticket "${ticket.title}"`);
    setCommentText("");
    showToast("Comment added");
    fetchComments();
  }

  async function handleAssign(event) {
    const assignedTo = event.target.value || null;
    const assignedUser = users.find((u) => u.id === assignedTo);
    const { error } = await supabase.from("tickets").update({ assigned_to: assignedTo }).eq("id", id);
    if (error) { showToast(error.message, "error"); return; }
    const { data: { user } } = await supabase.auth.getUser();
    await logAudit(user.id, "ASSIGN", "TICKET", id, `Assigned "${ticket.title}" to ${assignedUser?.full_name || "Unassigned"}`);
    setTicket({ ...ticket, assigned_to: assignedTo });
    showToast("Assignment updated");
  }

  async function handleStatusChange(event) {
    const status = event.target.value;
    const { error } = await supabase.from("tickets").update({ status }).eq("id", id);
    if (error) { showToast(error.message, "error"); return; }
    const { data: { user } } = await supabase.auth.getUser();
    await logAudit(user.id, "STATUS_CHANGE", "TICKET", id, `Changed status of "${ticket.title}" to ${status}`);
    setTicket({ ...ticket, status });
    showToast("Status updated");
  }

  async function handleEdit() {
    const payload = {
      title: editForm.title,
      description: editForm.description || null,
      category: editForm.category || null,
      priority: editForm.priority,
      root_cause: editForm.root_cause || null,
      resolution: editForm.resolution || null,
    };
    const { error } = await supabase.from("tickets").update(payload).eq("id", id);
    if (error) { showToast(error.message, "error"); return; }
    const { data: { user } } = await supabase.auth.getUser();
    await logAudit(user.id, "EDIT", "TICKET", id, `Edited ticket "${editForm.title}"`);
    setTicket({ ...ticket, ...payload });
    setEditing(false);
    showToast("Ticket updated");
  }

  async function handleDelete() {
    if (!confirm("Delete this ticket permanently?")) return;
    await supabase.from("ticket_comments").delete().eq("ticket_id", id);
    await supabase.from("audit_logs").delete().eq("entity_id", id);
    const { error } = await supabase.from("tickets").delete().eq("id", id);
    if (error) { showToast(error.message, "error"); return; }
    showToast("Ticket deleted");
    setTimeout(() => navigate("/tickets"), 500);
  }

  if (!ticket) {
    return <div className="layout"><Sidebar /><div className="content"><div className="loading-screen"><div className="spinner" /></div></div></div>;
  }

  const assignedUser = users.find((u) => u.id === ticket.assigned_to);

  return (
    <div className="layout">
      <Sidebar />
      <div className="content">
        <div className="page-header">
          <h1>{ticket.title}</h1>
          <p>Ticket details and comments</p>
        </div>

        <div className="upload-section">
          <div className="detail-header">
            <h2>Ticket Information</h2>
            <div style={{ display: "flex", gap: 8 }}>
              <button className="btn btn-ghost btn-sm" onClick={() => setEditing(!editing)}>Edit</button>
              <button className="btn btn-danger btn-sm" onClick={handleDelete}>Delete</button>
            </div>
          </div>

          {editing ? (
            <div className="upload-form">
              <div className="input-group">
                <label>Title</label>
                <input className="input" value={editForm.title} onChange={(e) => setEditForm({ ...editForm, title: e.target.value })} />
              </div>
              <div className="input-group">
                <label>Category</label>
                <input className="input" value={editForm.category} onChange={(e) => setEditForm({ ...editForm, category: e.target.value })} />
              </div>
              <div className="input-group">
                <label>Priority</label>
                <select className="input" value={editForm.priority} onChange={(e) => setEditForm({ ...editForm, priority: e.target.value })}>
                  <option value="Low">Low</option>
                  <option value="Medium">Medium</option>
                  <option value="High">High</option>
                </select>
              </div>
              <div className="input-group" style={{ gridColumn: "1 / -1" }}>
                <label>Description</label>
                <textarea className="input" value={editForm.description} onChange={(e) => setEditForm({ ...editForm, description: e.target.value })} rows={3} />
              </div>
              <div className="input-group">
                <label>Root Cause</label>
                <textarea className="input" value={editForm.root_cause} onChange={(e) => setEditForm({ ...editForm, root_cause: e.target.value })} rows={2} placeholder="What caused this issue?" />
              </div>
              <div className="input-group">
                <label>Resolution</label>
                <textarea className="input" value={editForm.resolution} onChange={(e) => setEditForm({ ...editForm, resolution: e.target.value })} rows={2} placeholder="How was it resolved?" />
              </div>
              <div className="upload-actions">
                <button className="btn btn-ghost" onClick={() => setEditing(false)}>Cancel</button>
                <button className="btn btn-primary" onClick={handleEdit}>Save Changes</button>
              </div>
            </div>
          ) : (
            <div className="detail-grid">
              <div className="detail-item" style={{ gridColumn: "1 / -1" }}>
                <span className="detail-label">Description</span>
                <p className="detail-value">{ticket.description || "No description"}</p>
              </div>
              <div className="detail-item"><span className="detail-label">Priority</span><span className="badge">{ticket.priority}</span></div>
              <div className="detail-item"><span className="detail-label">Category</span><span className="badge">{ticket.category || "-"}</span></div>
              <div className="detail-item">
                <span className="detail-label">Assigned To</span>
                <p className="detail-value">{assignedUser ? `${assignedUser.full_name} (${assignedUser.role})` : "Unassigned"}</p>
              </div>
              <div className="detail-item">
                <span className="detail-label">Created</span>
                <p className="detail-value">{ticket.created_at ? new Date(ticket.created_at).toLocaleString() : "-"}</p>
              </div>
              {ticket.root_cause && (
                <div className="detail-item" style={{ gridColumn: "1 / -1" }}>
                  <span className="detail-label">Root Cause</span>
                  <p className="detail-value">{ticket.root_cause}</p>
                </div>
              )}
              {ticket.resolution && (
                <div className="detail-item" style={{ gridColumn: "1 / -1" }}>
                  <span className="detail-label">Resolution</span>
                  <p className="detail-value">{ticket.resolution}</p>
                </div>
              )}
            </div>
          )}
        </div>

        <div className="upload-section">
          <h2>Status & Assignment</h2>
          <div className="upload-form">
            <div className="input-group">
              <label>Status</label>
              <select className="input" value={ticket.status} onChange={handleStatusChange}>
                {statuses.map((s) => <option key={s} value={s}>{s}</option>)}
              </select>
            </div>
            <div className="input-group">
              <label>Assign To</label>
              <select className="input" value={ticket.assigned_to || ""} onChange={handleAssign}>
                <option value="">Unassigned</option>
                {users.map((u) => <option key={u.id} value={u.id}>{u.full_name} ({u.role})</option>)}
              </select>
            </div>
          </div>
        </div>

        <div className="upload-section">
          <h2>Comments ({comments.length})</h2>
          <div className="input-group" style={{ marginBottom: 16 }}>
            <label>Add Comment</label>
            <textarea className="input" value={commentText} onChange={(e) => setCommentText(e.target.value)} rows={3} />
          </div>
          <button className="btn btn-primary" onClick={handleComment}>Post Comment</button>
          <div className="comments-list" style={{ marginTop: 20 }}>
            {comments.map((comment) => (
              <div key={comment.id} className="doc-card" style={{ padding: "16px 20px" }}>
                <strong style={{ color: "var(--accent)" }}>{comment.profiles?.full_name || "User"}</strong>
                <p>{comment.message}</p>
                <small style={{ color: "var(--text-muted)" }}>{new Date(comment.created_at).toLocaleString()}</small>
              </div>
            ))}
          </div>
        </div>
      </div>
      {toast && <div className={`toast toast-${toast.type}`}>{toast.message}</div>}
    </div>
  );
}
