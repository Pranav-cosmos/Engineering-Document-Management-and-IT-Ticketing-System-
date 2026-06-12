import { useEffect, useState } from "react";
import { supabase } from "../lib/supabase";
import Sidebar from "../components/Sidebar";
import { logAudit } from "../utils/audit";

function Documents() {
  // ── All state variables ────────────────────────────────────────────────────

  // List of documents fetched from the database
  const [documents, setDocuments] = useState([]);

  // True while we are fetching documents for the first time
  const [loading, setLoading] = useState(true);

  // True while a file is being uploaded
  const [uploading, setUploading] = useState(false);

  // The currently logged-in user's profile
  const [profile, setProfile] = useState(null);

  // Toast notification (small pop-up message)
  const [toast, setToast] = useState(null);

  // ── Upload form fields ─────────────────────────────────────────────────────
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [file, setFile] = useState(null);
  const [accessRole, setAccessRole] = useState("Engineer");

  // True when user is dragging a file over the drop area
  const [dragover, setDragover] = useState(false);

  // ── Edit document section ──────────────────────────────────────────────────
  // Holds the document currently being edited (null = not editing)
  const [editingDoc, setEditingDoc] = useState(null);

  // ── Upload new version section ─────────────────────────────────────────────
  // Holds the document we want to upload a new version for (null = not open)
  const [versionDoc, setVersionDoc] = useState(null);
  const [versionFile, setVersionFile] = useState(null);

  // ── Version history section ────────────────────────────────────────────────
  // Holds the document whose history we are viewing (null = not open)
  const [historyDoc, setHistoryDoc] = useState(null);
  // List of older versions for that document
  const [versions, setVersions] = useState([]);

  // ── Search & Filter ────────────────────────────────────────────────────────
  const [searchQuery, setSearchQuery] = useState("");
  const [filterRole, setFilterRole] = useState("");

  // ── Load profile on first render, then load documents once profile is ready ─
  useEffect(() => {
    fetchProfile();
  }, []);

  useEffect(() => {
    if (profile) {
      fetchDocuments();
    }
  }, [profile]);

  // ── Helper: show a pop-up message ─────────────────────────────────────────
  function showToast(message, type = "success") {
    setToast({ message, type });
    // Automatically hide it after 3 seconds
    setTimeout(() => setToast(null), 3000);
  }

  // ── Fetch the current user's profile ──────────────────────────────────────
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

  // ── Fetch documents from the database ────────────────────────────────────
  // Admin sees all documents; other roles only see their own role's documents
  async function fetchDocuments() {
    if (!profile) return;

    let query = supabase
      .from("documents")
      .select("*")
      .order("created_at", { ascending: false });

    // Non-admin users only see documents for their role
    if (profile.role !== "Admin") {
      query = query.eq("access_role", profile.role);
    }

    const { data, error } = await query;
    if (error) {
      console.error(error);
      return;
    }
    setDocuments(data || []);
    setLoading(false);
  }

  // ── Filter documents based on search text and role dropdown ───────────────
  // Simple loop — no fancy hooks needed
  let filteredDocs = [];
  for (let i = 0; i < documents.length; i++) {
    const doc = documents[i];

    // Check if the document title or description matches the search text
    const titleMatches = doc.title.toLowerCase().includes(searchQuery.toLowerCase());
    const descMatches = (doc.description || "").toLowerCase().includes(searchQuery.toLowerCase());
    const matchesSearch = !searchQuery || titleMatches || descMatches;

    // Check if the document matches the selected role filter
    const matchesRole = !filterRole || doc.access_role === filterRole;

    if (matchesSearch && matchesRole) {
      filteredDocs.push(doc);
    }
  }

  // ── Open the Edit form and pre-fill with the document's current values ────
  function editMeta(doc) {
    setEditingDoc(doc);
    setTitle(doc.title);
    setDescription(doc.description || "");
  }

  // ── Save edited title/description to the database ─────────────────────────
  async function updateDocument() {
    try {
      const { error } = await supabase
        .from("documents")
        .update({ title: title, description: description })
        .eq("id", editingDoc.id);

      if (error) throw error;

      const { data: { user } } = await supabase.auth.getUser();
      await logAudit(user.id, "EDIT", "DOCUMENT", editingDoc.id, `Edited document "${title}"`);

      showToast("Document updated");
      fetchDocuments();
      setEditingDoc(null); // close the edit section
    } catch (err) {
      console.error(err);
      showToast("Update failed", "error");
    }
  }

  // ── Upload a new document ─────────────────────────────────────────────────
  async function addDocument(e) {
    e.preventDefault(); // stop page from refreshing

    if (!file) {
      showToast("Please select a PDF file", "error");
      return;
    }

    setUploading(true);

    try {
      const { data: { user } } = await supabase.auth.getUser();

      if (!user) {
        showToast("Not authenticated", "error");
        setUploading(false);
        return;
      }

      // Create a unique file path using the user's ID and the current timestamp
      const filePath = `${user.id}/${Date.now()}-${file.name}`;

      // Upload the PDF file to Supabase Storage
      const { error: uploadError } = await supabase.storage
        .from("Documents")
        .upload(filePath, file);

      if (uploadError) {
        showToast(uploadError.message, "error");
        setUploading(false);
        return;
      }

      // Save the document record to the database
      const { data: docData, error: insertError } = await supabase
        .from("documents")
        .insert([{
          title: title,
          description: description,
          file_url: filePath,
          uploaded_by: user.id,
          version: 1,
          access_role: accessRole,
        }])
        .select()
        .single();

      if (insertError) {
        showToast(insertError.message, "error");
        setUploading(false);
        return;
      }

      // Log the upload action
      await logAudit(user.id, "CREATE", "DOCUMENT", docData?.id, `Uploaded document "${title}"`);

      // Clear the upload form
      setTitle("");
      setDescription("");
      setFile(null);

      showToast("Document uploaded successfully!");
      fetchDocuments();
    } catch (err) {
      console.error(err);
      showToast("Upload failed", "error");
    }

    setUploading(false);
  }

  // ── Upload a new version of an existing document ──────────────────────────
  async function uploadNewVersion() {
    if (!versionFile) {
      showToast("Select a PDF", "error");
      return;
    }

    try {
      const { data: { user } } = await supabase.auth.getUser();

      // Save the current file as an older version first
      await supabase.from("document_versions").insert([{
        document_id: versionDoc.id,
        version_number: versionDoc.version,
        file_url: versionDoc.file_url,
        uploaded_by: versionDoc.uploaded_by,
      }]);

      // Upload the new file
      const filePath = `${user.id}/${Date.now()}-${versionFile.name}`;
      const { error: uploadError } = await supabase.storage
        .from("Documents")
        .upload(filePath, versionFile);

      if (uploadError) throw uploadError;

      // Update the document record with the new file and bump the version number
      const { error } = await supabase
        .from("documents")
        .update({ file_url: filePath, version: versionDoc.version + 1 })
        .eq("id", versionDoc.id);

      if (error) throw error;

      await logAudit(
        user.id,
        "UPLOAD",
        "DOCUMENT_VERSION",
        versionDoc.id,
        `Uploaded v${versionDoc.version + 1} of "${versionDoc.title}"`
      );

      showToast("Version uploaded");
      fetchDocuments();
      setVersionDoc(null);
      setVersionFile(null);
    } catch (err) {
      console.error(err);
      showToast("Version upload failed", "error");
    }
  }

  // ── Load version history for a document ──────────────────────────────────
  async function loadVersions(doc) {
    const { data, error } = await supabase
      .from("document_versions")
      .select("*")
      .eq("document_id", doc.id)
      .order("version_number", { ascending: false });

    if (error) {
      showToast(error.message, "error");
      return;
    }

    setVersions(data || []);
    setHistoryDoc(doc);
  }

  // ── Restore an older version ──────────────────────────────────────────────
  async function restoreVersion(version) {
    if (!confirm(`Restore v${version.version_number}?`)) return;

    try {
      const { data: { user } } = await supabase.auth.getUser();

      // Save the current version before overwriting it
      await supabase.from("document_versions").insert([{
        document_id: historyDoc.id,
        version_number: historyDoc.version,
        file_url: historyDoc.file_url,
        uploaded_by: historyDoc.uploaded_by,
      }]);

      // Point the document to the old file and bump the version number
      const { error } = await supabase
        .from("documents")
        .update({ file_url: version.file_url, version: historyDoc.version + 1 })
        .eq("id", historyDoc.id);

      if (error) throw error;

      await logAudit(
        user.id,
        "STATUS_CHANGE",
        "DOCUMENT_VERSION",
        historyDoc.id,
        `Restored v${version.version_number} of "${historyDoc.title}" as v${historyDoc.version + 1}`
      );

      showToast("Version restored");
      fetchDocuments();
      loadVersions(historyDoc);
    } catch (err) {
      console.error(err);
      showToast("Restore failed", "error");
    }
  }

  // ── Delete an older version from history ─────────────────────────────────
  async function deleteVersion(version) {
    if (!confirm("Delete this version?")) return;

    // Remove the file from storage
    await supabase.storage.from("Documents").remove([version.file_url]);

    // Remove the version record from the database
    const { error } = await supabase
      .from("document_versions")
      .delete()
      .eq("id", version.id);

    if (error) {
      showToast(error.message, "error");
      return;
    }

    showToast("Version deleted");
    loadVersions(historyDoc);
  }

  // ── Open a document file in a new browser tab ────────────────────────────
  function viewFile(fileUrl) {
    const { data } = supabase.storage.from("Documents").getPublicUrl(fileUrl);
    window.open(data.publicUrl, "_blank");
  }

  // ── Download a document file ─────────────────────────────────────────────
  async function downloadFile(fileUrl, docTitle) {
    const { data, error } = await supabase.storage.from("Documents").download(fileUrl);
    if (error) {
      showToast(error.message, "error");
      return;
    }
    // Create a temporary link and click it to trigger the download
    const url = URL.createObjectURL(data);
    const a = document.createElement("a");
    a.href = url;
    a.download = docTitle + ".pdf";
    a.click();
    URL.revokeObjectURL(url);
  }

  // ── Delete a document (and its file) ─────────────────────────────────────
  async function deleteDoc(doc) {
    if (!confirm("Delete this document?")) return;

    // Remove the file from Supabase Storage
    await supabase.storage.from("Documents").remove([doc.file_url]);

    // Remove the document record from the database
    const { error } = await supabase.from("documents").delete().eq("id", doc.id);
    if (error) {
      showToast(error.message, "error");
      return;
    }

    const { data: { user } } = await supabase.auth.getUser();
    await logAudit(user.id, "DELETE", "DOCUMENT", doc.id, `Deleted document "${doc.title}"`);

    showToast("Document deleted");
    fetchDocuments();
  }

  // ── JSX (what gets rendered on the screen) ────────────────────────────────
  return (
    <div className="layout">
      <Sidebar />
      <div className="content">

        {/* Page title */}
        <div className="page-header">
          <h1>Documents</h1>
          <p>Upload, view, and manage your engineering documents</p>
        </div>

        {/* ── Search & Filter section ── */}
        <div className="upload-section">
          <h2>🔍 Search & Filter</h2>
          <div className="upload-form">
            {/* Search by title or description */}
            <div className="input-group" style={{ gridColumn: "1 / -1" }}>
              <label>Search</label>
              <input
                className="input"
                placeholder="Search by title or description..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
              />
            </div>

            {/* Admins can filter by role */}
            {profile?.role === "Admin" && (
              <div className="input-group">
                <label>Filter by Role</label>
                <select
                  className="input"
                  value={filterRole}
                  onChange={(e) => setFilterRole(e.target.value)}
                >
                  <option value="">All Roles</option>
                  <option value="Engineer">Engineer</option>
                  <option value="IT">IT</option>
                </select>
              </div>
            )}
          </div>
        </div>

        {/* ── Upload New Document section ── */}
        <div className="upload-section">
          <h2>📎 Upload New Document</h2>
          <form className="upload-form" onSubmit={addDocument}>

            {/* Title input */}
            <div className="input-group">
              <label htmlFor="doc-title">Title</label>
              <input
                id="doc-title"
                className="input"
                placeholder="Title"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                required
              />
            </div>

            {/* Description input */}
            <div className="input-group">
              <label htmlFor="doc-desc">Description</label>
              <input
                id="doc-desc"
                className="input"
                placeholder="Brief description"
                value={description}
                onChange={(e) => setDescription(e.target.value)}
              />
            </div>

            {/* Access Role dropdown */}
            <div className="input-group">
              <label htmlFor="access-role">Access Role</label>
              <select
                id="access-role"
                className="input"
                value={accessRole}
                onChange={(e) => setAccessRole(e.target.value)}
                required
              >
                <option value="Engineer">Engineer</option>
                <option value="IT">IT</option>
              </select>
            </div>

            {/* Drag & drop / click to pick a PDF file */}
            <div
              className={`file-drop ${dragover ? "dragover" : ""}`}
              onDragOver={(e) => {
                e.preventDefault();
                setDragover(true);
              }}
              onDragLeave={() => setDragover(false)}
              onDrop={(e) => {
                e.preventDefault();
                setDragover(false);
                setFile(e.dataTransfer.files[0]);
              }}
            >
              <input
                type="file"
                accept=".pdf"
                onChange={(e) => setFile(e.target.files[0])}
              />
              <div className="drop-icon">📄</div>
              <div className="drop-text">
                <strong>Click to browse</strong> or drag & drop a PDF
              </div>
              {file && <div className="file-name">✓ {file.name}</div>}
            </div>

            {/* Buttons */}
            <div className="upload-actions">
              <button
                type="button"
                className="btn btn-ghost"
                onClick={() => {
                  setTitle("");
                  setDescription("");
                  setFile(null);
                }}
              >
                Clear
              </button>
              <button type="submit" className="btn btn-primary" disabled={uploading}>
                {uploading ? "Uploading…" : "⬆ Upload"}
              </button>
            </div>
          </form>
        </div>

        {/* ── Upload New Version section (only shown when a doc is selected) ── */}
        {versionDoc && (
          <div className="upload-section">
            <h2>Upload New Version — {versionDoc.title}</h2>
            <input
              type="file"
              accept=".pdf"
              onChange={(e) => setVersionFile(e.target.files[0])}
            />
            <div className="upload-actions">
              <button
                className="btn btn-ghost"
                onClick={() => {
                  setVersionDoc(null);
                  setVersionFile(null);
                }}
              >
                Cancel
              </button>
              <button className="btn btn-primary" onClick={uploadNewVersion}>
                Upload
              </button>
            </div>
          </div>
        )}

        {/* ── Edit Document section (only shown when editing a doc) ── */}
        {editingDoc && (
          <div className="upload-section">
            <h2>✏ Edit Document</h2>
            <div className="upload-form">
              <div className="input-group">
                <label>Title</label>
                <input
                  className="input"
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                />
              </div>
              <div className="input-group">
                <label>Description</label>
                <textarea
                  className="input"
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                />
              </div>
              <div className="upload-actions">
                <button className="btn btn-ghost" onClick={() => setEditingDoc(null)}>
                  Cancel
                </button>
                <button className="btn btn-primary" onClick={updateDocument}>
                  Save
                </button>
              </div>
            </div>
          </div>
        )}

        {/* ── Version History section (only shown when a doc's history is open) ── */}
        {historyDoc && (
          <div className="upload-section">
            <h2>📜 Version History — {historyDoc.title}</h2>
            <p className="doc-card-body">Current version: v{historyDoc.version}</p>

            {/* No older versions */}
            {versions.length === 0 && (
              <p className="doc-card-body">No previous versions</p>
            )}

            {/* List of older versions */}
            {versions.length > 0 && versions.map((v) => (
              <div
                key={v.id}
                className="doc-card-meta"
                style={{ marginTop: 8, padding: "10px 0", borderBottom: "1px solid var(--border)" }}
              >
                <span className="badge">v{v.version_number}</span>
                <span>{new Date(v.created_at).toLocaleDateString()}</span>
                <button className="btn btn-ghost btn-sm" onClick={() => viewFile(v.file_url)}>
                  👁 View
                </button>
                <button
                  className="btn btn-ghost btn-sm"
                  onClick={() => downloadFile(v.file_url, historyDoc.title + "_v" + v.version_number)}
                >
                  ⬇ Download
                </button>
                <button className="btn btn-primary btn-sm" onClick={() => restoreVersion(v)}>
                  ♻ Restore
                </button>
                <button className="btn btn-danger btn-sm" onClick={() => deleteVersion(v)}>
                  🗑 Delete
                </button>
              </div>
            ))}

            <div className="upload-actions" style={{ marginTop: 16 }}>
              <button className="btn btn-ghost" onClick={() => setHistoryDoc(null)}>
                Close
              </button>
            </div>
          </div>
        )}

        {/* ── Document List ── */}

        {/* Show spinner while loading */}
        {loading && (
          <div className="loading-screen">
            <div className="spinner" />
          </div>
        )}

        {/* Show empty state if no documents match */}
        {!loading && filteredDocs.length === 0 && (
          <div className="empty-state">
            <div className="empty-icon">📂</div>
            <h3>
              {searchQuery || filterRole ? "No documents match your filters" : "No documents yet"}
            </h3>
            <p>
              {searchQuery || filterRole
                ? "Try adjusting your search or filters"
                : "Upload your first engineering document above"}
            </p>
          </div>
        )}

        {/* Render document cards */}
        {!loading && filteredDocs.length > 0 && (
          <div className="doc-grid">
            {filteredDocs.map((doc) => (
              <div key={doc.id} className="doc-card">

                {/* Document title */}
                <div className="doc-card-header">
                  <h3>{doc.title}</h3>
                </div>

                {/* Description (only shown if it exists) */}
                {doc.description && (
                  <div className="doc-card-body">
                    <p>{doc.description}</p>
                  </div>
                )}

                {/* Badges and quick actions */}
                <div className="doc-card-meta">
                  <span className="badge">v{doc.version}</span>
                  <span className="badge">{doc.access_role}</span>
                  <button className="btn btn-ghost btn-sm" onClick={() => setVersionDoc(doc)}>
                    + Version
                  </button>
                  <span>{new Date(doc.created_at).toLocaleDateString()}</span>
                </div>

                {/* Action buttons */}
                <div className="doc-card-actions">
                  <button className="btn btn-ghost btn-sm" onClick={() => viewFile(doc.file_url)}>
                    👁 View
                  </button>
                  <button className="btn btn-ghost btn-sm" onClick={() => downloadFile(doc.file_url, doc.title)}>
                    ⬇ Download
                  </button>
                  <button className="btn btn-ghost btn-sm" onClick={() => editMeta(doc)}>
                    ✏ Edit
                  </button>
                  <button className="btn btn-ghost btn-sm" onClick={() => loadVersions(doc)}>
                    📜 History
                  </button>
                  <button className="btn btn-danger btn-sm" onClick={() => deleteDoc(doc)}>
                    🗑 Delete
                  </button>
                </div>

              </div>
            ))}
          </div>
        )}

      </div>

      {/* Toast notification pop-up */}
      {toast && (
        <div className={`toast toast-${toast.type}`}>{toast.message}</div>
      )}
    </div>
  );
}

export default Documents;