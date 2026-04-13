"use client";

export default function NotificationsPage() {
  return (
    <div className="p-6">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-white">Сповіщення</h1>
          <p className="text-zinc-500 text-sm mt-1">Всі ваші нотифікації</p>
        </div>
        <button className="px-4 py-2 text-zinc-400 hover:text-white text-sm transition-colors">
          Позначити всі як прочитані
        </button>
      </div>
      <div className="flex items-center justify-center h-64 border border-dashed border-zinc-800 rounded-xl">
        <p className="text-zinc-600">Немає нових сповіщень</p>
      </div>
    </div>
  );
}
