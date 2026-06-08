import { useEffect, useState } from "react";
import { supabase } from "../lib/supabase";
import Sidebar from "../components/SideBar";

function Documents() {
  const [documents, setDocuments] = useState([]);
  const [loading, setLoading] = useState(true);
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [file, setFile] = useState(null);
  const [uploading, setUploading] = useState(false);
  const [dragover, setDragover] = useState(false);
  const [toast, setToast] = useState(null);
  const [editingDoc, setEditingDoc] = useState(null);
  const [versionDoc, setVersionDoc] = useState(null);
  const [versionFile, setVersionFile] = useState(null);
  const [historyDoc, setHistoryDoc] = useState(null);
  const [versions, setVersions] = useState([]);

  const editMeta = (doc) => {
    setEditingDoc(doc);
    setTitle(doc.title);
    setDescription(doc.description);
  };

  useEffect(() => { fetchDocuments(); }, []);

  function showToast(message, type = "success") {
    setToast({ message, type });
    setTimeout(() => setToast(null), 3000);
  }

  async function fetchDocuments() {
    const { data, error } = await supabase
      .from("documents")
      .select("*")
      .order("created_at", { ascending: false });

    if (error) {
      console.error(error);
      showToast(error.message, "error");
    } else {
      setDocuments(data || []);
    }
    setLoading(false);
  }

  const updateDocument = async () => {
    try {
      const { error } = await supabase
        .from("documents")
        .update({
          title,
          description,
        })
        .eq("id", editingDoc.id);

      if (error) throw error;

      showToast("Document updated", "success");

      fetchDocuments();

      setEditingDoc(null);
    } catch (err) {
      console.error(err);
      showToast("Update failed", "error");
    }
  };

  async function addDocument(e) {
    e.preventDefault();
    if (!file) return showToast("Please select a PDF file", "error");

    setUploading(true);

    try {
      const { data: { user } } = await supabase.auth.getUser();

      if (!user) {
        showToast("Not authenticated", "error");
        setUploading(false);
        return;
      }

      // ── RLS FIX: upload under user's own folder ──
      const filePath = `${user.id}/${Date.now()}-${file.name}`;

      const { error: uploadError } = await supabase.storage
        .from("Documents")
        .upload(filePath, file);

      if (uploadError) {
        console.error(uploadError);
        showToast(uploadError.message, "error");
        setUploading(false);
        return;
      }

      const { error: insertError } = await supabase
        .from("documents")
        .insert([{ title, description, file_url: filePath, uploaded_by: user.id, version: 1 }]);

      if (insertError) {
        console.error(insertError);
        showToast(insertError.message, "error");
        setUploading(false);
        return;
      }

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

  async function uploadNewVersion() {
    if (!versionFile) {
      showToast("Select a PDF", "error");
      return;
    }

    try {
      const { data: { user } } = await supabase.auth.getUser();

      // Save old version to document_versions table
      await supabase
        .from("document_versions")
        .insert([
          {
            document_id: versionDoc.id,
            version_number: versionDoc.version,
            file_url: versionDoc.file_url,
            uploaded_by: versionDoc.uploaded_by
          }
        ]);

      // Upload new file
      const filePath = `${user.id}/${Date.now()}-${versionFile.name}`;

      const { error: uploadError } = await supabase.storage
        .from("Documents")
        .upload(filePath, versionFile);

      if (uploadError) throw uploadError;

      // Update main document row with new file and bumped version
      const { error } = await supabase
        .from("documents")
        .update({
          file_url: filePath,
          version: versionDoc.version + 1
        })
        .eq("id", versionDoc.id);

      if (error) throw error;

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

    if (error) {
      showToast(error.message, "error");
      return;
    }

    setVersions(data);
    setHistoryDoc(doc);
  }

  async function deleteVersion(version) {
    if (!confirm("Delete this version?")) return;

    // Delete file from storage
    await supabase.storage.from("Documents").remove([version.file_url]);

    // Delete row from document_versions
    const { error } = await supabase
      .from("document_versions")
      .delete()
      .eq("id", version.id);

    if (error) {
      showToast(error.message, "error");
      return;
    }

    showToast("Version deleted");

    // Reload the version list
    loadVersions(historyDoc);
  }

  function viewFile(fileUrl) {
    const { data } = supabase.storage.from("Documents").getPublicUrl(fileUrl);
    window.open(data.publicUrl, "_blank");
  }

  async function downloadFile(fileUrl, docTitle) {
    const { data, error } = await supabase.storage.from("Documents").download(fileUrl);
    if (error) { showToast(error.message, "error"); return; }
    const url = URL.createObjectURL(data);
    const a = document.createElement("a");
    a.href = url;
    a.download = docTitle + ".pdf";
    a.click();
    URL.revokeObjectURL(url);
  }

  async function deleteDoc(doc) {
    if (!confirm("Delete this document?")) return;

    await supabase.storage.from("Documents").remove([doc.file_url]);
    const { error } = await supabase.from("documents").delete().eq("id", doc.id);

    if (error) { showToast(error.message, "error"); return; }
    showToast("Document deleted");
    fetchDocuments();
  }

  return (
    <div className="layout">
      <Sidebar />

      <div className="content">
        <div className="page-header">
          <h1>Documents</h1>
          <p>Upload, view, and manage your engineering documents</p>
        </div>

        {/* Upload Section */}
        <div className="upload-section">
          <h2>📎 Upload New Document</h2>

          <form className="upload-form" onSubmit={addDocument}>
            <div className="input-group">
              <label htmlFor="doc-title">Title</label>
              <input id="doc-title" className="input" placeholder="e.g. Bridge Load Analysis" value={title} onChange={(e) => setTitle(e.target.value)} required />
            </div>

            <div className="input-group">
              <label htmlFor="doc-desc">Description</label>
              <input id="doc-desc" className="input" placeholder="Brief description" value={description} onChange={(e) => setDescription(e.target.value)} />
            </div>

            <div
              className={`file-drop ${dragover ? "dragover" : ""}`}
              onDragOver={(e) => { e.preventDefault(); setDragover(true); }}
              onDragLeave={() => setDragover(false)}
              onDrop={(e) => { e.preventDefault(); setDragover(false); setFile(e.dataTransfer.files[0]); }}
            >
              <input type="file" accept=".pdf" onChange={(e) => setFile(e.target.files[0])} />
              <div className="drop-icon">📄</div>
              <div className="drop-text">
                <strong>Click to browse</strong> or drag & drop a PDF
              </div>
              {file && <div className="file-name">✓ {file.name}</div>}
            </div>

            <div className="upload-actions">
              <button type="button" className="btn btn-ghost" onClick={() => { setTitle(""); setDescription(""); setFile(null); }}>
                Clear
              </button>
              <button type="submit" className="btn btn-primary" disabled={uploading}>
                {uploading ? "Uploading…" : "⬆ Upload"}
              </button>
            </div>
          </form>
        </div>

        {/* Add version section */}
        {
          versionDoc && (
            <div className="upload-section" style={{ maxWidth: "50%" }}>
              <h2>
                Upload New Version
              </h2>

              <p>{versionDoc.title}</p>

              <input
                type="file"
                accept=".pdf"
                onChange={(e) => setVersionFile(e.target.files[0])}
              />

              <button className="btn btn-ghost" style={{ margin: "10px" }}
                onClick={uploadNewVersion}
              >
                Upload
              </button>
              <button
                className="btn btn-ghost"
                onClick={() => {
                  setVersionDoc(null);
                  setVersionFile(null);
                }}
              >
                Cancel
              </button>
            </div>
          )
        }

        {/* Edit Section */}
        {
          editingDoc && (
            <div style={{ display: "flex", flexDirection: "column", gap: "1rem", backgroundColor: "white", margin: "20px", padding: "20px", borderRadius: 10 }}>
              <input className="input"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
              />

              <textarea className="input"
                value={description}
                onChange={(e) => setDescription(e.target.value)}
              />

              <button className="btn btn-primary" onClick={updateDocument}>
                Save
              </button>
            </div>
          )
        }

        {/* Version History */}
        {
          historyDoc && (
            <div className="upload-section">
              <h2>
                📜 Version History — {historyDoc.title}
              </h2>

              <p style={{ marginBottom: "12px", fontSize: "0.85rem", color: "var(--text-muted)" }}>
                Current version: v{historyDoc.version}
              </p>

              {versions.length === 0 ? (
                <p style={{ fontSize: "0.85rem", color: "var(--text-muted)" }}>No previous versions</p>
              ) : (
                versions.map(version => (
                  <div key={version.id} style={{ display: "flex", alignItems: "center", gap: "10px", padding: "10px 0", borderBottom: "1px solid var(--border)" }}>
                    <span className="badge">v{version.version_number}</span>

                    <span style={{ fontSize: "0.8rem", color: "var(--text-muted)" }}>
                      {new Date(version.created_at).toLocaleDateString()}
                    </span>

                    <button
                      className="btn btn-ghost btn-sm"
                      onClick={() => viewFile(version.file_url)}
                    >
                      👁 View
                    </button>

                    <button
                      className="btn btn-ghost btn-sm"
                      onClick={() => downloadFile(version.file_url, historyDoc.title + "_v" + version.version_number)}
                    >
                      ⬇ Download
                    </button>

                    <button
                      className="btn btn-danger btn-sm"
                      onClick={() => deleteVersion(version)}
                    >
                      🗑 Delete
                    </button>
                  </div>
                ))
              )}

              <button
                className="btn btn-ghost"
                style={{ marginTop: "12px" }}
                onClick={() => setHistoryDoc(null)}
              >
                Close
              </button>
            </div>
          )
        }


        {/* Document List */}
        {loading ? (
          <div className="loading-screen" style={{ minHeight: "200px" }}>
            <div className="spinner" />
          </div>
        ) : documents.length === 0 ? (
          <div className="empty-state">
            <div className="empty-icon">📂</div>
            <h3>No documents yet</h3>
            <p>Upload your first engineering document above</p>
          </div>
        ) : (
          <div className="doc-grid">
            {documents.map((doc) => (
              <div key={doc.id} className="doc-card">
                <div className="doc-card-header">
                  <h3>{doc.title}</h3>
                </div>

                {doc.description && (
                  <div className="doc-card-body">
                    <p>{doc.description}</p>
                  </div>
                )}

                <div className="doc-card-meta">
                  <span className="badge">v{doc.version}</span>
                  <button className="btn btn-ghost btn-sm" onClick={() => setVersionDoc(doc)}>
                    + New version
                  </button>
                  <span>{new Date(doc.created_at).toLocaleDateString()}</span>
                </div>

                <div className="doc-card-actions">
                  <button className="btn btn-ghost btn-sm" onClick={() => viewFile(doc.file_url)}>
                    👁 View
                  </button>
                  <button className="btn btn-ghost btn-sm" onClick={() => downloadFile(doc.file_url, doc.title)}>
                    ⬇ Download
                  </button>
                  <button className="btn btn-danger btn-sm" onClick={() => deleteDoc(doc)}>
                    🗑 Delete
                  </button>
                  <button className="btn btn-ghost btn-sm" onClick={() => editMeta(doc)}>
                    ✏ Edit
                  </button>
                </div>
                <button
                  className="btn btn-ghost btn-sm"
                  onClick={() => loadVersions(doc)}
                >
                  📜 History
                </button>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Toast */}
      {toast && (
        <div className={`toast toast-${toast.type}`}>
          {toast.message}
        </div>
      )}
    </div>
  );
}

export default Documents;