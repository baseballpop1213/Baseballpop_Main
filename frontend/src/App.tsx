// src/App.tsx
import "./index.css";
import { Routes, Route, Navigate } from "react-router-dom";
import LoginPage from "./pages/Auth/LoginPage";
import AppLayout from "./layouts/AppLayout";
import RequireAuth from "./components/RequireAuth";
import DashboardPage from "./pages/Dashboard/DashboardPage";
import StatsPage from "./pages/Stats/StatsPage";
import MessagesPage from "./pages/Messages/MessagesPage";
import EventsPage from "./pages/Events/EventsPage";
import ProfilePage from "./pages/Profile/ProfilePage";

function App() {
  return (
    <Routes>
      {/* Public route */}
      <Route path="/login" element={<LoginPage />} />

      {/* Protected routes */}
      <Route element={<RequireAuth />}>
        <Route element={<AppLayout />}>
          <Route index element={<DashboardPage />} />
          <Route path="stats" element={<StatsPage />} />
          <Route path="messages" element={<MessagesPage />} />
          <Route path="events" element={<EventsPage />} />
          <Route path="profile" element={<ProfilePage />} />
        </Route>
      </Route>

      {/* Fallback */}
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}

export default App;
