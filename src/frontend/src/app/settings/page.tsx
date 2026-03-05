"use client";

import { useEffect, useState } from "react";
import { AppShell, useAppData } from "@/components/app-shell";
import { toast } from "sonner";
import { getSettings, updateSettings, uploadRoomsFile, uploadPersonnelFile, AppSettings } from "@/lib/api";
import { downloadBase64Excel } from "@/lib/export";
import { IconPlus, IconTrash, IconCheck, IconUpload, IconDownload } from "@/components/icons";

export default function SettingsPage() {
  return (
    <AppShell>
      <SettingsContent />
    </AppShell>
  );
}

function SettingsContent() {
  const { auth } = useAppData();
  const [settings, setSettings] = useState<AppSettings | null>(null);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (auth.role !== "admin") return;
    getSettings().then(setSettings).catch((e) => setError(e.message));
  }, [auth.role]);

  if (auth.role !== "admin") {
    return (
      <div className="surface-card p-12 text-center">
        <p className="text-[16px] font-semibold" style={{ color: "var(--text-1)" }}>הגישה מוגבלת למנהלים בלבד</p>
      </div>
    );
  }

  if (error) {
    return (
      <div className="surface-card p-12 text-center">
        <p className="text-[16px] font-semibold" style={{ color: "var(--danger)" }}>{error}</p>
      </div>
    );
  }

  if (!settings) {
    return (
      <div className="surface-card p-8">
        <div className="skeleton h-8 w-40 rounded-lg mb-4" />
        <div className="skeleton h-40 w-full rounded-lg" />
      </div>
    );
  }

  async function handleSave() {
    if (!settings) return;
    setSaving(true);
    setSaved(false);
    try {
      const updated = await updateSettings(settings);
      setSettings(updated);
      setSaved(true);
      toast.success("הגדרות נשמרו");
      setTimeout(() => setSaved(false), 2000);
    } catch (e: any) {
      setError(e.message);
      toast.error("שגיאה בשמירת הגדרות");
    } finally {
      setSaving(false);
    }
  }

  return (
    <>
      <section className="surface-card p-8 mb-7">
        <div className="flex items-center justify-between">
          <h2 className="section-title">הגדרות מערכת</h2>
          <div className="flex items-center gap-2">
            <label className="btn-ghost inline-flex items-center gap-1.5 text-[12px] cursor-pointer">
              <IconUpload size={14} />
              ייבוא הגדרות
              <input
                type="file"
                accept=".json"
                className="hidden"
                onChange={(e) => {
                  const file = e.target.files?.[0];
                  if (!file) return;
                  file.text().then((text) => {
                    try {
                      const imported = JSON.parse(text);
                      updateSettings(imported).then(setSettings);
                      setSaved(true);
                      setTimeout(() => setSaved(false), 2000);
                    } catch {
                      setError("קובץ JSON לא תקין");
                    }
                  });
                  e.target.value = "";
                }}
              />
            </label>
            <button
              type="button"
              onClick={() => {
                const blob = new Blob([JSON.stringify(settings, null, 2)], { type: "application/json" });
                const url = URL.createObjectURL(blob);
                const a = document.createElement("a");
                a.href = url;
                a.download = "triplez_settings.json";
                a.click();
                URL.revokeObjectURL(url);
              }}
              className="btn-ghost inline-flex items-center gap-1.5 text-[12px]"
            >
              <IconDownload size={14} />
              ייצוא הגדרות
            </button>
            <button
              onClick={handleSave}
              disabled={saving}
              className="btn-primary inline-flex items-center gap-2"
            >
              <IconCheck size={14} />
              {saving ? "שומר..." : saved ? "נשמר!" : "שמור שינויים"}
            </button>
          </div>
        </div>
      </section>

      <div className="grid grid-cols-2 gap-6 mb-7">
        <ListEditor
          title="דרגות (מהגבוהה לנמוכה)"
          items={settings.ranks_high_to_low}
          hebrewMap={settings.hebrew.ranks}
          onChange={(items) => setSettings({ ...settings, ranks_high_to_low: items })}
          onHebrewChange={(map) => setSettings({ ...settings, hebrew: { ...settings.hebrew, ranks: map } })}
        />
        <ListEditor
          title="זירות (מחלקות)"
          items={settings.departments}
          hebrewMap={settings.hebrew.departments}
          onChange={(items) => setSettings({ ...settings, departments: items })}
          onHebrewChange={(map) => setSettings({ ...settings, hebrew: { ...settings.hebrew, departments: map } })}
        />
        <ListEditor
          title="מגדרים"
          items={settings.genders}
          hebrewMap={settings.hebrew.genders}
          onChange={(items) => setSettings({ ...settings, genders: items })}
          onHebrewChange={(map) => setSettings({ ...settings, hebrew: { ...settings.hebrew, genders: map } })}
        />
        <ListEditor
          title="מבנים"
          items={settings.buildings}
          hebrewMap={settings.hebrew.buildings}
          onChange={(items) => setSettings({ ...settings, buildings: items })}
          onHebrewChange={(map) => setSettings({ ...settings, hebrew: { ...settings.hebrew, buildings: map } })}
        />
      </div>

      <section className="surface-card p-6 mb-7">
        <h3 className="text-[16px] font-bold mb-4" style={{ color: "var(--text-1)" }}>סיסמאות</h3>
        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="block text-[12px] font-semibold mb-1" style={{ color: "var(--text-2)" }}>סיסמת מנהל</label>
            <input
              type="text"
              value={settings.admin_password}
              onChange={(e) => setSettings({ ...settings, admin_password: e.target.value })}
              className="w-full px-3 py-2 rounded-lg border text-[14px]"
              style={{ background: "var(--surface-2)", borderColor: "var(--border)", color: "var(--text-1)" }}
              dir="ltr"
            />
          </div>
        </div>

        <h4 className="text-[14px] font-semibold mt-5 mb-3" style={{ color: "var(--text-2)" }}>סיסמאות מחלקות</h4>
        <div className="grid grid-cols-2 gap-3">
          {settings.departments.map((dept) => (
            <div key={dept} className="flex items-center gap-2">
              <span className="text-[13px] font-medium w-20 text-left" style={{ color: "var(--text-2)" }} dir="ltr">{dept}</span>
              <input
                type="text"
                value={settings.dept_passwords[dept] || ""}
                onChange={(e) =>
                  setSettings({
                    ...settings,
                    dept_passwords: { ...settings.dept_passwords, [dept]: e.target.value },
                  })
                }
                className="flex-1 px-3 py-1.5 rounded-lg border text-[13px]"
                style={{ background: "var(--surface-2)", borderColor: "var(--border)", color: "var(--text-1)" }}
                dir="ltr"
              />
            </div>
          ))}
        </div>
      </section>

      <section className="surface-card p-6 mb-7">
        <h3 className="text-[16px] font-bold mb-4" style={{ color: "var(--text-1)" }}>טעינת נתונים מאקסל</h3>
        <div className="grid grid-cols-2 gap-4">
          <FileUploadButton label="טעינת חדרים" onUpload={async (file) => {
            const res = await uploadRoomsFile(file);
            if (res.warnings?.unknown_personnel?.length) {
              toast.error(res.warnings.message, {
                duration: 10000,
                action: {
                  label: "הורד רשימה",
                  onClick: () => downloadBase64Excel(res.warnings!.excel_base64, "אנשים_לא_מזוהים"),
                },
              });
            }
            return res;
          }} />
          <FileUploadButton label="טעינת כוח אדם" onUpload={uploadPersonnelFile} />
        </div>
      </section>
    </>
  );
}

function FileUploadButton({ label, onUpload }: { label: string; onUpload: (file: File) => Promise<{ ok: boolean; count: number }> }) {
  const [status, setStatus] = useState<string | null>(null);

  function handleChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setStatus("טוען...");
    onUpload(file)
      .then((res) => { setStatus(`נטענו ${res.count} שורות`); toast.success(`נטענו ${res.count} שורות`); })
      .catch((err) => { setStatus(`שגיאה: ${err.message}`); toast.error(`שגיאה: ${err.message}`); });
    e.target.value = "";
  }

  return (
    <div>
      <label className="btn-secondary inline-flex items-center gap-2 cursor-pointer">
        <IconUpload size={15} />
        {label}
        <input type="file" accept=".xlsx,.xls,.csv" onChange={handleChange} className="hidden" />
      </label>
      {status && <p className="text-[12px] mt-2" style={{ color: "var(--text-3)" }}>{status}</p>}
    </div>
  );
}

function ListEditor({
  title,
  items,
  hebrewMap,
  onChange,
  onHebrewChange,
}: {
  title: string;
  items: string[];
  hebrewMap: Record<string, string>;
  onChange: (items: string[]) => void;
  onHebrewChange: (map: Record<string, string>) => void;
}) {
  const [newItem, setNewItem] = useState("");

  function addItem() {
    const val = newItem.trim();
    if (!val || items.includes(val)) return;
    onChange([...items, val]);
    setNewItem("");
  }

  function removeItem(index: number) {
    const key = items[index];
    const next = items.filter((_, i) => i !== index);
    onChange(next);
    const nextMap = { ...hebrewMap };
    delete nextMap[key];
    onHebrewChange(nextMap);
  }

  function updateHebrew(key: string, value: string) {
    onHebrewChange({ ...hebrewMap, [key]: value });
  }

  return (
    <div className="surface-card p-5">
      <h3 className="text-[15px] font-bold mb-3" style={{ color: "var(--text-1)" }}>{title}</h3>
      <div className="space-y-2 mb-3">
        {items.map((item, i) => (
          <div key={item} className="flex items-center gap-2">
            <span className="text-[13px] font-mono w-24 shrink-0" style={{ color: "var(--text-2)" }} dir="ltr">{item}</span>
            <input
              type="text"
              value={hebrewMap[item] || ""}
              onChange={(e) => updateHebrew(item, e.target.value)}
              placeholder="תרגום עברי"
              className="flex-1 px-2 py-1 rounded-lg border text-[13px]"
              style={{ background: "var(--surface-2)", borderColor: "var(--border)", color: "var(--text-1)" }}
            />
            <button
              type="button"
              onClick={() => removeItem(i)}
              className="p-1 rounded-lg transition-colors"
              style={{ color: "var(--danger)" }}
            >
              <IconTrash size={14} />
            </button>
          </div>
        ))}
      </div>
      <div className="flex items-center gap-2">
        <input
          type="text"
          value={newItem}
          onChange={(e) => setNewItem(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && addItem()}
          placeholder="הוסף ערך חדש..."
          className="flex-1 px-2 py-1 rounded-lg border text-[13px]"
          style={{ background: "var(--surface-2)", borderColor: "var(--border)", color: "var(--text-1)" }}
          dir="ltr"
        />
        <button
          type="button"
          onClick={addItem}
          className="p-1 rounded-lg transition-colors"
          style={{ color: "var(--accent)" }}
        >
          <IconPlus size={16} />
        </button>
      </div>
    </div>
  );
}
