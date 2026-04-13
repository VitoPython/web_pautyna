"use client";

import { useState } from "react";

interface AddContactModalProps {
  onAdd: (data: {
    name: string;
    platform: string;
    profile_id: string;
    tags: string[];
    edgeType: string;
  }) => void;
  onClose: () => void;
}

export default function AddContactModal({ onAdd, onClose }: AddContactModalProps) {
  const [name, setName] = useState("");
  const [platform, setPlatform] = useState("linkedin");
  const [profileId, setProfileId] = useState("");
  const [tagsInput, setTagsInput] = useState("");
  const [edgeType, setEdgeType] = useState("acquaintance");

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const tags = tagsInput
      .split(",")
      .map((t) => t.trim())
      .filter(Boolean);
    onAdd({ name: name.trim(), platform, profile_id: profileId.trim(), tags, edgeType });
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      <div className="absolute inset-0 bg-black/60" onClick={onClose} />
      <div className="relative bg-zinc-900 border border-zinc-800 rounded-xl w-full max-w-md p-6 shadow-2xl">
        <div className="flex items-center justify-between mb-5">
          <h2 className="text-lg font-semibold text-white">Додати контакт</h2>
          <button onClick={onClose} className="text-zinc-500 hover:text-white transition-colors">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} className="w-5 h-5">
              <line x1="18" y1="6" x2="6" y2="18" />
              <line x1="6" y1="6" x2="18" y2="18" />
            </svg>
          </button>
        </div>

        <form onSubmit={handleSubmit} className="flex flex-col gap-4">
          {/* Name */}
          <div>
            <label className="block text-sm text-zinc-400 mb-1.5">Ім&apos;я</label>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              required
              className="w-full px-3 py-2.5 bg-zinc-800 border border-zinc-700 rounded-lg text-white placeholder-zinc-600 focus:outline-none focus:border-violet-500 transition-colors"
              placeholder="Іван Петренко"
              autoFocus
            />
          </div>

          {/* Platform */}
          <div>
            <label className="block text-sm text-zinc-400 mb-1.5">Платформа</label>
            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => setPlatform("linkedin")}
                className={`flex-1 py-2.5 rounded-lg text-sm font-medium transition-colors ${
                  platform === "linkedin"
                    ? "bg-blue-500/20 text-blue-400 border border-blue-500/40"
                    : "bg-zinc-800 text-zinc-400 border border-zinc-700 hover:border-zinc-600"
                }`}
              >
                LinkedIn
              </button>
              <button
                type="button"
                onClick={() => setPlatform("instagram")}
                className={`flex-1 py-2.5 rounded-lg text-sm font-medium transition-colors ${
                  platform === "instagram"
                    ? "bg-pink-500/20 text-pink-400 border border-pink-500/40"
                    : "bg-zinc-800 text-zinc-400 border border-zinc-700 hover:border-zinc-600"
                }`}
              >
                Instagram
              </button>
            </div>
          </div>

          {/* Profile ID */}
          <div>
            <label className="block text-sm text-zinc-400 mb-1.5">
              {platform === "linkedin" ? "LinkedIn Profile" : "Instagram @username"}
            </label>
            <input
              type="text"
              value={profileId}
              onChange={(e) => setProfileId(e.target.value)}
              className="w-full px-3 py-2.5 bg-zinc-800 border border-zinc-700 rounded-lg text-white placeholder-zinc-600 focus:outline-none focus:border-violet-500 transition-colors"
              placeholder={platform === "linkedin" ? "ivan-petrenko" : "@ivan_petrenko"}
            />
          </div>

          {/* Edge type */}
          <div>
            <label className="block text-sm text-zinc-400 mb-1.5">Тип зв&apos;язку</label>
            <select
              value={edgeType}
              onChange={(e) => setEdgeType(e.target.value)}
              className="w-full px-3 py-2.5 bg-zinc-800 border border-zinc-700 rounded-lg text-white focus:outline-none focus:border-violet-500 transition-colors"
            >
              <option value="acquaintance">Знайомий</option>
              <option value="friend">Друг</option>
              <option value="client">Клієнт</option>
              <option value="partner">Партнер</option>
            </select>
          </div>

          {/* Tags */}
          <div>
            <label className="block text-sm text-zinc-400 mb-1.5">Теги (через кому)</label>
            <input
              type="text"
              value={tagsInput}
              onChange={(e) => setTagsInput(e.target.value)}
              className="w-full px-3 py-2.5 bg-zinc-800 border border-zinc-700 rounded-lg text-white placeholder-zinc-600 focus:outline-none focus:border-violet-500 transition-colors"
              placeholder="B2B, Kyiv, Product"
            />
          </div>

          {/* Submit */}
          <button
            type="submit"
            className="w-full py-2.5 bg-violet-600 hover:bg-violet-500 text-white font-medium rounded-lg transition-colors mt-1"
          >
            Додати до павутини
          </button>
        </form>
      </div>
    </div>
  );
}
