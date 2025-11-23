// src/pages/Profile/ProfilePage.tsx
import { useAuth } from "../../context/AuthContext";

export default function ProfilePage() {
  const { profile } = useAuth();

  if (!profile) {
    return null;
  }

  const name =
    profile.display_name ||
    [profile.first_name, profile.last_name].filter(Boolean).join(" ") ||
    "Unknown user";

  return (
    <div className="space-y-4">
      <h2 className="text-xl font-semibold">Profile</h2>
      <div className="rounded-xl bg-slate-900/70 border border-slate-700 p-4 text-sm">
        <p>
          <span className="font-semibold">Name:</span> {name}
        </p>
        <p>
          <span className="font-semibold">Email:</span>{" "}
          <span className="font-mono">{profile.email}</span>
        </p>
        <p>
          <span className="font-semibold">Role:</span>{" "}
          <span className="font-mono">{profile.role}</span>
        </p>
      </div>
      <p className="text-xs text-slate-400">
        This page will grow to include account settings, app preferences, and
        more detailed profile data.
      </p>
    </div>
  );
}
