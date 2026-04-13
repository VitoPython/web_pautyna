"use client";

import { useState } from "react";
import WebCanvas from "@/components/canvas/WebCanvas";
import ContactPanel from "@/components/canvas/ContactPanel";
import AddContactModal from "@/components/canvas/AddContactModal";
import type { GraphNode } from "@/components/canvas/WebCanvas";
import { useCanvas } from "@/hooks/useCanvas";

export default function WebPage() {
  const { nodes, links, isLoading, error, addContact, deleteContact } = useCanvas();
  const [selectedNode, setSelectedNode] = useState<GraphNode | null>(null);
  const [showAddModal, setShowAddModal] = useState(false);

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-full bg-zinc-950">
        <div className="flex flex-col items-center gap-3">
          <div className="w-8 h-8 border-2 border-violet-400 border-t-transparent rounded-full animate-spin" />
          <span className="text-zinc-500 text-sm">Завантаження павутини...</span>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex items-center justify-center h-full bg-zinc-950">
        <div className="text-center">
          <p className="text-red-400 mb-2">{error}</p>
          <button
            onClick={() => window.location.reload()}
            className="text-violet-400 hover:text-violet-300 text-sm"
          >
            Спробувати знову
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="flex h-full">
      {/* Canvas */}
      <div className="flex-1 min-w-0 relative">
        <WebCanvas
          nodes={nodes}
          links={links}
          onNodeClick={(node) => setSelectedNode(node)}
          onBackgroundClick={() => setSelectedNode(null)}
        />

        {/* Floating toolbar */}
        <div className="absolute top-4 left-4 flex gap-2">
          <button
            onClick={() => setShowAddModal(true)}
            className="flex items-center gap-2 px-4 py-2 bg-violet-600 hover:bg-violet-500 text-white text-sm font-medium rounded-lg shadow-lg transition-colors"
          >
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} className="w-4 h-4">
              <line x1="12" y1="5" x2="12" y2="19" />
              <line x1="5" y1="12" x2="19" y2="12" />
            </svg>
            Додати контакт
          </button>
        </div>

        {/* Help hint */}
        <div className="absolute top-4 right-4 text-xs text-zinc-600 space-y-1 select-none pointer-events-none">
          <p>Лівий клік + тягнути = обертати</p>
          <p>Скрол = зум</p>
          <p>Правий клік + тягнути = переміщення</p>
        </div>

        {/* Stats */}
        <div className="absolute bottom-4 left-4 flex gap-3 text-xs text-zinc-500">
          <span>{nodes.length - 1} контактів</span>
          <span>·</span>
          <span>{links.length} зв&apos;язків</span>
        </div>
      </div>

      {/* Contact Panel */}
      {selectedNode && (
        <ContactPanel
          contact={selectedNode}
          onClose={() => setSelectedNode(null)}
          onDelete={(id) => {
            deleteContact(id);
            setSelectedNode(null);
          }}
        />
      )}

      {/* Add Contact Modal */}
      {showAddModal && (
        <AddContactModal
          onAdd={async (data) => {
            await addContact(data);
            setShowAddModal(false);
          }}
          onClose={() => setShowAddModal(false)}
        />
      )}
    </div>
  );
}
