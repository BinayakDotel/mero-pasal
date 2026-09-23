"use client";

import { useConvex } from "convex/react";
import { useEffect, useState } from "react";

/**
 * Is the phone talking to the server right now? Both the Convex WebSocket must be up and the
 * phone must think it's online. The phone's own offline event is instant (Wi-Fi off, airplane
 * mode); the WebSocket catches "Wi-Fi on but no internet", which navigator.onLine misses.
 */
export function useConnection(): boolean {
  const convex = useConvex();
  const [socket, setSocket] = useState(() => convex.connectionState().isWebSocketConnected);
  const [online, setOnline] = useState(() =>
    typeof navigator === "undefined" ? true : navigator.onLine,
  );
  useEffect(
    () => convex.subscribeToConnectionState((s) => setSocket(s.isWebSocketConnected)),
    [convex],
  );
  useEffect(() => {
    const up = () => setOnline(true);
    const down = () => setOnline(false);
    window.addEventListener("online", up);
    window.addEventListener("offline", down);
    return () => {
      window.removeEventListener("online", up);
      window.removeEventListener("offline", down);
    };
  }, []);
  return socket && online;
}
