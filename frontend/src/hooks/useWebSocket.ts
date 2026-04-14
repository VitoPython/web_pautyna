"use client";

import { useEffect, useRef } from "react";

type WSEventHandler = (event: { type: string; payload: unknown }) => void;

export function useWebSocket(handler: WSEventHandler, enabled: boolean = true) {
  const handlerRef = useRef(handler);
  handlerRef.current = handler;

  useEffect(() => {
    if (!enabled) return;

    let ws: WebSocket | null = null;
    let reconnectTimer: ReturnType<typeof setTimeout> | null = null;
    let closed = false;

    const connect = () => {
      const wsUrl = `${window.location.protocol === "https:" ? "wss:" : "ws:"}//${window.location.host}/ws`;
      ws = new WebSocket(wsUrl);

      ws.onmessage = (e) => {
        try {
          const data = JSON.parse(e.data);
          handlerRef.current(data);
        } catch {
          // ignore
        }
      };

      ws.onclose = () => {
        if (closed) return;
        // reconnect after 3s
        reconnectTimer = setTimeout(connect, 3000);
      };

      ws.onerror = () => {
        ws?.close();
      };
    };

    connect();

    return () => {
      closed = true;
      if (reconnectTimer) clearTimeout(reconnectTimer);
      ws?.close();
    };
  }, [enabled]);
}
