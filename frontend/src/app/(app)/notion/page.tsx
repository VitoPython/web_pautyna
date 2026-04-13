"use client";

export default function NotionPage() {
  return (
    <div className="p-6">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-white">Notion</h1>
          <p className="text-zinc-500 text-sm mt-1">Ваші нотатки та сторінки</p>
        </div>
        <button className="px-4 py-2 bg-violet-600 hover:bg-violet-500 text-white text-sm font-medium rounded-lg transition-colors">
          + Нова сторінка
        </button>
      </div>
      <div className="flex items-center justify-center h-64 border border-dashed border-zinc-800 rounded-xl">
        <p className="text-zinc-600">Створіть першу сторінку</p>
      </div>
    </div>
  );
}
