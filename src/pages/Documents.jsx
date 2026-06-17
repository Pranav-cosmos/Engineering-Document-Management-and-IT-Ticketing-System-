import { useEffect, useState, useRef } from "react";
import { supabase } from "../lib/supabase";
import Sidebar from "../components/Sidebar";
import { logAudit } from "../utils/audit";

// ── File type helpers ────────────────────────────────────────────────────────

/**
 * All supported MIME types / extensions grouped by viewer category.
 * "pdf"    → native <iframe> PDF viewer
 * "image"  → <img> tag
 * "video"  → <video> tag
 * "audio"  → <audio> tag
 * "text"   → fetch + <pre> render (txt, md, csv, json, xml, js, ts, py, etc.)
 * "office" → Microsoft Office via Office Online embed (docx, xlsx, pptx)
 * "none"   → unsupported – show download prompt
 */
const FILE_TYPES = {
  pdf: {
    extensions: [".pdf"],
    accept: ".pdf",
    icon: "📄",
    label: "PDF",
    viewer: "pdf",
    color: "#dc2626",
  },
  word: {
    extensions: [".doc", ".docx"],
    accept: ".doc,.docx",
    icon: "📝",
    label: "Word",
    viewer: "office",
    color: "#2563eb",
  },
  excel: {
    extensions: [".xls", ".xlsx", ".csv"],
    accept: ".xls,.xlsx,.csv",
    icon: "📊",
    label: "Spreadsheet",
    viewer: "text", // csv as text; xlsx as office
    color: "#059669",
  },
  ppt: {
    extensions: [".ppt", ".pptx"],
    accept: ".ppt,.pptx",
    icon: "📑",
    label: "Presentation",
    viewer: "office",
    color: "#d97706",
  },
  image: {
    extensions: [".png", ".jpg", ".jpeg", ".gif", ".bmp", ".webp", ".svg", ".ico"],
    accept: ".png,.jpg,.jpeg,.gif,.bmp,.webp,.svg,.ico",
    icon: "🖼️",
    label: "Image",
    viewer: "image",
    color: "#7c3aed",
  },
  video: {
    extensions: [".mp4", ".webm", ".ogg", ".mov", ".avi", ".mkv"],
    accept: ".mp4,.webm,.ogg,.mov,.avi,.mkv",
    icon: "🎬",
    label: "Video",
    viewer: "video",
    color: "#db2777",
  },
  audio: {
    extensions: [".mp3", ".wav", ".ogg", ".aac", ".flac", ".m4a"],
    accept: ".mp3,.wav,.ogg,.aac,.flac,.m4a",
    icon: "🎵",
    label: "Audio",
    viewer: "audio",
    color: "#0891b2",
  },
  text: {
    extensions: [".txt", ".md", ".markdown", ".log", ".json", ".xml", ".html", ".htm", ".css", ".js", ".ts", ".py", ".sh", ".yaml", ".yml", ".toml", ".ini", ".cfg", ".env"],
    accept: ".txt,.md,.markdown,.log,.json,.xml,.html,.htm,.css,.js,.ts,.py,.sh,.yaml,.yml,.toml,.ini,.cfg,.env",
    icon: "📃",
    label: "Text / Code",
    viewer: "text",
    color: "#374151",
  },
  zip: {
    extensions: [".zip", ".rar", ".7z", ".tar", ".gz"],
    accept: ".zip,.rar,.7z,.tar,.gz",
    icon: "🗜️",
    label: "Archive",
    viewer: "none",
    color: "#92400e",
  },
};

// All accepted extensions as one comma-separated string for the file input
const ALL_ACCEPT = Object.values(FILE_TYPES)
  .map((t) => t.accept)
  .join(",");

/** Return info about a file given its filename (stored path). */
function getFileTypeInfo(filename) {
  const lower = (filename || "").toLowerCase();
  for (const info of Object.values(FILE_TYPES)) {
    for (const ext of info.extensions) {
      if (lower.endsWith(ext)) return info;
    }
  }
  return { icon: "📁", label: "File", viewer: "none", color: "#64748b" };
}

/** Determine the viewer category for a given stored file_url/filename. */
function getViewer(filename) {
  // For .csv specifically, use text viewer (not office)
  const lower = (filename || "").toLowerCase();
  if (lower.endsWith(".csv")) return "text";
  if (lower.endsWith(".xls") || lower.endsWith(".xlsx")) return "office";
  return getFileTypeInfo(filename).viewer;
}

// ── Component ────────────────────────────────────────────────────────────────

function Documents() {
  // ── State ─────────────────────────────────────────────────────────────────
  const [documents, setDocuments] = useState([]);
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);
  const [profile, setProfile] = useState(null);
  const [toast, setToast] = useState(null);

  // Upload form
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [file, setFile] = useState(null);
  const [accessRole, setAccessRole] = useState("Engineer");
  const [dragover, setDragover] = useState(false);

  // Edit doc
  const [editingDoc, setEditingDoc] = useState(null);

  // New version
  const [versionDoc, setVersionDoc] = useState(null);
  const [versionFile, setVersionFile] = useState(null);

  // Version history
  const [historyDoc, setHistoryDoc] = useState(null);
  const [versions, setVersions] = useState([]);

  // Search & filter
  const [searchQuery, setSearchQuery] = useState("");
  const [filterRole, setFilterRole] = useState("");

  // ── In-page file viewer ───────────────────────────────────────────────────
  const [viewerOpen, setViewerOpen] = useState(false);
  const [viewerTitle, setViewerTitle] = useState("");
  const [viewerUrl, setViewerUrl] = useState(""); // public URL of the file
  const [viewerType, setViewerType] = useState("none"); // viewer category
  const [viewerFilename, setViewerFilename] = useState("");
  const [textContent, setTextContent] = useState(null); // text/code file contents
  const [textLoading, setTextLoading] = useState(false);
  const viewerRef = useRef(null);

  // ── Bootstrap ─────────────────────────────────────────────────────────────
  useEffect(() => { fetchProfile(); }, []);
  useEffect(() => { if (profile) fetchDocuments(); }, [profile]);

  // Close viewer on Escape
  useEffect(() => {
    function onKey(e) {
      if (e.key === "Escape") closeViewer();
    }
    if (viewerOpen) window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [viewerOpen]);

  // ── Helpers ───────────────────────────────────────────────────────────────
  function showToast(message, type = "success") {
    setToast({ message, type });
    setTimeout(() => setToast(null), 3500);
  }

  function closeViewer() {
    setViewerOpen(false);
    setTextContent(null);
    setViewerUrl("");
  }

  // ── Data fetchers ─────────────────────────────────────────────────────────
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

  async function fetchDocuments() {
    if (!profile) return;
    let query = supabase
      .from("documents")
      .select("*")
      .order("created_at", { ascending: false });

    if (profile.role !== "Admin") {
      query = query.eq("access_role", profile.role);
    }

    const { data, error } = await query;
    if (error) { console.error(error); return; }
    setDocuments(data || []);
    setLoading(false);
  }

  // ── Filter ────────────────────────────────────────────────────────────────
  let filteredDocs = [];
  for (let i = 0; i < documents.length; i++) {
    const doc = documents[i];
    const titleMatches = doc.title.toLowerCase().includes(searchQuery.toLowerCase());
    const descMatches = (doc.description || "").toLowerCase().includes(searchQuery.toLowerCase());
    const matchesSearch = !searchQuery || titleMatches || descMatches;
    const matchesRole = !filterRole || doc.access_role === filterRole;
    if (matchesSearch && matchesRole) filteredDocs.push(doc);
  }

  // ── Edit helpers ──────────────────────────────────────────────────────────
  function editMeta(doc) {
    setEditingDoc(doc);
    setTitle(doc.title);
    setDescription(doc.description || "");
  }

  async function updateDocument() {
    try {
      const { error } = await supabase
        .from("documents")
        .update({ title, description })
        .eq("id", editingDoc.id);

      if (error) throw error;

      const { data: { user } } = await supabase.auth.getUser();
      await logAudit(user.id, "EDIT", "DOCUMENT", editingDoc.id, `Edited document "${title}"`);

      showToast("Document updated");
      fetchDocuments();
      setEditingDoc(null);
    } catch (err) {
      console.error(err);
      showToast("Update failed", "error");
    }
  }

  // ── Upload ────────────────────────────────────────────────────────────────
  async function addDocument(e) {
    e.preventDefault();

    if (!file) {
      showToast("Please select a file", "error");
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

      const filePath = `${user.id}/${Date.now()}-${file.name}`;

      const { error: uploadError } = await supabase.storage
        .from("Documents")
        .upload(filePath, file);

      if (uploadError) {
        showToast(uploadError.message, "error");
        setUploading(false);
        return;
      }

      const { data: docData, error: insertError } = await supabase
        .from("documents")
        .insert([{
          title,
          description,
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

      await logAudit(user.id, "CREATE", "DOCUMENT", docData?.id, `Uploaded document "${title}"`);

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

  // ── Versioning ────────────────────────────────────────────────────────────
  async function uploadNewVersion() {
    if (!versionFile) {
      showToast("Select a file", "error");
      return;
    }

    try {
      const { data: { user } } = await supabase.auth.getUser();

      await supabase.from("document_versions").insert([{
        document_id: versionDoc.id,
        version_number: versionDoc.version,
        file_url: versionDoc.file_url,
        uploaded_by: versionDoc.uploaded_by,
      }]);

      const filePath = `${user.id}/${Date.now()}-${versionFile.name}`;
      const { error: uploadError } = await supabase.storage
        .from("Documents")
        .upload(filePath, versionFile);

      if (uploadError) throw uploadError;

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

  async function loadVersions(doc) {
    const { data, error } = await supabase
      .from("document_versions")
      .select("*")
      .eq("document_id", doc.id)
      .order("version_number", { ascending: false });

    if (error) { showToast(error.message, "error"); return; }

    setVersions(data || []);
    setHistoryDoc(doc);
  }

  async function restoreVersion(version) {
    if (!confirm(`Restore v${version.version_number}?`)) return;

    try {
      const { data: { user } } = await supabase.auth.getUser();

      await supabase.from("document_versions").insert([{
        document_id: historyDoc.id,
        version_number: historyDoc.version,
        file_url: historyDoc.file_url,
        uploaded_by: historyDoc.uploaded_by,
      }]);

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

  async function deleteVersion(version) {
    if (!confirm("Delete this version?")) return;

    await supabase.storage.from("Documents").remove([version.file_url]);

    const { error } = await supabase
      .from("document_versions")
      .delete()
      .eq("id", version.id);

    if (error) { showToast(error.message, "error"); return; }

    showToast("Version deleted");
    loadVersions(historyDoc);
  }

  // ── In-page viewer ────────────────────────────────────────────────────────
  async function openViewer(fileUrl, docTitle) {
    const { data } = supabase.storage.from("Documents").getPublicUrl(fileUrl);
    const publicUrl = data.publicUrl;
    const viewer = getViewer(fileUrl);

    setViewerTitle(docTitle);
    setViewerUrl(publicUrl);
    setViewerType(viewer);
    setViewerFilename(fileUrl);
    setTextContent(null);
    setViewerOpen(true);

    // For text-type files: fetch and display content
    if (viewer === "text") {
      setTextLoading(true);
      try {
        const resp = await fetch(publicUrl);
        const text = await resp.text();
        setTextContent(text);
      } catch {
        setTextContent("⚠️ Could not load file content.");
      }
      setTextLoading(false);
    }
  }

  // ── Download ──────────────────────────────────────────────────────────────
  async function downloadFile(fileUrl, docTitle) {
    const { data, error } = await supabase.storage.from("Documents").download(fileUrl);
    if (error) { showToast(error.message, "error"); return; }

    // Preserve original extension
    const originalFilename = fileUrl.split("/").pop(); // e.g. "123-report.pdf"
    const extMatch = originalFilename.match(/(\.[^.]+)$/);
    const ext = extMatch ? extMatch[1] : "";

    const url = URL.createObjectURL(data);
    const a = document.createElement("a");
    a.href = url;
    a.download = docTitle + ext;
    a.click();
    URL.revokeObjectURL(url);
  }

  // ── Delete ────────────────────────────────────────────────────────────────
  async function deleteDoc(doc) {
    if (!confirm("Delete this document?")) return;

    await supabase.storage.from("Documents").remove([doc.file_url]);

    const { error } = await supabase.from("documents").delete().eq("id", doc.id);
    if (error) { showToast(error.message, "error"); return; }

    const { data: { user } } = await supabase.auth.getUser();
    await logAudit(user.id, "DELETE", "DOCUMENT", doc.id, `Deleted document "${doc.title}"`);

    showToast("Document deleted");
    fetchDocuments();
  }

  // ── Render ────────────────────────────────────────────────────────────────
  return (
    <div className="layout">
      <Sidebar />
      <div className="content">

        {/* Page title */}
        <div className="page-header">
          <h1>Documents</h1>
          <p>Upload, view, and manage engineering documents of any type</p>
        </div>

        {/* ── Search & Filter ── */}
        <div className="upload-section">
          <h2>🔍 Search & Filter</h2>
          <div className="upload-form">
            <div className="input-group" style={{ gridColumn: "1 / -1" }}>
              <label>Search</label>
              <input
                className="input"
                placeholder="Search by title or description…"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
              />
            </div>
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

        {/* ── Upload New Document ── */}
        <div className="upload-section">
          <h2>📎 Upload New Document</h2>
          <form className="upload-form" onSubmit={addDocument}>

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

            {/* Accepted file types hint (plain text only) */}
            <div style={{ gridColumn: "1 / -1" }}>
              <p className="accepted-types-hint">
                Accepted: PDF · Word · Excel · PowerPoint · Images · Video · Audio · Text/Code · Archives
              </p>
            </div>

            {/* Drag & drop */}
            <div
              className={`file-drop ${dragover ? "dragover" : ""}`}
              onDragOver={(e) => { e.preventDefault(); setDragover(true); }}
              onDragLeave={() => setDragover(false)}
              onDrop={(e) => {
                e.preventDefault();
                setDragover(false);
                setFile(e.dataTransfer.files[0]);
              }}
            >
              <input
                type="file"
                accept={ALL_ACCEPT}
                onChange={(e) => setFile(e.target.files[0])}
              />
              <div className="drop-icon">
                {file ? getFileTypeInfo(file.name).icon : "📂"}
              </div>
              <div className="drop-text">
                <strong>Click to browse</strong> or drag & drop any file
              </div>
              <div className="drop-hint">
                PDF · Word · Excel · PowerPoint · Images · Video · Audio · Text · Archives
              </div>
              {file && (
                <div className="file-name">
                  {getFileTypeInfo(file.name).icon} {file.name}
                </div>
              )}
            </div>

            <div className="upload-actions">
              <button
                type="button"
                className="btn btn-ghost"
                onClick={() => { setTitle(""); setDescription(""); setFile(null); }}
              >
                Clear
              </button>
              <button type="submit" className="btn btn-primary" disabled={uploading}>
                {uploading ? "Uploading…" : "⬆ Upload"}
              </button>
            </div>
          </form>
        </div>

        {/* ── Upload New Version ── */}
        {versionDoc && (
          <div className="upload-section">
            <h2>Upload New Version — {versionDoc.title}</h2>
            <input
              type="file"
              accept={ALL_ACCEPT}
              onChange={(e) => setVersionFile(e.target.files[0])}
              style={{ marginBottom: 12 }}
            />
            <div className="upload-actions">
              <button className="btn btn-ghost" onClick={() => { setVersionDoc(null); setVersionFile(null); }}>
                Cancel
              </button>
              <button className="btn btn-primary" onClick={uploadNewVersion}>
                Upload
              </button>
            </div>
          </div>
        )}

        {/* ── Edit Document ── */}
        {editingDoc && (
          <div className="upload-section">
            <h2>✏ Edit Document</h2>
            <div className="upload-form">
              <div className="input-group">
                <label>Title</label>
                <input className="input" value={title} onChange={(e) => setTitle(e.target.value)} />
              </div>
              <div className="input-group">
                <label>Description</label>
                <textarea className="input" value={description} onChange={(e) => setDescription(e.target.value)} />
              </div>
              <div className="upload-actions">
                <button className="btn btn-ghost" onClick={() => setEditingDoc(null)}>Cancel</button>
                <button className="btn btn-primary" onClick={updateDocument}>Save</button>
              </div>
            </div>
          </div>
        )}

        {/* ── Version History ── */}
        {historyDoc && (
          <div className="upload-section">
            <h2>📜 Version History — {historyDoc.title}</h2>
            <p className="doc-card-body">Current version: v{historyDoc.version}</p>

            {versions.length === 0 && <p className="doc-card-body">No previous versions</p>}

            {versions.map((v) => (
              <div
                key={v.id}
                className="doc-card-meta"
                style={{ marginTop: 8, padding: "10px 0", borderBottom: "1px solid var(--border)" }}
              >
                <span className="badge">v{v.version_number}</span>
                <span>{new Date(v.created_at).toLocaleDateString()}</span>
                <button className="btn btn-ghost btn-sm" onClick={() => openViewer(v.file_url, historyDoc.title + " v" + v.version_number)}>
                  👁 View
                </button>
                <button className="btn btn-ghost btn-sm" onClick={() => downloadFile(v.file_url, historyDoc.title + "_v" + v.version_number)}>
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
              <button className="btn btn-ghost" onClick={() => setHistoryDoc(null)}>Close</button>
            </div>
          </div>
        )}

        {/* ── Document list ── */}
        {loading && (
          <div className="loading-screen">
            <div className="spinner" />
          </div>
        )}

        {!loading && filteredDocs.length === 0 && (
          <div className="empty-state">
            <div className="empty-icon">📂</div>
            <h3>{searchQuery || filterRole ? "No documents match your filters" : "No documents yet"}</h3>
            <p>{searchQuery || filterRole ? "Try adjusting your search or filters" : "Upload your first document above"}</p>
          </div>
        )}

        {!loading && filteredDocs.length > 0 && (
          <div className="doc-grid">
            {filteredDocs.map((doc) => {
              const ftInfo = getFileTypeInfo(doc.file_url);
              return (
                <div key={doc.id} className="doc-card">

                  {/* Card header */}
                  <div className="doc-card-header">
                    <div className="doc-file-icon">
                      {ftInfo.icon}
                    </div>
                    <h3>{doc.title}</h3>
                  </div>

                  {doc.description && (
                    <div className="doc-card-body">
                      <p>{doc.description}</p>
                    </div>
                  )}

                  <div className="doc-card-meta">
                    <span className="badge">v{doc.version}</span>
                    <span className="badge">{doc.access_role}</span>
                    <span className="badge badge-filetype">{ftInfo.label}</span>
                    <span className="doc-date">{new Date(doc.created_at).toLocaleDateString()}</span>
                  </div>

                  <div className="doc-card-actions">
                    <button className="btn btn-ghost btn-sm" onClick={() => openViewer(doc.file_url, doc.title)}>
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
                    <button className="btn btn-ghost btn-sm" onClick={() => setVersionDoc(doc)}>
                      + Version
                    </button>
                    <button className="btn btn-danger btn-sm" onClick={() => deleteDoc(doc)}>
                      Delete
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* ════════════════════════════════════════════════════
           IN-PAGE FILE VIEWER MODAL
          ════════════════════════════════════════════════════ */}
      {viewerOpen && (
        <div className="viewer-overlay" onClick={(e) => { if (e.target === e.currentTarget) closeViewer(); }}>
          <div className="viewer-modal" ref={viewerRef}>

            {/* Header */}
            <div className="viewer-header">
              <div className="viewer-title">
                <span style={{ fontSize: "1.3rem" }}>{getFileTypeInfo(viewerFilename).icon}</span>
                <span>{viewerTitle}</span>
                <span className="viewer-type-label">{getFileTypeInfo(viewerFilename).label}</span>
              </div>
              <div className="viewer-actions">
                <a
                  href={viewerUrl}
                  download
                  className="btn btn-ghost btn-sm"
                  target="_blank"
                  rel="noreferrer"
                >
                  ⬇ Download
                </a>
                <button className="btn btn-ghost btn-sm" onClick={closeViewer}>
                  ✕ Close
                </button>
              </div>
            </div>

            {/* Body */}
            <div className="viewer-body">

              {/* PDF */}
              {viewerType === "pdf" && (
                <iframe
                  src={viewerUrl}
                  title={viewerTitle}
                  className="viewer-iframe"
                  allowFullScreen
                />
              )}

              {/* Image */}
              {viewerType === "image" && (
                <div className="viewer-image-wrap">
                  <img src={viewerUrl} alt={viewerTitle} className="viewer-image" />
                </div>
              )}

              {/* Video */}
              {viewerType === "video" && (
                <div className="viewer-video-wrap">
                  <video controls className="viewer-video" src={viewerUrl}>
                    Your browser does not support the video tag.
                  </video>
                </div>
              )}

              {/* Audio */}
              {viewerType === "audio" && (
                <div className="viewer-audio-wrap">
                  <div className="viewer-audio-icon">🎵</div>
                  <p className="viewer-audio-name">{viewerTitle}</p>
                  <audio controls className="viewer-audio" src={viewerUrl}>
                    Your browser does not support the audio tag.
                  </audio>
                </div>
              )}

              {/* Text / Code / CSV */}
              {viewerType === "text" && (
                <div className="viewer-text-wrap">
                  {textLoading && (
                    <div className="viewer-loading">
                      <div className="spinner" />
                      <p>Loading file…</p>
                    </div>
                  )}
                  {!textLoading && textContent !== null && (
                    <pre className="viewer-pre">{textContent}</pre>
                  )}
                </div>
              )}

              {/* Office (Word/Excel/PPT) via Office Online */}
              {viewerType === "office" && (
                <iframe
                  src={`https://view.officeapps.live.com/op/embed.aspx?src=${encodeURIComponent(viewerUrl)}`}
                  title={viewerTitle}
                  className="viewer-iframe"
                  allowFullScreen
                />
              )}

              {/* Unsupported */}
              {viewerType === "none" && (
                <div className="viewer-unsupported">
                  <div style={{ fontSize: "3rem", marginBottom: 16 }}>
                    {getFileTypeInfo(viewerFilename).icon}
                  </div>
                  <h3>Preview not available</h3>
                  <p>This file type cannot be previewed in the browser.</p>
                  <a
                    href={viewerUrl}
                    download
                    className="btn btn-primary"
                    style={{ marginTop: 20, display: "inline-flex" }}
                  >
                    ⬇ Download File
                  </a>
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Toast */}
      {toast && (
        <div className={`toast toast-${toast.type}`}>{toast.message}</div>
      )}
    </div>
  );
}

export default Documents;