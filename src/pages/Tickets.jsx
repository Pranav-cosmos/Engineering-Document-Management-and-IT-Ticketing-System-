import { useState, useEffect } from "react";
import { supabase } from "../lib/supabase";
import Sidebar from "../components/SideBar";


export default function Tickets() {
  const [ticketForm, setTicketForm] = useState({
    title: "",
    description: "",
    category: "",
    priority: "",
  });

  const handleChange = (e) => {
    setTicketForm({
      ...ticketForm,
      [e.target.name]: e.target.value,
    });
  };

  const [tickets, setTickets] = useState([]);

  const fetchTickets = async () => {
    const { data, error } = await supabase
      .from("tickets")
      .select("*")
      .order("created_at", { ascending: false });

    if (error) {
      console.error(error);
      return;
    }

    setTickets(data);
  };

  useEffect(() => {
    fetchTickets();
  }, []);

  const handleSubmit = async (e) => {
    e.preventDefault();

    const {
      data: { user },
    } = await supabase.auth.getUser();

    const { error } = await supabase
      .from("tickets")
      .insert([
        {
          title: ticketForm.title,
          description: ticketForm.description,
          category: ticketForm.category,
          priority: ticketForm.priority,
          status: "Open",
          created_by: user.id,
        },
      ]);

    if (error) {
      alert(error.message);
      return;
    }

    alert("Ticket created successfully");

    setTicketForm({
      title: "",
      description: "",
      category: "",
      priority: "",
    });

    await fetchTickets();

  };
  return (
    <div className="layout">
      <Sidebar />
      <div className="content">
        <div className="page-header">
          <h1>Tickets</h1>
          <p>Create and manage your IT support tickets</p>
        </div>

        <div className="upload-section">
          <h2>🎫 Create New Ticket</h2>

          <form className="upload-form" onSubmit={handleSubmit}>
            <div className="input-group">
              <label htmlFor="ticket-title">Title</label>
              <input id="ticket-title" className="input"
                type="text"
                name="title"
                placeholder="Ticket Title"
                value={ticketForm.title}
                onChange={handleChange}
                required
              />
            </div>

            <div className="input-group">
              <label htmlFor="ticket-desc">Description</label>
              <textarea id="ticket-desc" className="input"
                name="description"
                placeholder="Describe the issue"
                value={ticketForm.description}
                onChange={handleChange}
                required
              />
            </div>

            <div className="input-group">
              <label htmlFor="ticket-category">Category</label>
              <select id="ticket-category" className="input"
                name="category"
                value={ticketForm.category}
                onChange={handleChange}
                required
              >
                <option value="">Select Category</option>
                <option value="Hardware">Hardware</option>
                <option value="Software">Software</option>
                <option value="Network">Network</option>
              </select>
            </div>

            <div className="input-group">
              <label htmlFor="ticket-priority">Priority</label>
              <select id="ticket-priority" className="input"
                name="priority"
                value={ticketForm.priority}
                onChange={handleChange}
                required
              >
                <option value="">Select Priority</option>
                <option value="Low">Low</option>
                <option value="Medium">Medium</option>
                <option value="High">High</option>
              </select>
            </div>

            <div className="upload-actions">
              <button type="button" className="btn btn-ghost" onClick={() => setTicketForm({ title: "", description: "", category: "", priority: "" })}>
                Clear
              </button>
              <button type="submit" className="btn btn-primary">
                🎫 Create Ticket
              </button>
            </div>
          </form>
        </div>
        <div className="upload-section">
          <div className="input-group">
            <h2>My Tickets</h2>
            {tickets.length === 0 ? (
              <p>No tickets found.</p>
            ) : (
              tickets.map((t) => (
                <div key={t.id} className="doc-card">
                  <div className="doc-card-header">
                    <h3 >Title: {t.title}</h3>
                    <p>Description: {t.description}</p>
                  </div>
                  <p>Priority: {t.priority}</p>
                  <p>Category: {t.category}</p>
                  <p>Status: {t.status}</p>
                </div>
              ))
            )}
          </div>
        </div>
      </div>
    </div>

  );

}

