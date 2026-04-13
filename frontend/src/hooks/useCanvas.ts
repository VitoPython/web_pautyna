"use client";

import { useCallback, useEffect, useState } from "react";
import api from "@/lib/api";
import type { GraphNode, GraphLink } from "@/components/canvas/WebCanvas";
import { useAuthStore } from "@/stores/auth-store";

interface CanvasData {
  nodes: GraphNode[];
  links: GraphLink[];
  isLoading: boolean;
  error: string | null;
  addContact: (data: {
    name: string;
    platform: string;
    profile_id: string;
    tags: string[];
    edgeType: string;
  }) => Promise<void>;
  deleteContact: (id: string) => void;
  reload: () => void;
}

export function useCanvas(): CanvasData {
  const [nodes, setNodes] = useState<GraphNode[]>([]);
  const [links, setLinks] = useState<GraphLink[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const user = useAuthStore((s) => s.user);

  const load = useCallback(async () => {
    try {
      setIsLoading(true);
      setError(null);

      const [contactsRes, canvasRes] = await Promise.all([
        api.get("/contacts"),
        api.get("/canvas"),
      ]);

      const contacts = contactsRes.data;
      const canvas = canvasRes.data;

      // Build nodes: center + contacts
      const graphNodes: GraphNode[] = [
        {
          id: "center",
          name: user?.name || "Ви",
          isCenter: true,
          platform: "center",
        },
      ];

      for (const c of contacts) {
        const mainPlatform = c.platforms?.[0]?.type || "";
        graphNodes.push({
          id: c._id,
          name: c.name,
          avatar_url: c.avatar_url,
          platform: mainPlatform,
          tags: c.tags || [],
          email: c.email || c.extra?.email || "",
          phone: c.phone || c.extra?.phone || "",
          job_title: c.job_title || c.extra?.job_title || "",
          company: c.company || c.extra?.company || "",
        });
      }

      // Build links: center → each contact + canvas edges
      const graphLinks: GraphLink[] = [];

      for (const c of contacts) {
        graphLinks.push({
          source: "center",
          target: c._id,
          type: "acquaintance",
        });
      }

      for (const edge of canvas.edges || []) {
        graphLinks.push({
          id: edge.id,
          source: edge.source,
          target: edge.target,
          type: edge.type || "acquaintance",
          strength: edge.strength,
        });
      }

      setNodes(graphNodes);
      setLinks(graphLinks);
    } catch {
      setError("Не вдалось завантажити мережу");
    } finally {
      setIsLoading(false);
    }
  }, [user?.name]);

  useEffect(() => {
    load();
  }, [load]);

  const addContact = useCallback(
    async (data: {
      name: string;
      platform: string;
      profile_id: string;
      tags: string[];
      edgeType: string;
    }) => {
      const contactPayload = {
        name: data.name,
        platforms: data.profile_id
          ? [{ type: data.platform, profile_id: data.profile_id }]
          : [],
        tags: data.tags,
        position: { x: 0, y: 0 },
      };

      const { data: result } = await api.post("/contacts", contactPayload);
      const contactId = result.id;

      // Add edge from center
      if (data.edgeType !== "acquaintance") {
        await api.post("/canvas/edges", {
          source: "center",
          target: contactId,
          type: data.edgeType,
        });
      }

      await load();
    },
    [load]
  );

  const deleteContact = useCallback(
    async (id: string) => {
      await api.delete(`/contacts/${id}`);
      await load();
    },
    [load]
  );

  return { nodes, links, isLoading, error, addContact, deleteContact, reload: load };
}
