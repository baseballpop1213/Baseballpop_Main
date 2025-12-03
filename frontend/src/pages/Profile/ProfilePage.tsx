// src/pages/Profile/ProfilePage.tsx
import { useEffect, useMemo, useState, type ReactNode } from "react";
import { useAuth } from "../../context/AuthContext";
import {
  addParentChildLink,
  getCoachProfile,
  getParentChildren,
  getPlayerProfile,
  removeParentChildLink,
  updateBasicProfile,
  upsertCoachProfile,
  upsertPlayerProfile,
} from "../../api/account";
import type {
  ParentChildLink,
  PlayerProfile,
  UpsertCoachProfilePayload,
  UpsertPlayerProfilePayload,
} from "../../api/types";

interface BasicForm {
  display_name: string;
  first_name: string;
  last_name: string;
}

const positionOptions = [
  "Pitcher",
  "Catcher",
  "First Base",
  "Second Base",
  "Third Base",
  "Shortstop",
  "Left Field",
  "Center Field",
  "Right Field",
];

const pitchOptions = [
  "Fastball",
  "Changeup",
  "Curveball",
  "Slider",
  "Cutter",
  "Sinker",
  "Splitter",
  "Knuckleball",
];

export default function ProfilePage() {
  const { profile } = useAuth();

  const [basicForm, setBasicForm] = useState<BasicForm>({
    display_name: "",
    first_name: "",
    last_name: "",
  });
  const [basicSaving, setBasicSaving] = useState(false);

  const [playerProfile, setPlayerProfile] = useState<PlayerProfile | null>(null);
  const [playerForm, setPlayerForm] = useState<UpsertPlayerProfilePayload>({ positions: [], pitches: [] });
  const [playerSaving, setPlayerSaving] = useState(false);

  const [coachForm, setCoachForm] = useState<UpsertCoachProfilePayload>({});
  const [coachSaving, setCoachSaving] = useState(false);

  const [children, setChildren] = useState<ParentChildLink[]>([]);
  const [childEmailOrId, setChildEmailOrId] = useState("");
  const [childRelationship, setChildRelationship] = useState("");
  const [childSaving, setChildSaving] = useState(false);

  const [error, setError] = useState<string | null>(null);

  const playerHeightFeet = useMemo(() => {
    const inches = playerForm.height_inches ?? playerProfile?.height_inches ?? null;
    return inches ? Math.floor(inches / 12) : "";
  }, [playerForm.height_inches, playerProfile?.height_inches]);

  const playerHeightInches = useMemo(() => {
    const inches = playerForm.height_inches ?? playerProfile?.height_inches ?? null;
    return inches ? inches % 12 : "";
  }, [playerForm.height_inches, playerProfile?.height_inches]);

  useEffect(() => {
    if (profile) {
      setBasicForm({
        display_name: profile.display_name || "",
        first_name: profile.first_name || "",
        last_name: profile.last_name || "",
      });
    }
  }, [profile]);

  useEffect(() => {
    if (!profile) return;
    const role = profile.role;

    async function loadRoleData() {
      try {
        if (role === "player") {
          const data = await getPlayerProfile();
          setPlayerProfile(data.player_profile);
          setPlayerForm({
            positions: data.player_profile?.positions ?? [],
            pitches: data.player_profile?.pitches ?? [],
            batting_hand: data.player_profile?.batting_hand ?? null,
            throwing_hand: data.player_profile?.throwing_hand ?? null,
            height_inches: data.player_profile?.height_inches ?? null,
            weight_lbs: data.player_profile?.weight_lbs ?? null,
            school: data.player_profile?.school ?? null,
            grade: data.player_profile?.grade ?? null,
            home_address: data.player_profile?.home_address ?? null,
            primary_jersey_number: data.player_profile?.primary_jersey_number ?? null,
            walk_up_song: data.player_profile?.walk_up_song ?? null,
            glove_brand: data.player_profile?.glove_brand ?? null,
            glove_size_inches: data.player_profile?.glove_size_inches ?? null,
            bat_length_inches: data.player_profile?.bat_length_inches ?? null,
            bat_weight_oz: data.player_profile?.bat_weight_oz ?? null,
          });
        }

        if (role === "coach" || role === "assistant") {
          const data = await getCoachProfile();
          setCoachForm({
            phone: data.coach_profile?.phone ?? null,
            organization: data.coach_profile?.organization ?? null,
            title: data.coach_profile?.title ?? null,
            years_experience: data.coach_profile?.years_experience ?? null,
            bio: data.coach_profile?.bio ?? null,
            city: data.coach_profile?.city ?? null,
            state: data.coach_profile?.state ?? null,
            postal_code: data.coach_profile?.postal_code ?? null,
          });
        }

        if (role === "parent") {
          const kids = await getParentChildren();
          setChildren(kids);
        }
      } catch (err: any) {
        setError(err?.message || "Failed to load profile details");
      }
    }

    loadRoleData();
  }, [profile]);

  if (!profile) {
    return null;
  }

  async function saveBasics() {
    setBasicSaving(true);
    try {
      await updateBasicProfile({
        display_name: basicForm.display_name,
        first_name: basicForm.first_name,
        last_name: basicForm.last_name,
      });
    } catch (err: any) {
      setError(err?.message || "Failed to update profile");
    } finally {
      setBasicSaving(false);
    }
  }

  async function savePlayerProfile() {
    setPlayerSaving(true);
    try {
      const heightInchesValue = normalizeHeightInches(
        playerHeightFeet,
        playerHeightInches
      );

      await upsertPlayerProfile({
        ...playerForm,
        height_inches: heightInchesValue,
      });
    } catch (err: any) {
      setError(err?.message || "Failed to save player profile");
    } finally {
      setPlayerSaving(false);
    }
  }

  async function saveCoachProfile() {
    setCoachSaving(true);
    try {
      await upsertCoachProfile(coachForm);
    } catch (err: any) {
      setError(err?.message || "Failed to save coach profile");
    } finally {
      setCoachSaving(false);
    }
  }

  async function addChildLink() {
    if (!childEmailOrId) return;
    setChildSaving(true);
    try {
      await addParentChildLink(childEmailOrId, childRelationship);
      const kids = await getParentChildren();
      setChildren(kids);
      setChildEmailOrId("");
      setChildRelationship("");
    } catch (err: any) {
      setError(err?.message || "Failed to add child link");
    } finally {
      setChildSaving(false);
    }
  }

  async function removeChild(childId: string) {
    setChildSaving(true);
    try {
      await removeParentChildLink(childId);
      const kids = await getParentChildren();
      setChildren(kids);
    } catch (err: any) {
      setError(err?.message || "Failed to remove link");
    } finally {
      setChildSaving(false);
    }
  }

  return (
    <div className="space-y-6 pb-12">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-xl font-semibold">Profile</h2>
          <p className="text-sm text-slate-300">Update your account and role-specific details.</p>
        </div>
        <span className="text-xs rounded-full bg-slate-800 border border-slate-700 px-3 py-1 uppercase tracking-wide text-slate-200">
          {profile.role}
        </span>
      </div>

      {error && (
        <div className="rounded-lg border border-red-500/50 bg-red-500/10 p-3 text-sm text-red-200">
          {error}
        </div>
      )}

      <SectionCard title="Account basics" description="Name and display settings you can show to teams.">
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <LabeledInput
            label="Display name"
            value={basicForm.display_name}
            onChange={(v) => setBasicForm((f) => ({ ...f, display_name: v }))}
          />
          <LabeledInput
            label="First name"
            value={basicForm.first_name}
            onChange={(v) => setBasicForm((f) => ({ ...f, first_name: v }))}
          />
          <LabeledInput
            label="Last name"
            value={basicForm.last_name}
            onChange={(v) => setBasicForm((f) => ({ ...f, last_name: v }))}
          />
        </div>
        <div className="flex items-center gap-3 text-sm text-slate-300">
          <span className="font-semibold">Email:</span>
          <span className="font-mono">{profile.email}</span>
        </div>
        <div className="flex gap-2 justify-end">
          <button
            className="rounded-lg bg-emerald-500 hover:bg-emerald-600 px-4 py-2 text-sm font-semibold text-slate-900 disabled:opacity-60"
            onClick={saveBasics}
            disabled={basicSaving}
          >
            {basicSaving ? "Saving..." : "Save basics"}
          </button>
        </div>
      </SectionCard>

      {profile.role === "player" && (
        <SectionCard
          title="Player details"
          description="Measurements, gear, and on-field preferences."
        >
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div className="grid grid-cols-2 gap-2">
              <LabeledInput
                label="Height (ft)"
                type="number"
                value={String(playerHeightFeet)}
                onChange={(v) =>
                  setPlayerForm((f) => ({
                    ...f,
                    height_inches: normalizeHeightInches(v, playerHeightInches),
                  }))
                }
              />
              <LabeledInput
                label="Height (in)"
                type="number"
                value={String(playerHeightInches)}
                onChange={(v) =>
                  setPlayerForm((f) => ({
                    ...f,
                    height_inches: normalizeHeightInches(playerHeightFeet, v),
                  }))
                }
              />
            </div>
            <LabeledInput
              label="Weight (lbs)"
              type="number"
              value={nullableNumberToString(playerForm.weight_lbs)}
              onChange={(v) =>
                setPlayerForm((f) => ({ ...f, weight_lbs: parseNullableNumber(v) }))
              }
            />
            <LabeledInput
              label="School"
              value={playerForm.school ?? ""}
              onChange={(v) => setPlayerForm((f) => ({ ...f, school: v }))}
            />
            <LabeledInput
              label="Grade"
              value={playerForm.grade ?? ""}
              onChange={(v) => setPlayerForm((f) => ({ ...f, grade: v }))}
            />
            <LabeledInput
              label="Home address"
              value={playerForm.home_address ?? ""}
              onChange={(v) => setPlayerForm((f) => ({ ...f, home_address: v }))}
            />
            <LabeledInput
              label="Jersey number"
              type="number"
              value={nullableNumberToString(playerForm.primary_jersey_number)}
              onChange={(v) =>
                setPlayerForm((f) => ({
                  ...f,
                  primary_jersey_number: parseNullableNumber(v),
                }))
              }
            />
            <LabeledInput
              label="Walk-up song"
              value={playerForm.walk_up_song ?? ""}
              onChange={(v) => setPlayerForm((f) => ({ ...f, walk_up_song: v }))}
            />
            <LabeledInput
              label="Glove brand"
              value={playerForm.glove_brand ?? ""}
              onChange={(v) => setPlayerForm((f) => ({ ...f, glove_brand: v }))}
            />
            <LabeledInput
              label="Glove size (in)"
              type="number"
              value={nullableNumberToString(playerForm.glove_size_inches)}
              onChange={(v) =>
                setPlayerForm((f) => ({
                  ...f,
                  glove_size_inches: parseNullableNumber(v),
                }))
              }
            />
            <LabeledInput
              label="Bat length (in)"
              type="number"
              value={nullableNumberToString(playerForm.bat_length_inches)}
              onChange={(v) =>
                setPlayerForm((f) => ({ ...f, bat_length_inches: parseNullableNumber(v) }))
              }
            />
            <LabeledInput
              label="Bat weight (oz)"
              type="number"
              value={nullableNumberToString(playerForm.bat_weight_oz)}
              onChange={(v) =>
                setPlayerForm((f) => ({ ...f, bat_weight_oz: parseNullableNumber(v) }))
              }
            />
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <SelectChips
              label="Positions played"
              options={positionOptions}
              values={playerForm.positions || []}
              onChange={(values) => setPlayerForm((f) => ({ ...f, positions: values }))}
            />
            <SelectChips
              label="Pitches thrown"
              options={pitchOptions}
              values={playerForm.pitches || []}
              onChange={(values) => setPlayerForm((f) => ({ ...f, pitches: values }))}
            />
            <div className="grid grid-cols-2 gap-2">
              <SelectSimple
                label="Bats"
                value={playerForm.batting_hand ?? ""}
                onChange={(v) => setPlayerForm((f) => ({ ...f, batting_hand: v || null }))}
                options={[
                  { value: "", label: "Select" },
                  { value: "right", label: "Right" },
                  { value: "left", label: "Left" },
                  { value: "switch", label: "Switch" },
                ]}
              />
              <SelectSimple
                label="Throws"
                value={playerForm.throwing_hand ?? ""}
                onChange={(v) => setPlayerForm((f) => ({ ...f, throwing_hand: v || null }))}
                options={[
                  { value: "", label: "Select" },
                  { value: "right", label: "Right" },
                  { value: "left", label: "Left" },
                ]}
              />
            </div>
          </div>

          <div className="flex gap-2 justify-end">
            <button
              className="rounded-lg bg-emerald-500 hover:bg-emerald-600 px-4 py-2 text-sm font-semibold text-slate-900 disabled:opacity-60"
              onClick={savePlayerProfile}
              disabled={playerSaving}
            >
              {playerSaving ? "Saving..." : "Save player profile"}
            </button>
          </div>
        </SectionCard>
      )}

      {(profile.role === "coach" || profile.role === "assistant") && (
        <SectionCard
          title="Coach details"
          description="Organization context, bio, and contact preferences."
        >
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <LabeledInput
              label="Phone"
              value={coachForm.phone ?? ""}
              onChange={(v) => setCoachForm((f) => ({ ...f, phone: v }))}
            />
            <LabeledInput
              label="Organization"
              value={coachForm.organization ?? ""}
              onChange={(v) => setCoachForm((f) => ({ ...f, organization: v }))}
              placeholder="Ripit Raptors, Smoky High School"
            />
            <LabeledInput
              label="Title"
              value={coachForm.title ?? ""}
              onChange={(v) => setCoachForm((f) => ({ ...f, title: v }))}
              placeholder="Head Coach, Assistant, Coordinator"
            />
            <LabeledInput
              label="Years experience"
              type="number"
              value={nullableNumberToString(coachForm.years_experience)}
              onChange={(v) =>
                setCoachForm((f) => ({
                  ...f,
                  years_experience: parseNullableNumber(v),
                }))
              }
            />
            <LabeledInput
              label="City"
              value={coachForm.city ?? ""}
              onChange={(v) => setCoachForm((f) => ({ ...f, city: v }))}
            />
            <LabeledInput
              label="State"
              value={coachForm.state ?? ""}
              onChange={(v) => setCoachForm((f) => ({ ...f, state: v }))}
            />
            <LabeledInput
              label="Postal code"
              value={coachForm.postal_code ?? ""}
              onChange={(v) => setCoachForm((f) => ({ ...f, postal_code: v }))}
            />
          </div>

          <div>
            <label className="block text-sm font-semibold mb-1">Bio</label>
            <textarea
              className="w-full min-h-[120px] rounded-lg bg-slate-900/60 border border-slate-700 px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-emerald-500"
              maxLength={500}
              value={coachForm.bio ?? ""}
              onChange={(e) => setCoachForm((f) => ({ ...f, bio: e.target.value }))}
              placeholder="Share a 500-word summary of your coaching approach and background."
            />
            <p className="text-xs text-slate-400 mt-1">Max 500 characters.</p>
          </div>

          <div className="flex gap-2 justify-end">
            <button
              className="rounded-lg bg-emerald-500 hover:bg-emerald-600 px-4 py-2 text-sm font-semibold text-slate-900 disabled:opacity-60"
              onClick={saveCoachProfile}
              disabled={coachSaving}
            >
              {coachSaving ? "Saving..." : "Save coach profile"}
            </button>
          </div>
        </SectionCard>
      )}

      {profile.role === "parent" && (
        <SectionCard
          title="Linked players"
          description="Add players to your account or remove existing links."
        >
          <div className="space-y-3">
            <div className="grid grid-cols-1 md:grid-cols-3 gap-2">
              <LabeledInput
                label="Player profile ID or email"
                value={childEmailOrId}
                onChange={setChildEmailOrId}
                placeholder="Paste player profile UUID or email"
              />
              <LabeledInput
                label="Relationship"
                value={childRelationship}
                onChange={setChildRelationship}
                placeholder="Parent, guardian, etc."
              />
              <div className="flex items-end">
                <button
                  onClick={addChildLink}
                  disabled={childSaving || !childEmailOrId}
                  className="w-full rounded-lg bg-emerald-500 hover:bg-emerald-600 px-3 py-2 text-sm font-semibold text-slate-900 disabled:opacity-60"
                >
                  {childSaving ? "Saving..." : "Add player"}
                </button>
              </div>
            </div>

            {children.length === 0 && (
              <p className="text-sm text-slate-400">No linked players yet.</p>
            )}

            <div className="space-y-2">
              {children.map((link) => (
                <div
                  key={link.link_id}
                  className="flex items-center justify-between rounded-lg border border-slate-700 bg-slate-900/50 px-3 py-2 text-sm"
                >
                  <div>
                    <p className="font-semibold">
                      {link.child?.display_name ||
                        [link.child?.first_name, link.child?.last_name]
                          .filter(Boolean)
                          .join(" ") ||
                        "Player"}
                    </p>
                    <p className="text-slate-400">
                      Relationship: {link.relationship || "Parent"}
                    </p>
                  </div>
                  <button
                    onClick={() => link.child?.id && removeChild(link.child.id)}
                    className="text-red-300 text-xs underline"
                  >
                    Remove
                  </button>
                </div>
              ))}
            </div>
          </div>
        </SectionCard>
      )}

      <SectionCard
        title="App settings"
        description="Quick toggles for appearance and account cleanup."
      >
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-sm">
          <div className="rounded-lg border border-slate-700 p-3 bg-slate-900/40 flex items-center justify-between">
            <div>
              <p className="font-semibold">Theme</p>
              <p className="text-slate-400 text-xs">Light/Dark coming soon.</p>
            </div>
            <span className="text-xs rounded-full border border-slate-700 px-2 py-1 text-slate-300">Auto</span>
          </div>
          <div className="rounded-lg border border-slate-700 p-3 bg-slate-900/40 flex items-center justify-between">
            <div>
              <p className="font-semibold">Delete account</p>
              <p className="text-slate-400 text-xs">Request deletion from support.</p>
            </div>
            <button className="text-xs text-red-300 underline" disabled>
              Coming soon
            </button>
          </div>
        </div>
      </SectionCard>

      <SectionCard title="Privacy & data" description="Quick links for policies and data use.">
        <div className="grid grid-cols-1 md:grid-cols-3 gap-3 text-sm">
          <PolicyLink label="Privacy policy" />
          <PolicyLink label="Data usage" />
          <PolicyLink label="Terms of service" />
        </div>
      </SectionCard>
    </div>
  );
}

function SectionCard({
  title,
  description,
  children,
}: {
  title: string;
  description?: string;
  children: ReactNode;
}) {
  return (
    <div className="rounded-xl bg-slate-900/70 border border-slate-700 p-4 space-y-3">
      <div>
        <h3 className="text-lg font-semibold">{title}</h3>
        {description && <p className="text-sm text-slate-300">{description}</p>}
      </div>
      {children}
    </div>
  );
}

function LabeledInput({
  label,
  value,
  onChange,
  type = "text",
  placeholder,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  type?: string;
  placeholder?: string;
}) {
  return (
    <div className="space-y-1">
      <label className="block text-sm text-slate-200">{label}</label>
      <input
        type={type}
        className="w-full rounded-lg bg-slate-900/60 border border-slate-700 px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-emerald-500"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
      />
    </div>
  );
}

function SelectChips({
  label,
  options,
  values,
  onChange,
}: {
  label: string;
  options: string[];
  values: string[];
  onChange: (values: string[]) => void;
}) {
  function toggle(option: string) {
    const has = values.includes(option);
    if (has) {
      onChange(values.filter((v) => v !== option));
    } else {
      onChange([...values, option]);
    }
  }

  return (
    <div className="space-y-2">
      <p className="text-sm font-semibold text-slate-200">{label}</p>
      <div className="flex flex-wrap gap-2">
        {options.map((option) => (
          <button
            key={option}
            type="button"
            onClick={() => toggle(option)}
            className={`rounded-full border px-3 py-1 text-xs transition ${
              values.includes(option)
                ? "border-emerald-400 bg-emerald-500/10 text-emerald-100"
                : "border-slate-700 bg-slate-900/50 text-slate-200"
            }`}
          >
            {option}
          </button>
        ))}
      </div>
    </div>
  );
}

function SelectSimple({
  label,
  value,
  onChange,
  options,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  options: { value: string; label: string }[];
}) {
  return (
    <div className="space-y-1">
      <label className="block text-sm text-slate-200">{label}</label>
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="w-full rounded-lg bg-slate-900/60 border border-slate-700 px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-emerald-500"
      >
        {options.map((opt) => (
          <option key={opt.value} value={opt.value}>
            {opt.label}
          </option>
        ))}
      </select>
    </div>
  );
}

function PolicyLink({ label }: { label: string }) {
  return (
    <button className="rounded-lg border border-slate-700 bg-slate-900/40 px-3 py-2 text-left text-sm text-slate-200 hover:border-emerald-400">
      {label}
    </button>
  );
}

function parseNullableNumber(value: string): number | null {
  if (!value) return null;
  const num = Number(value);
  return Number.isFinite(num) ? num : null;
}

function nullableNumberToString(value: number | null | undefined) {
  return value === null || value === undefined ? "" : String(value);
}

function normalizeHeightInches(feet: string | number | null, inches: string | number | null) {
  const ftNum = Number(feet);
  const inNum = Number(inches);
  if (!Number.isFinite(ftNum) && !Number.isFinite(inNum)) return null;
  const total = (Number.isFinite(ftNum) ? ftNum * 12 : 0) + (Number.isFinite(inNum) ? inNum : 0);
  return Number.isFinite(total) ? total : null;
}

