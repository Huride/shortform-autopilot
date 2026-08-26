'use client';
import { useRef, useState } from 'react';

/** 클릭 재생 플레이어 — 하나가 재생되면 다른 것은 정지한다. */
export default function Vid({ src, poster, radius = 12, fit = 'cover' }: {
  src: string; poster: string; radius?: number; fit?: 'cover' | 'contain';
}) {
  const ref = useRef<HTMLVideoElement>(null);
  const [playing, setPlaying] = useState(false);
  const toggle = () => {
    const v = ref.current;
    if (!v) return;
    if (v.paused) {
      document.querySelectorAll('video').forEach((o) => { if (o !== v) o.pause(); });
      v.play();
    } else v.pause();
  };
  return (
    <span className={`vwrap${playing ? ' playing' : ''}`} style={{ borderRadius: radius, overflow: 'hidden', position: 'relative', display: 'block', width: '100%', height: '100%' }}>
      <video
        ref={ref} src={src} poster={poster} preload="metadata" playsInline
        onClick={toggle}
        onPlay={() => setPlaying(true)} onPause={() => setPlaying(false)}
        onEnded={() => { if (ref.current) ref.current.currentTime = 0; setPlaying(false); }}
        style={{ width: '100%', height: '100%', objectFit: fit, display: 'block', background: '#05080F' }}
      />
      <button className="pvbtn" aria-label="재생" onClick={(e) => { e.stopPropagation(); toggle(); }}>▶</button>
    </span>
  );
}
