"use client";
import { useEffect, useRef, useCallback } from "react";

interface SilkProps {
  color?: string;
  sheenColor?: string;
  speed?: number;
  scale?: number;
  rotation?: number;
  sheen?: number;
  depth?: number;
  glow?: number;
  noiseIntensity?: number;
  className?: string;
}

function hexToRgb(hex: string): [number, number, number] {
  const result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
  return result && result[1] && result[2] && result[3]
    ? [parseInt(result[1], 16) / 255, parseInt(result[2], 16) / 255, parseInt(result[3], 16) / 255]
    : [0.32, 0.15, 1.0];
}

const vert = `
  attribute vec2 position;
  void main() {
    gl_Position = vec4(position, 0.0, 1.0);
  }
`;

const frag = `
  precision highp float;
  uniform float u_time;
  uniform vec2 u_resolution;
  uniform vec3 u_color;
  uniform vec3 u_sheenColor;
  uniform float u_speed;
  uniform float u_scale;
  uniform float u_rotation;
  uniform float u_sheen;
  uniform float u_depth;
  uniform float u_glow;
  uniform float u_noiseIntensity;

  float hash(vec2 p) {
    p = fract(p * vec2(234.34, 435.345));
    p += dot(p, p + 34.23);
    return fract(p.x * p.y);
  }

  // Smooth sinusoidal silk fold simulation
  float fabricWave(vec2 p, float t) {
    float angle = u_rotation - 0.72; // diagonal direction (top-left to bottom-right)
    float c = cos(angle);
    float s = sin(angle);
    vec2 q = vec2(c * p.x - s * p.y, s * p.x + c * p.y) * u_scale;

    float sp = t * u_speed * 0.14;

    float w1 = sin(q.x * 2.6 + sp * 1.0 + sin(q.y * 1.5 + sp * 0.6) * 1.3);
    float w2 = sin(q.x * 4.8 - sp * 1.2 + cos(q.y * 2.6 - sp * 0.8) * 0.85);
    float w3 = cos(q.x * 8.2 + sp * 1.6 + sin(q.y * 3.8 + sp * 1.0) * 0.45);
    float w4 = sin(q.x * 12.5 - sp * 2.0 + cos(q.y * 6.0) * 0.25) * 0.35;

    return (w1 * 0.55 + w2 * 0.28 + w3 * 0.12 + w4 * 0.05);
  }

  void main() {
    vec2 uv = gl_FragCoord.xy / u_resolution.xy;
    float aspect = u_resolution.x / u_resolution.y;
    vec2 p = uv;
    p.x *= aspect;

    float t = u_time;
    float h = fabricWave(p, t);

    // Calculate surface normal for satin shading
    float eps = 0.005;
    float hx = fabricWave(p + vec2(eps, 0.0), t) - fabricWave(p - vec2(eps, 0.0), t);
    float hy = fabricWave(p + vec2(0.0, eps), t) - fabricWave(p - vec2(0.0, eps), t);
    vec3 normal = normalize(vec3(-hx / (2.0 * eps) * u_depth * 1.7, -hy / (2.0 * eps) * u_depth * 1.7, 1.0));

    // Light source
    vec3 lightDir = normalize(vec3(0.55, 0.75, 0.85));
    vec3 viewDir = vec3(0.0, 0.0, 1.0);
    vec3 halfDir = normalize(lightDir + viewDir);

    float NdotL = dot(normal, lightDir);
    float diff = clamp(NdotL * 0.5 + 0.5, 0.0, 1.0);

    float NdotV = clamp(dot(normal, viewDir), 0.0, 1.0);
    float rim = pow(1.0 - NdotV, 2.8) * u_sheen;

    float NdotH = max(dot(normal, halfDir), 0.0);
    float spec = pow(NdotH, 16.0) * u_sheen * 1.6;
    float broadSpec = pow(NdotH, 5.0) * 0.35;

    // Palette: deep shadows, royal purple body, luminous violet crests
    vec3 shadowCol = u_color * 0.06;
    vec3 bodyCol = u_color * 0.72;
    vec3 litCol = mix(u_color * 1.7, vec3(0.68, 0.52, 1.0), 0.42);

    float fold = h * 0.5 + 0.5;
    vec3 col = mix(shadowCol, bodyCol, smoothstep(0.18, 0.72, fold * diff));
    col = mix(col, litCol, smoothstep(0.38, 0.95, diff + rim * 0.5));

    // Specular glossy highlights on the folds
    col += u_sheenColor * (spec + broadSpec * 0.25) * (0.4 + 0.6 * fold);
    col += u_color * rim * u_glow * 0.7;

    // Fine woven film grain texture (noiseIntensity)
    float grain = (hash(gl_FragCoord.xy * 0.9 + fract(t * 0.001)) - 0.5) * u_noiseIntensity * 0.05;
    col += vec3(grain);

    gl_FragColor = vec4(clamp(col, 0.0, 1.0), 1.0);
  }
`;

export default function Silk({
  color = "#5227FF",
  sheenColor = "#ffffff",
  speed = 5,
  scale = 1,
  rotation = 0,
  sheen = 0.5,
  depth = 0.5,
  glow = 0.3,
  noiseIntensity = 1.5,
  className = "",
}: SilkProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const animRef = useRef<number>(0);
  const startTimeRef = useRef(Date.now());

  const compile = useCallback((gl: WebGLRenderingContext, type: number, src: string) => {
    const s = gl.createShader(type)!;
    gl.shaderSource(s, src);
    gl.compileShader(s);
    return s;
  }, []);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const gl = canvas.getContext("webgl", { alpha: false, antialias: false, premultipliedAlpha: false });
    if (!gl) return;

    const vs = compile(gl, gl.VERTEX_SHADER, vert);
    const fs = compile(gl, gl.FRAGMENT_SHADER, frag);
    const prog = gl.createProgram()!;
    gl.attachShader(prog, vs);
    gl.attachShader(prog, fs);
    gl.linkProgram(prog);
    gl.useProgram(prog);

    const buf = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, buf);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 1, -1, -1, 1, 1, 1]), gl.STATIC_DRAW);
    const posLoc = gl.getAttribLocation(prog, "position");
    gl.enableVertexAttribArray(posLoc);
    gl.vertexAttribPointer(posLoc, 2, gl.FLOAT, false, 0, 0);

    const isMobile = window.innerWidth < 768;
    const maxDpr = isMobile ? 1.0 : 1.5;

    const resize = () => {
      const dpr = Math.min(window.devicePixelRatio || 1, maxDpr);
      canvas.width = canvas.offsetWidth * dpr;
      canvas.height = canvas.offsetHeight * dpr;
      gl.viewport(0, 0, canvas.width, canvas.height);
    };
    resize();
    const ro = new ResizeObserver(resize);
    ro.observe(canvas);

    const [cr, cg, cb] = hexToRgb(color);
    const [sr, sg, sb] = hexToRgb(sheenColor);
    const u = (name: string) => gl.getUniformLocation(prog, name);

    const render = () => {
      const elapsed = (Date.now() - startTimeRef.current) / 1000;
      gl.uniform1f(u("u_time"), elapsed);
      gl.uniform2f(u("u_resolution"), canvas.width, canvas.height);
      gl.uniform3f(u("u_color"), cr, cg, cb);
      gl.uniform3f(u("u_sheenColor"), sr, sg, sb);
      gl.uniform1f(u("u_speed"), speed);
      gl.uniform1f(u("u_scale"), scale);
      gl.uniform1f(u("u_rotation"), rotation);
      gl.uniform1f(u("u_sheen"), sheen);
      gl.uniform1f(u("u_depth"), depth);
      gl.uniform1f(u("u_glow"), glow);
      gl.uniform1f(u("u_noiseIntensity"), noiseIntensity);

      gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
      animRef.current = requestAnimationFrame(render);
    };
    animRef.current = requestAnimationFrame(render);

    // Static without cursor listeners
    return () => {
      cancelAnimationFrame(animRef.current);
      ro.disconnect();
    };
  }, [color, sheenColor, speed, scale, rotation, sheen, depth, glow, noiseIntensity, compile]);

  return (
    <canvas
      ref={canvasRef}
      className={`h-full w-full ${className}`}
      style={{ display: "block" }}
      aria-hidden="true"
    />
  );
}
