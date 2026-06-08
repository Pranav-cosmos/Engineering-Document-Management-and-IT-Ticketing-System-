import { useEffect, useState } from "react";
import { supabase } from "../lib/supabase";
import Sidebar from "../components/SideBar";
import StatCard from "../components/Statcard";

export default function Dashboard() {
  const [user, setUser] = useState(null);
  const [docCount, setDocCount] = useState(0);

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      if (!session) return;
      setUser(session.user);
      supabase.from("documents").select("*", { count: "exact", head: true })
        .then(({ count }) => setDocCount(count || 0));
    });
  }, []);

  return (
    <div className="layout">
      <Sidebar />
      <div className="content">
        <div className="page-header">
          <h1>Dashboard</h1>
          {user && <p>Welcome back, {user.email}</p>}
        </div>
        <div className="stats-grid">
          <StatCard title="Total Documents" value={docCount} />
          <StatCard title="Open Tickets" value="0" />
          <StatCard title="My Uploads" value={docCount} />
          <StatCard title="Recent Activity" value="0" />
        </div>
      </div>
    </div>
  );
}