import { useEffect, useRef, useState } from 'react';
import { IMG } from '../gameData';
import { drawScareFace } from '../ghostArt';

interface Props {
  scareKey: number;
  onDone: () => void;
}

/** Full-screen scare. Leads with the photograph — the most realistic asset —
    and falls back to a procedurally drawn face if the image cannot load.
    Plays for exactly one second, then clears. It can never loop. */
export default function Jumpscare({ scareKey, onDone }: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [imgFailed, setImgFailed] = useState(false);
  const onDoneRef = useRef(onDone);
  onDoneRef.current = onDone;

  useEffect(() => {
    if (!scareKey) return;
    setImgFailed(false);
    const t = window.setTimeout(() => {
      onDoneRef.current();
    }, 1200);
    return () => window.clearTimeout(t);
  }, [scareKey]);

  useEffect(() => {
    if (!scareKey) return;
    const cv = canvasRef.current;
    const c = cv?.getContext('2d');
    if (cv && c) drawScareFace(c, cv.width, cv.height, Math.floor(Math.random() * 1e9));
  }, [scareKey, imgFailed]);

  if (!scareKey) return null;

  return (
    <div key={scareKey} className="scare-shake fixed inset-0 z-[95] overflow-hidden" style={{ background: 'radial-gradient(circle at 50% 45%, #3d060b, #050506 75%)' }}>
      {imgFailed ? (
        <canvas ref={canvasRef} width={640} height={800} className="scare-zoom absolute inset-0 h-full w-full object-cover" />
      ) : (
        <img
          src={IMG.scare}
          alt=""
          draggable={false}
          onError={() => setImgFailed(true)}
          className="scare-zoom absolute inset-0 h-full w-full object-cover"
        />
      )}
      <div className="scare-red pointer-events-none absolute inset-0" />
      <div className="scare-static grain pointer-events-none absolute inset-0" />
    </div>
  );
}
