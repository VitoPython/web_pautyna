"use client";

export default function InboxPage() {
  return (
    <div className="flex h-full">
      {/* Chat list */}
      <div className="w-80 border-r border-zinc-800 flex flex-col">
        <div className="p-4 border-b border-zinc-800">
          <h1 className="text-lg font-bold text-white">Inbox</h1>
          <p className="text-zinc-500 text-xs mt-0.5">Повідомлення з усіх платформ</p>
        </div>
        <div className="flex-1 flex items-center justify-center">
          <p className="text-zinc-600 text-sm">Немає повідомлень</p>
        </div>
      </div>
      {/* Chat view */}
      <div className="flex-1 flex items-center justify-center">
        <p className="text-zinc-600">Оберіть чат зліва</p>
      </div>
    </div>
  );
}
