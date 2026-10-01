import { useEffect, useRef, useState } from "react";
import { Eraser } from "lucide-react";

/**
 * A box to sign in with a finger, pen or mouse. Hands back the signature as a
 * cropped, transparent PNG (base64), or "" when the box is empty.
 */
export function SignaturePad({ onChange, disabled = false }: { onChange: (png: string) => void; disabled?: boolean }) {
  const canvas = useRef<HTMLCanvasElement>(null);
  const last = useRef<{ x: number; y: number } | null>(null);
  const [inked, setInked] = useState(false);
  const drew = useRef(false);

  /*
   * The drawing surface is sized to the box as it is shown. Measured once on
   * mount it could be 0 wide - the box appeared inside a panel still being
   * laid out - and every stroke landed nowhere (1 Oct 2026). So it is measured
   * again when a stroke starts, if the box has changed size; before the first
   * stroke there is nothing on it to lose.
   */
  function fit() {
    const c = canvas.current;
    if (!c) return;
    // sharp on a high-density screen
    const ratio = window.devicePixelRatio || 1;
    const w = Math.round(c.clientWidth * ratio);
    const h = Math.round(c.clientHeight * ratio);
    if (c.width === w && c.height === h) return;
    c.width = w;
    c.height = h;
    const ctx = c.getContext("2d")!;
    ctx.scale(ratio, ratio);
    ctx.lineWidth = 2.2;
    ctx.lineCap = "round";
    ctx.lineJoin = "round";
    ctx.strokeStyle = "#0d1a59"; // dark blue, like a pen
  }
  useEffect(fit, []);

  const at = (e: React.PointerEvent<HTMLCanvasElement>) => {
    const r = e.currentTarget.getBoundingClientRect();
    return { x: e.clientX - r.left, y: e.clientY - r.top };
  };

  function clear() {
    const c = canvas.current!;
    c.getContext("2d")!.clearRect(0, 0, c.width, c.height);
    setInked(false);
    drew.current = false;
    onChange("");
  }

  return (
    <div className="space-y-1.5">
      <div className="relative">
        <canvas
          ref={canvas}
          className={`h-36 w-full touch-none rounded-lg border border-dashed bg-white ${disabled ? "pointer-events-none opacity-50" : "border-brand/50"}`}
          onPointerDown={(e) => {
            if (!drew.current) fit();
            e.currentTarget.setPointerCapture(e.pointerId);
            last.current = at(e);
          }}
          onPointerMove={(e) => {
            if (!last.current) return;
            const p = at(e);
            const ctx = e.currentTarget.getContext("2d")!;
            ctx.beginPath();
            ctx.moveTo(last.current.x, last.current.y);
            ctx.lineTo(p.x, p.y);
            ctx.stroke();
            last.current = p;
            drew.current = true;
            setInked(true);
          }}
          onPointerUp={() => {
            last.current = null;
            if (drew.current && canvas.current) onChange(cropped(canvas.current));
          }}
          onPointerLeave={() => (last.current = null)}
        />
        {!inked ? (
          <span className="pointer-events-none absolute inset-0 flex items-center justify-center text-xs text-muted-foreground">
            Sign here
          </span>
        ) : null}
      </div>
      <button type="button" onClick={clear} disabled={!inked || disabled} className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground disabled:opacity-40">
        <Eraser className="size-3.5" /> Clear
      </button>
    </div>
  );
}

/** The inked part of a canvas, with a little margin, as base64 PNG. */
function cropped(c: HTMLCanvasElement): string {
  const ctx = c.getContext("2d")!;
  const { data, width, height } = ctx.getImageData(0, 0, c.width, c.height);
  let x0 = width, y0 = height, x1 = 0, y1 = 0;
  for (let y = 0; y < height; y += 1)
    for (let x = 0; x < width; x += 1)
      if (data[(y * width + x) * 4 + 3]! > 0) {
        if (x < x0) x0 = x;
        if (x > x1) x1 = x;
        if (y < y0) y0 = y;
        if (y > y1) y1 = y;
      }
  if (x1 < x0) return "";
  const pad = 8;
  x0 = Math.max(0, x0 - pad);
  y0 = Math.max(0, y0 - pad);
  x1 = Math.min(width - 1, x1 + pad);
  y1 = Math.min(height - 1, y1 + pad);
  const out = document.createElement("canvas");
  out.width = x1 - x0 + 1;
  out.height = y1 - y0 + 1;
  out.getContext("2d")!.drawImage(c, x0, y0, out.width, out.height, 0, 0, out.width, out.height);
  return out.toDataURL("image/png").split(",")[1]!;
}
