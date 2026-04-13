"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import dynamic from "next/dynamic";
import * as THREE from "three";

/* eslint-disable @typescript-eslint/no-explicit-any */

const ForceGraph3D = dynamic(() => import("react-force-graph-3d"), {
  ssr: false,
});

export interface GraphNode {
  id: string;
  name: string;
  avatar_url?: string;
  platform?: string;
  isCenter?: boolean;
  tags?: string[];
  email?: string;
  phone?: string;
  job_title?: string;
  company?: string;
  color?: string;
  x?: number;
  y?: number;
  z?: number;
}

export interface GraphLink {
  id?: string;
  source: string | any;
  target: string | any;
  type?: string;
  strength?: number;
}

interface WebCanvasProps {
  nodes: GraphNode[];
  links: GraphLink[];
  onNodeClick?: (node: GraphNode) => void;
  onBackgroundClick?: () => void;
}

const PLATFORM_COLORS: Record<string, string> = {
  linkedin: "#4DA3FF",
  instagram: "#FF6B9D",
  center: "#C084FC",
};

const EDGE_COLORS: Record<string, string> = {
  partner: "#A78BFA",
  client: "#34D399",
  friend: "#60A5FA",
  acquaintance: "#505068",
};

// ── Glow texture for nebula sprites ──
function createGlowTexture(color: string, size: number): THREE.Texture {
  const canvas = document.createElement("canvas");
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext("2d")!;
  const cx = size / 2;

  const gradient = ctx.createRadialGradient(cx, cx, 0, cx, cx, cx);
  gradient.addColorStop(0, color + "FF");
  gradient.addColorStop(0.15, color + "CC");
  gradient.addColorStop(0.4, color + "55");
  gradient.addColorStop(0.7, color + "18");
  gradient.addColorStop(1, color + "00");
  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, size, size);

  const texture = new THREE.CanvasTexture(canvas);
  texture.needsUpdate = true;
  return texture;
}

// ── Draw node on canvas (with optional avatar image) ──
function drawNode(canvas: HTMLCanvasElement, node: GraphNode, avatarImg?: HTMLImageElement) {
  const size = canvas.width;
  const ctx = canvas.getContext("2d")!;
  const cx = size / 2;
  const baseColor = node.isCenter
    ? "#C084FC"
    : PLATFORM_COLORS[node.platform || ""] || "#6B7280";

  ctx.clearRect(0, 0, size, size);

  // Outer glow aura
  const aura = ctx.createRadialGradient(cx, cx, 0, cx, cx, cx * 0.85);
  aura.addColorStop(0, baseColor + "50");
  aura.addColorStop(0.25, baseColor + "25");
  aura.addColorStop(0.5, baseColor + "10");
  aura.addColorStop(1, baseColor + "00");
  ctx.fillStyle = aura;
  ctx.fillRect(0, 0, size, size);

  const coreRadius = node.isCenter ? size * 0.16 : size * 0.15;

  if (avatarImg) {
    // Draw avatar photo in circle
    ctx.save();
    ctx.beginPath();
    ctx.arc(cx, cx, coreRadius, 0, Math.PI * 2);
    ctx.clip();
    ctx.drawImage(avatarImg, cx - coreRadius, cx - coreRadius, coreRadius * 2, coreRadius * 2);
    ctx.restore();

    // Glow ring around photo
    ctx.beginPath();
    ctx.arc(cx, cx, coreRadius + 3, 0, Math.PI * 2);
    ctx.strokeStyle = baseColor + "AA";
    ctx.lineWidth = 3;
    ctx.stroke();
  } else {
    // Planet gradient (no photo)
    const coreGrad = ctx.createRadialGradient(
      cx - coreRadius * 0.3, cx - coreRadius * 0.35, 0, cx, cx, coreRadius
    );
    coreGrad.addColorStop(0, lightenColor(baseColor, 80));
    coreGrad.addColorStop(0.4, baseColor);
    coreGrad.addColorStop(1, darkenColor(baseColor, 50));
    ctx.beginPath();
    ctx.arc(cx, cx, coreRadius, 0, Math.PI * 2);
    ctx.fillStyle = coreGrad;
    ctx.fill();

    // Glass highlight
    const hl = ctx.createRadialGradient(cx - coreRadius * 0.25, cx - coreRadius * 0.3, 0, cx, cx, coreRadius * 0.75);
    hl.addColorStop(0, "rgba(255,255,255,0.45)");
    hl.addColorStop(0.4, "rgba(255,255,255,0.08)");
    hl.addColorStop(1, "rgba(255,255,255,0)");
    ctx.beginPath();
    ctx.arc(cx, cx, coreRadius * 0.85, 0, Math.PI * 2);
    ctx.fillStyle = hl;
    ctx.fill();

    // Ring
    ctx.beginPath();
    ctx.arc(cx, cx, coreRadius + 3, 0, Math.PI * 2);
    ctx.strokeStyle = baseColor + "80";
    ctx.lineWidth = 2.5;
    ctx.stroke();

    // Letter
    const letter = node.isCenter ? "✦" : node.name.charAt(0).toUpperCase();
    ctx.fillStyle = "#FFFFFF";
    ctx.font = `bold ${node.isCenter ? 52 : 44}px sans-serif`;
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.shadowColor = baseColor;
    ctx.shadowBlur = 16;
    ctx.fillText(letter, cx, cx);
    ctx.shadowBlur = 0;
  }

  // Name label below
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  if (!node.isCenter) {
    ctx.fillStyle = "rgba(255,255,255,0.9)";
    ctx.font = "bold 28px sans-serif";
    ctx.shadowColor = "rgba(0,0,0,0.9)";
    ctx.shadowBlur = 8;
    ctx.fillText(node.name, cx, cx + coreRadius + 30);
    ctx.shadowBlur = 0;

    // Job title / company subtitle
    const subtitle = [node.job_title, node.company].filter(Boolean).join(" · ");
    if (subtitle) {
      ctx.fillStyle = "rgba(255,255,255,0.5)";
      ctx.font = "20px sans-serif";
      ctx.fillText(subtitle.length > 30 ? subtitle.slice(0, 30) + "…" : subtitle, cx, cx + coreRadius + 52);
    }
  } else {
    ctx.fillStyle = "rgba(200,180,255,0.8)";
    ctx.font = "bold 24px sans-serif";
    ctx.shadowColor = "rgba(0,0,0,0.9)";
    ctx.shadowBlur = 6;
    ctx.fillText("Ви", cx, cx + coreRadius + 32);
    ctx.shadowBlur = 0;
  }
}

function createNodeTexture(node: GraphNode): THREE.CanvasTexture {
  const canvas = document.createElement("canvas");
  canvas.width = 512;
  canvas.height = 512;
  drawNode(canvas, node);

  const texture = new THREE.CanvasTexture(canvas);
  texture.needsUpdate = true;

  // If avatar_url exists, load image async and redraw
  if (node.avatar_url) {
    const img = new Image();
    img.crossOrigin = "anonymous";
    img.onload = () => {
      drawNode(canvas, node, img);
      texture.needsUpdate = true;
    };
    img.src = node.avatar_url;
  }

  return texture;
}

function lightenColor(hex: string, amount: number): string {
  const num = parseInt(hex.replace("#", ""), 16);
  const r = Math.min(255, (num >> 16) + amount);
  const g = Math.min(255, ((num >> 8) & 0x00ff) + amount);
  const b = Math.min(255, (num & 0x0000ff) + amount);
  return `rgb(${r},${g},${b})`;
}

function darkenColor(hex: string, amount: number): string {
  const num = parseInt(hex.replace("#", ""), 16);
  const r = Math.max(0, (num >> 16) - amount);
  const g = Math.max(0, ((num >> 8) & 0x00ff) - amount);
  const b = Math.max(0, (num & 0x0000ff) - amount);
  return `rgb(${r},${g},${b})`;
}

// ── Starfield: bright, sharp, multi-layer ──
function createStarfield(): THREE.Group {
  const group = new THREE.Group();

  // Layer 1: distant small stars
  group.add(makeStarLayer(5000, 1000, 3000, 1.8, 1.0));
  // Layer 2: mid-range medium stars
  group.add(makeStarLayer(1500, 500, 1500, 3.0, 1.0));
  // Layer 3: close bright stars
  group.add(makeStarLayer(300, 400, 900, 5.0, 1.0));

  return group;
}

function makeStarLayer(
  count: number,
  minR: number,
  maxR: number,
  size: number,
  opacity: number
): THREE.Points {
  const positions = new Float32Array(count * 3);
  const colors = new Float32Array(count * 3);

  for (let i = 0; i < count; i++) {
    const i3 = i * 3;
    const radius = minR + Math.random() * (maxR - minR);
    const theta = Math.random() * Math.PI * 2;
    const phi = Math.acos(2 * Math.random() - 1);

    positions[i3] = radius * Math.sin(phi) * Math.cos(theta);
    positions[i3 + 1] = radius * Math.sin(phi) * Math.sin(theta);
    positions[i3 + 2] = radius * Math.cos(phi);

    const temp = Math.random();
    if (temp > 0.92) {
      // bright violet
      colors[i3] = 0.85; colors[i3 + 1] = 0.55; colors[i3 + 2] = 1.0;
    } else if (temp > 0.78) {
      // ice blue
      colors[i3] = 0.6; colors[i3 + 1] = 0.85; colors[i3 + 2] = 1.0;
    } else if (temp > 0.6) {
      // warm yellow
      colors[i3] = 1.0; colors[i3 + 1] = 0.92; colors[i3 + 2] = 0.7;
    } else if (temp > 0.4) {
      // pure white
      colors[i3] = 1.0; colors[i3 + 1] = 1.0; colors[i3 + 2] = 1.0;
    } else {
      // soft blue-white
      colors[i3] = 0.85; colors[i3 + 1] = 0.9; colors[i3 + 2] = 1.0;
    }
  }

  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute("position", new THREE.BufferAttribute(positions, 3));
  geometry.setAttribute("color", new THREE.BufferAttribute(colors, 3));

  const material = new THREE.PointsMaterial({
    size,
    vertexColors: true,
    transparent: true,
    opacity,
    sizeAttenuation: true,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
  });

  return new THREE.Points(geometry, material);
}

// ── Nebula clouds: brighter and more vivid ──
function createNebula(): THREE.Group {
  const group = new THREE.Group();

  const nebulaConfigs = [
    { color: "#7C3AED", x: 350, y: 200, z: -500, scale: 500, opacity: 0.12 },
    { color: "#2563EB", x: -500, y: -200, z: 350, scale: 550, opacity: 0.10 },
    { color: "#EC4899", x: 250, y: -400, z: 250, scale: 450, opacity: 0.08 },
    { color: "#059669", x: -300, y: 450, z: -300, scale: 400, opacity: 0.06 },
    { color: "#8B5CF6", x: 0, y: 0, z: -600, scale: 700, opacity: 0.05 },
    { color: "#F59E0B", x: 500, y: -100, z: -200, scale: 350, opacity: 0.04 },
  ];

  for (const cfg of nebulaConfigs) {
    const texture = createGlowTexture(cfg.color, 512);
    const material = new THREE.SpriteMaterial({
      map: texture,
      transparent: true,
      opacity: cfg.opacity,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
    });
    const sprite = new THREE.Sprite(material);
    sprite.position.set(cfg.x, cfg.y, cfg.z);
    sprite.scale.set(cfg.scale, cfg.scale, 1);
    group.add(sprite);
  }

  return group;
}

export default function WebCanvas({
  nodes,
  links,
  onNodeClick,
  onBackgroundClick,
}: WebCanvasProps) {
  const fgRef = useRef<any>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const [dimensions, setDimensions] = useState({ width: 800, height: 600 });
  const sceneInitialized = useRef(false);

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const observer = new ResizeObserver((entries) => {
      const { width, height } = entries[0].contentRect;
      setDimensions({ width, height });
    });
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  // Add starfield + nebula to scene + remove camera limits
  useEffect(() => {
    const fg = fgRef.current;
    if (!fg || sceneInitialized.current) return;
    const scene = fg.scene?.();
    if (!scene) return;

    scene.add(createStarfield());
    scene.add(createNebula());

    // No fog — keep stars sharp at any distance
    // Remove camera far plane limit so user can zoom freely
    const camera = fg.camera?.();
    if (camera) {
      camera.far = 50000;
      camera.updateProjectionMatrix();
    }

    // Remove orbit controls distance limits
    const controls = fg.controls?.();
    if (controls) {
      controls.minDistance = 10;
      controls.maxDistance = 20000;
    }

    sceneInitialized.current = true;
  });

  const graphData = useMemo(
    () => ({
      nodes: nodes.map((n) => ({ ...n })),
      links: links.map((l) => ({ ...l })),
    }),
    [nodes, links]
  );

  const textureCache = useRef<Map<string, THREE.SpriteMaterial>>(new Map());

  const nodeThreeObject = useCallback((node: any) => {
    const n = node as GraphNode;
    const key = `${n.id}-${n.name}-${n.platform}-${n.isCenter}`;
    let material = textureCache.current.get(key);
    if (!material) {
      const texture = createNodeTexture(n);
      material = new THREE.SpriteMaterial({
        map: texture,
        transparent: true,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
      });
      textureCache.current.set(key, material);
    }
    const sprite = new THREE.Sprite(material);
    const scale = n.isCenter ? 28 : 22;
    sprite.scale.set(scale, scale, 1);
    return sprite;
  }, []);

  const handleNodeClick = useCallback(
    (node: any) => {
      const n = node as GraphNode;
      if (onNodeClick) onNodeClick(n);

      const fg = fgRef.current;
      if (fg?.cameraPosition) {
        const distance = 80;
        fg.cameraPosition(
          { x: (n.x || 0) + distance, y: (n.y || 0) + distance * 0.3, z: (n.z || 0) + distance },
          { x: n.x || 0, y: n.y || 0, z: n.z || 0 },
          1000
        );
      }
    },
    [onNodeClick]
  );

  const linkColor = useCallback((link: any) => {
    return EDGE_COLORS[(link as GraphLink).type || "acquaintance"] || EDGE_COLORS.acquaintance;
  }, []);

  const linkWidth = useCallback((link: any) => {
    return (link as GraphLink).type === "acquaintance" ? 0.4 : 1.2;
  }, []);

  const nodeLabel = useCallback((node: any) => {
    const n = node as GraphNode;
    if (n.isCenter) return "Ви (центр мережі)";
    const platform =
      n.platform === "linkedin" ? "LinkedIn" : n.platform === "instagram" ? "Instagram" : "";
    const tags = n.tags?.length ? ` · ${n.tags.join(", ")}` : "";
    return `${n.name}${platform ? ` · ${platform}` : ""}${tags}`;
  }, []);

  return (
    <div ref={containerRef} className="w-full h-full relative">
      {typeof window !== "undefined" && (
        <ForceGraph3D
          ref={fgRef}
          width={dimensions.width}
          height={dimensions.height}
          graphData={graphData}
          nodeThreeObject={nodeThreeObject}
          nodeLabel={nodeLabel}
          onNodeClick={handleNodeClick}
          onBackgroundClick={onBackgroundClick}
          linkColor={linkColor}
          linkWidth={linkWidth}
          linkOpacity={0.35}
          linkDirectionalParticles={2}
          linkDirectionalParticleWidth={1.0}
          linkDirectionalParticleSpeed={0.004}
          backgroundColor="#020010"
          showNavInfo={false}
          enableNodeDrag={true}
          enableNavigationControls={true}
          d3AlphaDecay={0.015}
          d3VelocityDecay={0.25}
          warmupTicks={50}
          cooldownTicks={100}
        />
      )}
    </div>
  );
}
