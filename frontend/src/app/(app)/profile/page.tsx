"use client";

import { useEffect, useRef, useState } from "react";
import api from "@/lib/api";
import { getErrorMessage } from "@/lib/errors";
import { useAuthStore } from "@/stores/auth-store";

export default function ProfilePage() {
  const user = useAuthStore((s) => s.user);
  const updateProfile = useAuthStore((s) => s.updateProfile);

  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [avatarUrl, setAvatarUrl] = useState("");
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [profileMsg, setProfileMsg] = useState<{ kind: "ok" | "err"; text: string } | null>(null);

  const [currentPw, setCurrentPw] = useState("");
  const [newPw, setNewPw] = useState("");
  const [newPwRepeat, setNewPwRepeat] = useState("");
  const [changingPw, setChangingPw] = useState(false);
  const [pwMsg, setPwMsg] = useState<{ kind: "ok" | "err"; text: string } | null>(null);

  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!user) return;
    setName(user.name);
    setEmail(user.email);
    setAvatarUrl(user.avatar_url || "");
  }, [user]);

  const dirty =
    !!user && (user.name !== name || user.email !== email || (user.avatar_url || "") !== avatarUrl);

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user || !dirty || saving) return;
    setSaving(true);
    setProfileMsg(null);
    try {
      await updateProfile({
        name: user.name !== name ? name : undefined,
        email: user.email !== email ? email : undefined,
        avatar_url: (user.avatar_url || "") !== avatarUrl ? avatarUrl : undefined,
      });
      setProfileMsg({ kind: "ok", text: "Збережено" });
    } catch (err) {
      setProfileMsg({ kind: "err", text: getErrorMessage(err, "Не вдалось зберегти") });
    } finally {
      setSaving(false);
    }
  };

  const handleAvatarPick = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (!file.type.startsWith("image/")) {
      setProfileMsg({ kind: "err", text: "Файл має бути зображенням" });
      return;
    }
    setUploading(true);
    setProfileMsg(null);
    try {
      const form = new FormData();
      form.append("file", file);
      const { data } = await api.post<{ url: string }>("/uploads", form, {
        headers: { "Content-Type": "multipart/form-data" },
      });
      setAvatarUrl(data.url);
    } catch (err) {
      setProfileMsg({ kind: "err", text: getErrorMessage(err, "Не вдалось завантажити") });
    } finally {
      setUploading(false);
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  };

  const handleChangePw = async (e: React.FormEvent) => {
    e.preventDefault();
    setPwMsg(null);
    if (newPw.length < 6) {
      setPwMsg({ kind: "err", text: "Новий пароль мінімум 6 символів" });
      return;
    }
    if (newPw !== newPwRepeat) {
      setPwMsg({ kind: "err", text: "Паролі не співпадають" });
      return;
    }
    setChangingPw(true);
    try {
      await api.post("/auth/me/password", {
        current_password: currentPw,
        new_password: newPw,
      });
      setPwMsg({ kind: "ok", text: "Пароль змінено" });
      setCurrentPw("");
      setNewPw("");
      setNewPwRepeat("");
    } catch (err) {
      setPwMsg({ kind: "err", text: getErrorMessage(err, "Не вдалось змінити пароль") });
    } finally {
      setChangingPw(false);
    }
  };

  if (!user) {
    return (
      <div className="flex items-center justify-center h-full text-zinc-500">Завантаження…</div>
    );
  }

  return (
    <div className="p-6 h-full overflow-auto">
      <div className="max-w-2xl mx-auto flex flex-col gap-8">
        <div>
          <h1 className="text-2xl font-bold text-white">Профіль</h1>
          <p className="text-zinc-500 text-sm mt-1">Ваше ім'я, email та аватар.</p>
        </div>

        {/* Profile form */}
        <form
          onSubmit={handleSave}
          className="flex flex-col gap-5 p-5 bg-zinc-900/60 border border-zinc-800 rounded-xl"
        >
          <div className="flex items-center gap-4">
            <div className="w-20 h-20 rounded-full bg-zinc-800 overflow-hidden shrink-0 flex items-center justify-center text-2xl font-bold text-white">
              {avatarUrl ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={avatarUrl} alt="" className="w-full h-full object-cover" />
              ) : (
                <span>{name.charAt(0).toUpperCase()}</span>
              )}
            </div>
            <div className="flex flex-col gap-2">
              <button
                type="button"
                onClick={() => fileInputRef.current?.click()}
                disabled={uploading}
                className="px-3 py-1.5 text-xs font-medium text-violet-300 bg-violet-500/15 hover:bg-violet-500/25 border border-violet-500/30 rounded-lg transition-colors disabled:opacity-50"
              >
                {uploading ? "Завантаження…" : avatarUrl ? "Змінити аватар" : "Завантажити аватар"}
              </button>
              {avatarUrl && (
                <button
                  type="button"
                  onClick={() => setAvatarUrl("")}
                  className="px-3 py-1.5 text-xs text-zinc-500 hover:text-red-400 transition-colors text-left"
                >
                  Прибрати
                </button>
              )}
              <input
                ref={fileInputRef}
                type="file"
                accept="image/*"
                className="hidden"
                onChange={handleAvatarPick}
              />
            </div>
          </div>

          <div>
            <label className="block text-sm text-zinc-400 mb-1.5">Ім'я</label>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="w-full px-3 py-2.5 bg-zinc-800 border border-zinc-700 rounded-lg text-white focus:outline-none focus:border-violet-500 transition-colors"
            />
          </div>

          <div>
            <label className="block text-sm text-zinc-400 mb-1.5">Email</label>
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="w-full px-3 py-2.5 bg-zinc-800 border border-zinc-700 rounded-lg text-white focus:outline-none focus:border-violet-500 transition-colors"
            />
          </div>

          <div>
            <label className="block text-sm text-zinc-400 mb-1.5">План</label>
            <input
              type="text"
              value={user.plan}
              disabled
              className="w-full px-3 py-2.5 bg-zinc-800/50 border border-zinc-800 rounded-lg text-zinc-500 cursor-not-allowed"
            />
          </div>

          {profileMsg && (
            <div
              className={`text-sm rounded-lg px-3 py-2 ${
                profileMsg.kind === "ok"
                  ? "text-emerald-300 bg-emerald-500/10 border border-emerald-500/30"
                  : "text-red-300 bg-red-500/10 border border-red-500/30"
              }`}
            >
              {profileMsg.text}
            </div>
          )}

          <div className="flex justify-end">
            <button
              type="submit"
              disabled={!dirty || saving}
              className="px-4 py-2 bg-violet-600 hover:bg-violet-500 text-white rounded-lg text-sm disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
            >
              {saving ? "Збереження…" : "Зберегти"}
            </button>
          </div>
        </form>

        {/* Password */}
        <form
          onSubmit={handleChangePw}
          className="flex flex-col gap-4 p-5 bg-zinc-900/60 border border-zinc-800 rounded-xl"
        >
          <div>
            <h2 className="text-white font-semibold">Пароль</h2>
            <p className="text-xs text-zinc-500 mt-0.5">Зміна пароля не завершує активну сесію.</p>
          </div>

          <div>
            <label className="block text-sm text-zinc-400 mb-1.5">Поточний пароль</label>
            <input
              type="password"
              value={currentPw}
              onChange={(e) => setCurrentPw(e.target.value)}
              autoComplete="current-password"
              className="w-full px-3 py-2.5 bg-zinc-800 border border-zinc-700 rounded-lg text-white focus:outline-none focus:border-violet-500 transition-colors"
            />
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-sm text-zinc-400 mb-1.5">Новий пароль</label>
              <input
                type="password"
                value={newPw}
                onChange={(e) => setNewPw(e.target.value)}
                autoComplete="new-password"
                className="w-full px-3 py-2.5 bg-zinc-800 border border-zinc-700 rounded-lg text-white focus:outline-none focus:border-violet-500 transition-colors"
              />
            </div>
            <div>
              <label className="block text-sm text-zinc-400 mb-1.5">Повторіть новий</label>
              <input
                type="password"
                value={newPwRepeat}
                onChange={(e) => setNewPwRepeat(e.target.value)}
                autoComplete="new-password"
                className="w-full px-3 py-2.5 bg-zinc-800 border border-zinc-700 rounded-lg text-white focus:outline-none focus:border-violet-500 transition-colors"
              />
            </div>
          </div>

          {pwMsg && (
            <div
              className={`text-sm rounded-lg px-3 py-2 ${
                pwMsg.kind === "ok"
                  ? "text-emerald-300 bg-emerald-500/10 border border-emerald-500/30"
                  : "text-red-300 bg-red-500/10 border border-red-500/30"
              }`}
            >
              {pwMsg.text}
            </div>
          )}

          <div className="flex justify-end">
            <button
              type="submit"
              disabled={changingPw || !currentPw || !newPw || !newPwRepeat}
              className="px-4 py-2 bg-violet-600 hover:bg-violet-500 text-white rounded-lg text-sm disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
            >
              {changingPw ? "Змінюю…" : "Змінити пароль"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
