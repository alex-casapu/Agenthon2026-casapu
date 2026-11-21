"use client";

import { useEffect, useRef, useState } from "react";
import { VIDEOS, videoSlot } from "@/lib/scenario/videos";

/**
 * Cross-fading video layer behind the slide. A missing file shows a labelled placeholder instead,
 * so the deck is presentable before the footage exists.
 */
export default function Backdrop({ bg }: { bg?: string }) {
  const refs = useRef<Record<string, HTMLVideoElement | null>>({});
  const [broken, setBroken] = useState<Record<string, boolean>>({});

  useEffect(() => {
    const timers: ReturnType<typeof setTimeout>[] = [];
    for (const v of VIDEOS) {
      const el = refs.current[v.key];
      if (!el) continue;
      if (v.key === bg) {
        el.currentTime = 0;
        el.play().catch(() => {});
      } else if (!el.paused) {
        timers.push(setTimeout(() => el.pause(), 1100));
      }
    }
    return () => timers.forEach(clearTimeout);
  }, [bg]);

  const slot = videoSlot(bg);
  const showPlaceholder = !!bg && (broken[bg] || !slot?.ready);

  return (
    <div className="sl-backdrop" aria-hidden>
      {VIDEOS.filter((v) => v.ready).map((v) => (
        <video
          key={v.key}
          ref={(el) => { refs.current[v.key] = el; }}
          className={v.key === bg && !broken[v.key] ? "on" : ""}
          src={`/slides/v/${v.key}.mp4`}
          muted loop playsInline preload="auto" disablePictureInPicture disableRemotePlayback
          onError={() => setBroken((b) => ({ ...b, [v.key]: true }))}
        />
      ))}
      <div className={`sl-ph${showPlaceholder ? " on" : ""}`}>
        {slot && <span className="sl-ph-tag">VIDEO PLACEHOLDER · {slot.use}<br /><em>{slot.brief}</em></span>}
      </div>
      <div className={`sl-shade${bg ? " on" : ""}`} />
    </div>
  );
}
