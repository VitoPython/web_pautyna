"use client";

import { useState } from "react";

interface Props {
  url?: string;
  name: string;
  size?: "sm" | "lg";
}

const SIZE_CLASSES = {
  sm: "w-8 h-8 text-xs",
  lg: "w-10 h-10 text-sm",
};

export default function ChatAvatar({ url, name, size = "lg" }: Props) {
  const [failed, setFailed] = useState(false);
  const cls = SIZE_CLASSES[size];

  // No URL, or the image failed (likely a 404 from the proxy when the
  // Unipile attendee has no profile picture) → show the initial letter.
  if (!url || failed) {
    return (
      <div className={`${cls} rounded-full bg-zinc-800 flex items-center justify-center font-bold text-white shrink-0`}>
        {name.charAt(0).toUpperCase()}
      </div>
    );
  }

  return (
    <img
      src={url}
      alt=""
      onError={() => setFailed(true)}
      className={`${cls} rounded-full object-cover shrink-0 bg-zinc-800`}
      referrerPolicy="no-referrer"
    />
  );
}
