import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import Sidebar from "../components/Sidebar";
import { supabase } from "../lib/supabase";
import { logAudit } from "../utils/audit";

// ── Dropdown options ──────────────────────────────────────────────────────────
const categories = ["Hardware", "Software", "Access", "Network", "Email"];
const priorities = ["Low", "Medium", "High"];
const ticketStatuses = ["Open", "In Progress", "Resolved", "Closed"];
const requestStatuses = ["Pending", "Approved", "Rejected"];

// ── Default (empty) form values ───────────────────────────────────────────────
const emptyTicketForm = {
  title: "",
  description: "",
  category: "",
  priority: "Medium",
  root_cause: "",
  resolution: "",
};

const emptyRequestForm = {
  title: "",
  description: "",
  category: "",
  priority: "Medium",
  admin_id: "", // the receiver chosen by the requester
};

// ── Main Component ────────────────────────────────────────────────────────────
export default function Tickets() {
  // Which tab is open: "tickets" or "requests"
  const [activeTab, setActiveTab] = useState("tickets");

  // The currently logged-in user's profile
  const [profile, setProfile] = useState(null);

  // Toast notification (a small pop-up message)
  const [toast, setToast] = useState(null);

  // All users (used for the "Send To" dropdown in requests)
  const [allUsers, setAllUsers] = useState([]);

  // ── Ticket tab state ────────────────────────────────────────────────────────
  const [tickets, setTickets] = useState([]);          // list of all tickets
  const [ticketsLoading, setTicketsLoading] = useState(true);

  // Form for creating a new ticket
  const [ticketForm, setTicketForm] = useState(emptyTicketForm);

  // Search text typed by user
  const [ticketSearch, setTicketSearch] = useState("");

  // Filter by status dropdown
  const [ticketFilterStatus, setTicketFilterStatus] = useState("");

  // When editing a ticket, we store the ticket object here
  const [editingTicket, setEditingTicket] = useState(null);

  // Separate form fields for editing (so we don't mess up the create form)
  const [editTicketForm, setEditTicketForm] = useState({});

  // ── Request tab state ───────────────────────────────────────────────────────
  const [requests, setRequests] = useState([]);        // list of all requests
  const [requestsLoading, setRequestsLoading] = useState(true);

  // Form for submitting a new request
  const [requestForm, setRequestForm] = useState(emptyRequestForm);

  // Search text for requests
  const [requestSearch, setRequestSearch] = useState("");

  // Filter by status for requests
  const [requestFilterStatus, setRequestFilterStatus] = useState("");

  const [predictedCategory, setPredictedCategory] = useState("");

  // ── Helper: show a pop-up message ──────────────────────────────────────────
  function showToast(message, type = "success") {
    setToast({ message, type });
    // Hide it after 3 seconds
    setTimeout(() => setToast(null), 3000);
  }

  // ── Load data on first render ───────────────────────────────────────────────
  useEffect(() => {
    fetchProfile();
    fetchAllUsers();
    fetchTickets();
    fetchRequests();
  }, []);

  const predictCategory = async () => {
    console.log(ticketForm);

    const res = await fetch(
      "http://127.0.0.1:8000/predict-category",
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          title: ticketForm.title,
          description: ticketForm.description,
        }),
      }
    );

    const data = await res.json();

    console.log(data);

    setPredictedCategory(data.category);
  };

  // ── Fetch the current user's profile ───────────────────────────────────────
  async function fetchProfile() {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;
    const { data } = await supabase
      .from("profiles")
      .select("*")
      .eq("id", user.id)
      .single();
    setProfile(data);
  }

  // ── Fetch all users (for the receiver dropdown) ─────────────────────────────
  async function fetchAllUsers() {
    const { data } = await supabase
      .from("profiles")
      .select("id, full_name, role");
    setAllUsers(data || []);
  }

  // ── Fetch all tickets from the database ────────────────────────────────────
  async function fetchTickets() {
    setTicketsLoading(true);
    const { data, error } = await supabase
      .from("tickets")
      .select("*")
      .order("created_at", { ascending: false });

    if (error) {
      showToast(error.message, "error");
      setTickets([]);
    } else {
      setTickets(data || []);
    }
    setTicketsLoading(false);
  }

  // ── Fetch all requests from the database ───────────────────────────────────
  async function fetchRequests() {
    setRequestsLoading(true);
    const { data, error } = await supabase
      .from("ticket_requests")
      .select("*")
      .order("created_at", { ascending: false });

    if (error) {
      showToast(error.message, "error");
      setRequests([]);
    } else {
      setRequests(data || []);
    }
    setRequestsLoading(false);
  }

  // ── Create a new ticket ─────────────────────────────────────────────────────
  async function createTicket(event) {
    event.preventDefault(); // stop page from refreshing

    const { data: { user } } = await supabase.auth.getUser();

    const payload = {
      title: ticketForm.title,
      description: ticketForm.description || null,
      category: ticketForm.category || null,
      priority: ticketForm.priority,
      root_cause: ticketForm.root_cause || null,
      resolution: ticketForm.resolution || null,
      status: "Open",
      created_by: user.id,
    };

    const { data, error } = await supabase
      .from("tickets")
      .insert([payload])
      .select()
      .single();

    if (error) {
      showToast(error.message, "error");
      return;
    }

    await logAudit(user.id, "CREATE", "TICKET", data.id, `Created ticket "${ticketForm.title}"`);
    showToast("Ticket created");
    setTicketForm(emptyTicketForm); // clear the form
    fetchTickets();                  // refresh the list
  }

  // ── Save edits to an existing ticket ───────────────────────────────────────
  async function saveTicketEdit(event) {
    event.preventDefault();

    const payload = {
      title: editTicketForm.title,
      description: editTicketForm.description || null,
      category: editTicketForm.category || null,
      priority: editTicketForm.priority,
      root_cause: editTicketForm.root_cause || null,
      resolution: editTicketForm.resolution || null,
    };

    const { error } = await supabase
      .from("tickets")
      .update(payload)
      .eq("id", editingTicket.id);

    if (error) {
      showToast(error.message, "error");
      return;
    }

    const { data: { user } } = await supabase.auth.getUser();
    await logAudit(user.id, "EDIT", "TICKET", editingTicket.id, `Edited ticket "${editTicketForm.title}"`);
    showToast("Ticket updated");
    setEditingTicket(null); // close the edit form
    fetchTickets();
  }

  // ── Change the status of a ticket (Open / In Progress / etc.) ──────────────
  async function updateTicketStatus(ticket, newStatus) {
    const { error } = await supabase
      .from("tickets")
      .update({ status: newStatus })
      .eq("id", ticket.id);

    if (error) {
      showToast(error.message, "error");
      return;
    }

    const { data: { user } } = await supabase.auth.getUser();
    await logAudit(user.id, "STATUS_CHANGE", "TICKET", ticket.id, `Changed "${ticket.title}" to ${newStatus}`);
    showToast("Status updated");
    fetchTickets();
  }

  // ── Delete a ticket ─────────────────────────────────────────────────────────
  async function deleteTicket(ticket) {
    if (!confirm(`Delete "${ticket.title}"?`)) return; // ask user to confirm

    // Delete related comments and audit logs first (foreign key cleanup)
    await supabase.from("ticket_comments").delete().eq("ticket_id", ticket.id);
    await supabase.from("audit_logs").delete().eq("entity_id", ticket.id);

    const { error } = await supabase.from("tickets").delete().eq("id", ticket.id);
    if (error) {
      showToast(error.message, "error");
      return;
    }

    showToast("Ticket deleted");
    fetchTickets();
  }

  // ── Open the edit form and pre-fill it with the ticket's current values ─────
  function startEditTicket(ticket) {
    setEditingTicket(ticket);
    setEditTicketForm({
      title: ticket.title || "",
      description: ticket.description || "",
      category: ticket.category || "",
      priority: ticket.priority || "Medium",
      root_cause: ticket.root_cause || "",
      resolution: ticket.resolution || "",
    });
  }

  // ── Submit a new request ────────────────────────────────────────────────────
  async function createRequest(event) {
    event.preventDefault();

    const { data: { user } } = await supabase.auth.getUser();

    if (!requestForm.admin_id) {
      showToast("Please select a receiver for this request", "error");
      return;
    }

    const payload = {
      title: requestForm.title,
      description: requestForm.description || null,
      category: requestForm.category || null,
      priority: requestForm.priority || null,
      status: "Pending",
      requested_by: user.id,
      admin_id: requestForm.admin_id,
    };

    const { error } = await supabase.from("ticket_requests").insert([payload]);
    if (error) {
      showToast(error.message, "error");
      return;
    }

    showToast("Request submitted");
    setRequestForm(emptyRequestForm);
    fetchRequests();
  }

  // ── Approve or Reject a request ─────────────────────────────────────────────
  async function approveOrRejectRequest(request, status) {
    // Only the person who was chosen as receiver can approve or reject
    if (profile?.id !== request.admin_id) {
      showToast("Only the assigned receiver can approve or reject this request.", "error");
      return;
    }

    const { error } = await supabase
      .from("ticket_requests")
      .update({ status: status, reviewed_by: profile.id })
      .eq("id", request.id);

    if (error) {
      showToast(error.message, "error");
      return;
    }

    showToast(`Request ${status.toLowerCase()}`);
    fetchRequests();
  }

  // ── Delete a request ────────────────────────────────────────────────────────
  async function deleteRequest(request) {
    if (!confirm(`Delete "${request.title}"?`)) return;

    const { error } = await supabase
      .from("ticket_requests")
      .delete()
      .eq("id", request.id);

    if (error) {
      showToast(error.message, "error");
      return;
    }

    showToast("Request deleted");
    fetchRequests();
  }

  // ── Get the name of a user by their ID ──────────────────────────────────────
  function getUserName(userId) {
    const user = allUsers.find((u) => u.id === userId);
    return user ? `${user.full_name} (${user.role})` : "Unknown";
  }

  // ── Filter tickets based on search text and status dropdown ─────────────────
  // This is simple: we just loop through all tickets and check each one
  let filteredTickets = [];
  for (let i = 0; i < tickets.length; i++) {
    const ticket = tickets[i];
    const searchLower = ticketSearch.toLowerCase();

    // Check if the ticket matches the search text
    const titleMatches = ticket.title.toLowerCase().includes(searchLower);
    const descriptionMatches = (ticket.description || "").toLowerCase().includes(searchLower);
    const categoryMatches = (ticket.category || "").toLowerCase().includes(searchLower);
    const matchesSearch = !ticketSearch || titleMatches || descriptionMatches || categoryMatches;

    // Check if the ticket matches the selected status filter
    const matchesStatus = !ticketFilterStatus || ticket.status === ticketFilterStatus;

    if (matchesSearch && matchesStatus) {
      filteredTickets.push(ticket);
    }
  }

  // ── Filter requests based on search text and status dropdown ────────────────
  let filteredRequests = [];
  for (let i = 0; i < requests.length; i++) {
    const req = requests[i];
    const searchLower = requestSearch.toLowerCase();

    const titleMatches = req.title.toLowerCase().includes(searchLower);
    const descriptionMatches = (req.description || "").toLowerCase().includes(searchLower);
    const matchesSearch = !requestSearch || titleMatches || descriptionMatches;

    const matchesStatus = !requestFilterStatus || req.status === requestFilterStatus;

    if (matchesSearch && matchesStatus) {
      filteredRequests.push(req);
    }
  }

  // Requests where the current user is the receiver AND status is still Pending
  let myPendingApprovals = [];
  for (let i = 0; i < filteredRequests.length; i++) {
    const req = filteredRequests[i];
    if (req.admin_id === profile?.id && req.status === "Pending") {
      myPendingApprovals.push(req);
    }
  }

  // ── JSX (what gets rendered on the screen) ──────────────────────────────────
  return (
    <div className="layout">
      <Sidebar />
      <div className="content">

        {/* Page title */}
        <div className="page-header">
          <h1>Tickets</h1>
          <p>Track issues, root causes, resolutions, and service requests.</p>
        </div>

        {/* Tab buttons */}
        <div className="tab-nav">
          <button
            className={`tab-btn ${activeTab === "tickets" ? "tab-active" : ""}`}
            onClick={() => setActiveTab("tickets")}
          >
            Tickets <span className="tab-count">{tickets.length}</span>
          </button>
          <button
            className={`tab-btn ${activeTab === "requests" ? "tab-active" : ""}`}
            onClick={() => setActiveTab("requests")}
          >
            Requests <span className="tab-count">{requests.length}</span>
            {myPendingApprovals.length > 0 && (
              <span className="tab-count" style={{ background: "var(--danger)", color: "#fff", marginLeft: 4 }}>
                {myPendingApprovals.length} pending
              </span>
            )}
          </button>
        </div>

        {/* ══════════════════════════════════════════════════════════════════════
            TICKETS TAB
        ══════════════════════════════════════════════════════════════════════ */}
        {activeTab === "tickets" && (
          <>
            {/* ── Create / Edit Ticket Form ── */}
            <div className="upload-section">
              <h2>{editingTicket ? `Editing: ${editingTicket.title}` : "Create Ticket"}</h2>
              <form
                className="upload-form"
                onSubmit={editingTicket ? saveTicketEdit : createTicket}
              >
                {/* Title */}
                <div className="input-group">
                  <label>Title *</label>
                  <input
                    className="input"
                    value={editingTicket ? editTicketForm.title : ticketForm.title}
                    onChange={(e) => {
                      if (editingTicket) {
                        setEditTicketForm({ ...editTicketForm, title: e.target.value });
                      } else {
                        setTicketForm({ ...ticketForm, title: e.target.value });
                      }
                    }}
                    required
                  />
                </div>

                {/* Category */}
                <div className="input-group">
                  <label>Category *</label>
                  <select
                    className="input"
                    value={editingTicket ? editTicketForm.category : ticketForm.category}
                    onChange={(e) => {
                      if (editingTicket) {
                        setEditTicketForm({ ...editTicketForm, category: e.target.value });
                      } else {
                        setTicketForm({ ...ticketForm, category: e.target.value });
                      }
                    }}
                    required
                  >
                    <option value="">Select</option>
                    {categories.map((c) => (
                      <option key={c} value={c}>{c}</option>
                    ))}
                  </select>
                </div>

                {/* Priority */}
                <div className="input-group">
                  <label>Priority</label>
                  <select
                    className="input"
                    value={editingTicket ? editTicketForm.priority : ticketForm.priority}
                    onChange={(e) => {
                      if (editingTicket) {
                        setEditTicketForm({ ...editTicketForm, priority: e.target.value });
                      } else {
                        setTicketForm({ ...ticketForm, priority: e.target.value });
                      }
                    }}
                  >
                    {priorities.map((p) => (
                      <option key={p} value={p}>{p}</option>
                    ))}
                  </select>
                </div>

                {/* Description */}
                <div className="input-group" style={{ gridColumn: "1 / -1" }}>
                  <label>Description</label>
                  <textarea
                    className="input"
                    rows={3}
                    value={editingTicket ? editTicketForm.description : ticketForm.description}
                    onChange={(e) => {
                      if (editingTicket) {
                        setEditTicketForm({ ...editTicketForm, description: e.target.value });
                      } else {
                        setTicketForm({ ...ticketForm, description: e.target.value });
                      }
                    }}
                  />
                </div>

                {/* Root Cause */}
                <div className="input-group">
                  <label>Root Cause</label>
                  <textarea
                    className="input"
                    rows={2}
                    placeholder="What caused this issue?"
                    value={editingTicket ? editTicketForm.root_cause : ticketForm.root_cause}
                    onChange={(e) => {
                      if (editingTicket) {
                        setEditTicketForm({ ...editTicketForm, root_cause: e.target.value });
                      } else {
                        setTicketForm({ ...ticketForm, root_cause: e.target.value });
                      }
                    }}
                  />
                </div>

                {/* Resolution */}
                <div className="input-group">
                  <label>Resolution</label>
                  <textarea
                    className="input"
                    rows={2}
                    placeholder="How can it be resolved?"
                    value={editingTicket ? editTicketForm.resolution : ticketForm.resolution}
                    onChange={(e) => {
                      if (editingTicket) {
                        setEditTicketForm({ ...editTicketForm, resolution: e.target.value });
                      } else {
                        setTicketForm({ ...ticketForm, resolution: e.target.value });
                      }
                    }}
                  />
                </div>

                {/* Form action buttons */}
                <div className="upload-actions">
                  {editingTicket ? (
                    <>
                      <button className="btn btn-ghost" type="button" onClick={() => setEditingTicket(null)}>
                        Cancel
                      </button>
                      <button className="btn btn-primary" type="submit">
                        Save Changes
                      </button>
                    </>
                  ) : (
                    <>
                      <button className="btn btn-ghost" type="button" onClick={() => setTicketForm(emptyTicketForm)}>
                        Clear
                      </button>
                      <button className="btn btn-primary" type="submit">
                        Create Ticket
                      </button>
                      <button className="btn btn-primary"
                        type="button"
                        onClick={predictCategory}

                      >
                        <p>
                          Suggested Category: {predictedCategory}
                        </p>
                      </button>
                    </>
                  )}
                </div>
              </form>
            </div>

            {/* ── Search & Filter ── */}
            <div className="upload-section">
              <h2>Search & Filter</h2>
              <div className="upload-form">
                <div className="input-group">
                  <label>Search</label>
                  <input
                    className="input"
                    value={ticketSearch}
                    onChange={(e) => setTicketSearch(e.target.value)}
                    placeholder="Search by title, description, category"
                  />
                </div>
                <div className="input-group">
                  <label>Status</label>
                  <select
                    className="input"
                    value={ticketFilterStatus}
                    onChange={(e) => setTicketFilterStatus(e.target.value)}
                  >
                    <option value="">All</option>
                    {ticketStatuses.map((s) => (
                      <option key={s} value={s}>{s}</option>
                    ))}
                  </select>
                </div>
                <div className="upload-actions">
                  <button
                    className="btn btn-ghost"
                    type="button"
                    onClick={() => {
                      setTicketSearch("");
                      setTicketFilterStatus("");
                    }}
                  >
                    Clear
                  </button>
                </div>
              </div>
            </div>

            {/* ── Ticket List ── */}
            <div className="upload-section">
              <h2>Tickets ({filteredTickets.length})</h2>

              {/* Show spinner while loading */}
              {ticketsLoading && (
                <div className="loading-screen" style={{ minHeight: 180 }}>
                  <div className="spinner" />
                </div>
              )}

              {/* Show message if no tickets match */}
              {!ticketsLoading && filteredTickets.length === 0 && (
                <div className="empty-state">
                  <h3>No tickets found</h3>
                  <p>Create a ticket or adjust filters.</p>
                </div>
              )}

              {/* Render ticket cards */}
              {!ticketsLoading && filteredTickets.length > 0 && (
                <div className="doc-grid">
                  {filteredTickets.map((ticket) => (
                    <div key={ticket.id} className="doc-card">

                      {/* Clicking the title/description takes you to the detail page */}
                      <Link to={`/tickets/${ticket.id}`} style={{ textDecoration: "none", color: "inherit" }}>
                        <div className="doc-card-header">
                          <h3>{ticket.title}</h3>
                        </div>
                        {ticket.description && (
                          <div className="doc-card-body">
                            <p>{ticket.description}</p>
                          </div>
                        )}
                        <div className="doc-card-meta">
                          {ticket.priority && <span className="badge">{ticket.priority}</span>}
                          {ticket.category && <span className="badge">{ticket.category}</span>}
                          <span className="badge">{ticket.status}</span>
                        </div>
                        {(ticket.root_cause || ticket.resolution) && (
                          <div className="doc-card-meta" style={{ marginTop: 6, fontSize: 12, color: "var(--text-muted)" }}>
                            {ticket.root_cause && <span>Root cause: {ticket.root_cause}</span>}
                          </div>
                        )}
                      </Link>

                      {/* Status changer dropdown */}
                      <div className="doc-card-meta" style={{ marginTop: 8, gap: 6 }}>
                        <label style={{ fontSize: 12, color: "var(--text-muted)", whiteSpace: "nowrap" }}>Status:</label>
                        <select
                          className="input"
                          style={{ padding: "2px 6px", fontSize: 13 }}
                          value={ticket.status}
                          onChange={(e) => updateTicketStatus(ticket, e.target.value)}
                        >
                          {ticketStatuses.map((s) => (
                            <option key={s} value={s}>{s}</option>
                          ))}
                        </select>
                      </div>

                      {/* Card action buttons */}
                      <div className="doc-card-actions">
                        <Link to={`/tickets/${ticket.id}`} className="btn btn-ghost btn-sm">View</Link>
                        <button className="btn btn-ghost btn-sm" onClick={() => startEditTicket(ticket)}>Edit</button>
                        <button className="btn btn-danger btn-sm" onClick={() => deleteTicket(ticket)}>Delete</button>
                      </div>

                    </div>
                  ))}
                </div>
              )}
            </div>
          </>
        )}

        {/* ══════════════════════════════════════════════════════════════════════
            REQUESTS TAB
        ══════════════════════════════════════════════════════════════════════ */}
        {activeTab === "requests" && (
          <>
            {/* ── Submit a Request Form ── */}
            <div className="upload-section">
              <h2>Submit a Request</h2>
              <p style={{ color: "var(--text-muted)", marginBottom: 16, fontSize: 14 }}>
                Choose a receiver — only that person will be able to approve or reject your request.
              </p>
              <form className="upload-form" onSubmit={createRequest}>

                {/* Title */}
                <div className="input-group">
                  <label>Title *</label>
                  <input
                    className="input"
                    value={requestForm.title}
                    onChange={(e) => setRequestForm({ ...requestForm, title: e.target.value })}
                    required
                  />
                </div>

                {/* Send To (Receiver) */}
                <div className="input-group">
                  <label>Send To (Receiver) *</label>
                  <select
                    className="input"
                    value={requestForm.admin_id}
                    onChange={(e) => setRequestForm({ ...requestForm, admin_id: e.target.value })}
                    required
                  >
                    <option value="">Select receiver</option>
                    {allUsers.map((u) => (
                      <option key={u.id} value={u.id}>{u.full_name} ({u.role})</option>
                    ))}
                  </select>
                </div>

                {/* Category */}
                <div className="input-group">
                  <label>Category</label>
                  <select
                    className="input"
                    value={requestForm.category}
                    onChange={(e) => setRequestForm({ ...requestForm, category: e.target.value })}
                  >
                    <option value="">Select (optional)</option>
                    {categories.map((c) => (
                      <option key={c} value={c}>{c}</option>
                    ))}
                  </select>
                </div>

                {/* Priority */}
                <div className="input-group">
                  <label>Priority</label>
                  <select
                    className="input"
                    value={requestForm.priority}
                    onChange={(e) => setRequestForm({ ...requestForm, priority: e.target.value })}
                  >
                    {priorities.map((p) => (
                      <option key={p} value={p}>{p}</option>
                    ))}
                  </select>
                </div>

                {/* Description */}
                <div className="input-group" style={{ gridColumn: "1 / -1" }}>
                  <label>Description</label>
                  <textarea
                    className="input"
                    rows={3}
                    value={requestForm.description}
                    onChange={(e) => setRequestForm({ ...requestForm, description: e.target.value })}
                  />
                </div>

                <div className="upload-actions">
                  <button className="btn btn-ghost" type="button" onClick={() => setRequestForm(emptyRequestForm)}>
                    Clear
                  </button>
                  <button className="btn btn-primary" type="submit">
                    Submit Request
                  </button>
                </div>
              </form>
            </div>

            {/* ── Search & Filter ── */}
            <div className="upload-section">
              <h2>Search & Filter</h2>
              <div className="upload-form">
                <div className="input-group">
                  <label>Search</label>
                  <input
                    className="input"
                    value={requestSearch}
                    onChange={(e) => setRequestSearch(e.target.value)}
                    placeholder="Search requests"
                  />
                </div>
                <div className="input-group">
                  <label>Status</label>
                  <select
                    className="input"
                    value={requestFilterStatus}
                    onChange={(e) => setRequestFilterStatus(e.target.value)}
                  >
                    <option value="">All</option>
                    {requestStatuses.map((s) => (
                      <option key={s} value={s}>{s}</option>
                    ))}
                  </select>
                </div>
                <div className="upload-actions">
                  <button
                    className="btn btn-ghost"
                    type="button"
                    onClick={() => {
                      setRequestSearch("");
                      setRequestFilterStatus("");
                    }}
                  >
                    Clear
                  </button>
                </div>
              </div>
            </div>

            {/* ── Request List ── */}
            <div className="upload-section">
              <h2>Requests ({filteredRequests.length})</h2>

              {/* Show spinner while loading */}
              {requestsLoading && (
                <div className="loading-screen" style={{ minHeight: 180 }}>
                  <div className="spinner" />
                </div>
              )}

              {/* Show message if no requests match */}
              {!requestsLoading && filteredRequests.length === 0 && (
                <div className="empty-state">
                  <h3>No requests found</h3>
                  <p>Submit a request or adjust filters.</p>
                </div>
              )}

              {/* Render request cards */}
              {!requestsLoading && filteredRequests.length > 0 && (
                <div className="doc-grid">
                  {filteredRequests.map((req) => {
                    // Is the current user the designated receiver for this request?
                    const isReceiver = profile?.id === req.admin_id;

                    // Can the current user approve/reject? Only if receiver AND still pending
                    const canAct = isReceiver && req.status === "Pending";

                    return (
                      <div key={req.id} className="doc-card">
                        <div className="doc-card-header">
                          <h3>{req.title}</h3>
                        </div>

                        {req.description && (
                          <div className="doc-card-body">
                            <p>{req.description}</p>
                          </div>
                        )}

                        <div className="doc-card-meta">
                          {req.priority && <span className="badge">{req.priority}</span>}
                          {req.category && <span className="badge">{req.category}</span>}
                          <span className="badge">{req.status}</span>
                        </div>

                        <div className="doc-card-meta" style={{ marginTop: 6, fontSize: 13, color: "var(--text-muted)" }}>
                          <span>Receiver: {req.admin_id ? getUserName(req.admin_id) : "Not set"}</span>
                        </div>

                        {/* Approve / Reject buttons — only shown to the receiver if status is Pending */}
                        {canAct && (
                          <div className="doc-card-actions">
                            <button
                              className="btn btn-primary btn-sm"
                              onClick={() => approveOrRejectRequest(req, "Approved")}
                            >
                              Approve
                            </button>
                            <button
                              className="btn btn-danger btn-sm"
                              onClick={() => approveOrRejectRequest(req, "Rejected")}
                            >
                              Reject
                            </button>
                          </div>
                        )}

                        {/* Message shown to receiver after they already reviewed */}
                        {!canAct && isReceiver && req.status !== "Pending" && (
                          <div style={{ fontSize: 12, color: "var(--text-muted)", padding: "4px 0" }}>
                            You reviewed this request ({req.status})
                          </div>
                        )}

                        {/* Delete button */}
                        <div className="doc-card-actions">
                          <button className="btn btn-danger btn-sm" onClick={() => deleteRequest(req)}>Delete</button>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          </>
        )}

      </div>

      {/* Toast notification pop-up */}
      {toast && (
        <div className={`toast toast-${toast.type}`}>{toast.message}</div>
      )}
    </div>
  );
}
