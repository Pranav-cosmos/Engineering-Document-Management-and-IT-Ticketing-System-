import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import { useEffect, useState } from "react";
import { supabase } from "./lib/supabase";
import Documents from "./pages/Documents";
import Login from "./pages/Login";
import Register from "./pages/Register";
import Dashboard from "./pages/Dashboard";
import ProtectedRoute from "./components/ProtectedRoute";
import Tickets from "./pages/tickets";
import TicketsDetails from "./pages/TIcketsDetails";
import AuditLogs from "./utils/AuditLogs";
import Profile from "./pages/Profile";
import Users from "./pages/Users";
import DocumentChat from "./pages/DocumentChat";

function App() {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      setUser(session?.user ?? null);
      setLoading(false);
    });

    const { data: listener } = supabase.auth.onAuthStateChange(
      (_event, session) => setUser(session?.user ?? null)
    );

    return () => listener.subscription.unsubscribe();
  }, []);

  if (loading) {
    return (
      <div className="loading-screen">
        <div className="spinner" />
      </div>
    );
  }

  return (
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<Login />} />
        <Route path="/register" element={<Register />} />
        <Route path="/dashboard" element={<ProtectedRoute user={user}><Dashboard /></ProtectedRoute>} />
        <Route path="/documents" element={<ProtectedRoute user={user}><Documents /></ProtectedRoute>} />
        <Route path="/tickets" element={<ProtectedRoute user={user}><Tickets /></ProtectedRoute>} />
        <Route path="/tickets/:id" element={<ProtectedRoute user={user}><TicketsDetails /></ProtectedRoute>} />
        <Route path="/audit-logs" element={<ProtectedRoute user={user}><AuditLogs /></ProtectedRoute>} />
        <Route path="/profile" element={<ProtectedRoute user={user}><Profile /></ProtectedRoute>} />
        <Route path="/users" element={<ProtectedRoute user={user}><Users /></ProtectedRoute>} />
        <Route path="*" element={<Navigate to={user ? "/dashboard" : "/"} replace />} />
        <Route path="/document-chat" element={<ProtectedRoute user={user}><DocumentChat /></ProtectedRoute>} />
      </Routes>
    </BrowserRouter>
  );
}

export default App;
