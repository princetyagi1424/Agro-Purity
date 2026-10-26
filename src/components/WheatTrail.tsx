import { useEffect, useRef } from 'react';

/**
 * Decorative golden wheat-kernel cursor trail.
 * Disabled on touch devices and when prefers-reduced-motion is set.
 * pointer-events: none — never blocks UI.
 */
export function WheatTrail() {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const reduce =
      typeof window !== 'undefined' &&
      window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    const coarse =
      typeof window !== 'undefined' &&
      window.matchMedia('(pointer: coarse)').matches;
    if (reduce || coarse) return;

    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    type Particle = {
      x: number;
      y: number;
      vx: number;
      vy: number;
      rot: number;
      vr: number;
      life: number;
      maxLife: number;
      size: number;
      hue: number;
    };

    let particles: Particle[] = [];
    let raf = 0;
    let lastX = 0;
    let lastY = 0;
    let lastSpawn = 0;
    let running = true;

    const resize = () => {
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      canvas.width = Math.floor(window.innerWidth * dpr);
      canvas.height = Math.floor(window.innerHeight * dpr);
      canvas.style.width = `${window.innerWidth}px`;
      canvas.style.height = `${window.innerHeight}px`;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    };
    resize();

    const spawn = (x: number, y: number) => {
      if (particles.length > 48) particles.shift();
      const angle = Math.random() * Math.PI * 2;
      const speed = 0.15 + Math.random() * 0.55;
      particles.push({
        x,
        y,
        vx: Math.cos(angle) * speed,
        vy: Math.sin(angle) * speed + 0.2,
        rot: Math.random() * Math.PI * 2,
        vr: (Math.random() - 0.5) * 0.12,
        life: 0,
        maxLife: 0.55 + Math.random() * 0.45,
        size: 3.2 + Math.random() * 3.8,
        hue: 38 + Math.random() * 18,
      });
    };

    const onMove = (e: MouseEvent) => {
      const now = performance.now();
      const dx = e.clientX - lastX;
      const dy = e.clientY - lastY;
      const dist = Math.hypot(dx, dy);
      lastX = e.clientX;
      lastY = e.clientY;
      if (dist < 6 || now - lastSpawn < 28) return;
      lastSpawn = now;
      spawn(e.clientX, e.clientY);
      if (dist > 28) spawn(e.clientX - dx * 0.4, e.clientY - dy * 0.4);
    };

    const drawKernel = (p: Particle, alpha: number) => {
      ctx.save();
      ctx.translate(p.x, p.y);
      ctx.rotate(p.rot);
      ctx.globalAlpha = alpha;
      ctx.beginPath();
      ctx.ellipse(0, 0, p.size * 0.55, p.size, 0, 0, Math.PI * 2);
      const g = ctx.createLinearGradient(-p.size, 0, p.size, 0);
      g.addColorStop(0, `hsla(${p.hue},55%,42%,1)`);
      g.addColorStop(0.45, `hsla(${p.hue + 8},70%,62%,1)`);
      g.addColorStop(1, `hsla(${p.hue - 4},50%,38%,1)`);
      ctx.fillStyle = g;
      ctx.fill();
      ctx.strokeStyle = `hsla(${p.hue},40%,28%,0.35)`;
      ctx.lineWidth = 0.6;
      ctx.stroke();
      ctx.restore();
    };

    let lastTs = performance.now();
    const tick = (ts: number) => {
      if (!running) return;
      const dt = Math.min(0.05, (ts - lastTs) / 1000);
      lastTs = ts;
      ctx.clearRect(0, 0, window.innerWidth, window.innerHeight);
      particles = particles.filter((p) => {
        p.life += dt;
        p.x += p.vx;
        p.y += p.vy;
        p.rot += p.vr;
        p.vy += 0.012;
        const t = p.life / p.maxLife;
        if (t >= 1) return false;
        const alpha = t < 0.15 ? t / 0.15 : 1 - (t - 0.15) / 0.85;
        drawKernel(p, Math.max(0, alpha * 0.85));
        return true;
      });
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);

    window.addEventListener('mousemove', onMove, { passive: true });
    window.addEventListener('resize', resize);
    return () => {
      running = false;
      cancelAnimationFrame(raf);
      window.removeEventListener('mousemove', onMove);
      window.removeEventListener('resize', resize);
    };
  }, []);

  return (
    <canvas
      ref={canvasRef}
      className="wheat-trail-canvas"
      aria-hidden="true"
    />
  );
}
