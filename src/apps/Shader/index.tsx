import { useState, useCallback, useRef, useEffect } from 'react';
import type { AppComponentProps } from '@/shared/types';
import './Shader.css';

/* ── Default Shader (tdG3Rd – fBm fire warp) ──────────── */

const DEFAULT_SHADER = `// Base warp fBM – from shadertoy.com/view/tdG3Rd
// by trinketMage

float colormap_red(float x) {
    if (x < 0.0) return 54.0 / 255.0;
    else if (x < 20049.0 / 82979.0) return (829.79 * x + 54.51) / 255.0;
    else return 1.0;
}

float colormap_green(float x) {
    if (x < 20049.0 / 82979.0) return 0.0;
    else if (x < 327013.0 / 810990.0)
        return (8546482679670.0 / 10875673217.0 * x - 2064961390770.0 / 10875673217.0) / 255.0;
    else if (x <= 1.0)
        return (103806720.0 / 483977.0 * x + 19607415.0 / 483977.0) / 255.0;
    else return 1.0;
}

float colormap_blue(float x) {
    if (x < 0.0) return 54.0 / 255.0;
    else if (x < 7249.0 / 82979.0) return (829.79 * x + 54.51) / 255.0;
    else if (x < 20049.0 / 82979.0) return 127.0 / 255.0;
    else if (x < 327013.0 / 810990.0)
        return (792.02249341361393720147485376583 * x - 64.364790735602331034989206222672) / 255.0;
    else return 1.0;
}

vec4 colormap(float x) {
    return vec4(colormap_red(x), colormap_green(x), colormap_blue(x), 1.0);
}

float rand(vec2 n) {
    return fract(sin(dot(n, vec2(12.9898, 4.1414))) * 43758.5453);
}

float noise(vec2 p) {
    vec2 ip = floor(p);
    vec2 u = fract(p);
    u = u * u * (3.0 - 2.0 * u);
    float res = mix(
        mix(rand(ip), rand(ip + vec2(1.0, 0.0)), u.x),
        mix(rand(ip + vec2(0.0, 1.0)), rand(ip + vec2(1.0, 1.0)), u.x), u.y);
    return res * res;
}

const mat2 mtx = mat2(0.80, 0.60, -0.60, 0.80);

float fbm(vec2 p) {
    float f = 0.0;
    f += 0.500000 * noise(p + iTime); p = mtx * p * 2.02;
    f += 0.031250 * noise(p);         p = mtx * p * 2.01;
    f += 0.250000 * noise(p);         p = mtx * p * 2.03;
    f += 0.125000 * noise(p);         p = mtx * p * 2.01;
    f += 0.062500 * noise(p);         p = mtx * p * 2.04;
    return f / 0.96875;
}

float pattern(in vec2 p, out vec2 q, out vec2 r) {
    q.x = fbm(p + vec2(0.0, 0.0));
    q.y = fbm(p + vec2(5.2, 1.3));
    r.x = fbm(p + 4.0 * q + vec2(1.7, 9.2));
    r.y = fbm(p + 4.0 * q + vec2(8.3, 2.8));
    return fbm(p + 4.0 * r);
}

void mainImage(out vec4 fragColor, in vec2 fragCoord) {
    vec2 uv = fragCoord / iResolution.xy;
    vec2 q, r;
    float f = pattern(uv, q, r);
    fragColor = colormap(f);
}`;

/* ── WebGL Shader Runner ──────────────────────────────── */

const VERTEX_SHADER = `
attribute vec2 a_position;
void main() { gl_Position = vec4(a_position, 0.0, 1.0); }
`;

function buildFragmentShader(userCode: string): string {
  return `
precision highp float;
uniform vec2 iResolution;
uniform float iTime;
uniform vec4 iMouse;

${userCode}

void main() {
  mainImage(gl_FragColor, gl_FragCoord.xy);
}
`;
}

function compileShader(gl: WebGLRenderingContext, type: number, source: string): WebGLShader | string {
  const shader = gl.createShader(type);
  if (!shader) return 'Failed to create shader';
  gl.shaderSource(shader, source);
  gl.compileShader(shader);
  if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
    const log = gl.getShaderInfoLog(shader) ?? 'Unknown error';
    gl.deleteShader(shader);
    return log;
  }
  return shader;
}

function createProgram(gl: WebGLRenderingContext, vs: WebGLShader, fs: WebGLShader): WebGLProgram | string {
  const prog = gl.createProgram();
  if (!prog) return 'Failed to create program';
  gl.attachShader(prog, vs);
  gl.attachShader(prog, fs);
  gl.linkProgram(prog);
  if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) {
    const log = gl.getProgramInfoLog(prog) ?? 'Link error';
    gl.deleteProgram(prog);
    return log;
  }
  return prog;
}

/* ── Component ──────────────────────────────────────────── */

export default function ShaderApp(_props: AppComponentProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const glRef = useRef<WebGLRenderingContext | null>(null);
  const programRef = useRef<WebGLProgram | null>(null);
  const animRef = useRef<number>(0);
  const startTimeRef = useRef(Date.now());
  const mouseRef = useRef([0, 0, 0, 0]);

  const [code, setCode] = useState(DEFAULT_SHADER);
  const [error, setError] = useState<string | null>(null);
  const [playing, setPlaying] = useState(true);
  const [showEditor, setShowEditor] = useState(true);

  // Initialize WebGL
  const initGL = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const gl = canvas.getContext('webgl', { antialias: true, preserveDrawingBuffer: true });
    if (!gl) { setError('WebGL not supported'); return; }
    glRef.current = gl;

    // Full-screen quad
    const buf = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, buf);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 1, -1, -1, 1, 1, 1]), gl.STATIC_DRAW);
  }, []);

  // Compile & link shader program
  const compileProgram = useCallback((shaderCode: string) => {
    const gl = glRef.current;
    if (!gl) return;

    // Clean up old program
    if (programRef.current) {
      gl.deleteProgram(programRef.current);
      programRef.current = null;
    }

    const vs = compileShader(gl, gl.VERTEX_SHADER, VERTEX_SHADER);
    if (typeof vs === 'string') { setError(`Vertex: ${vs}`); return; }

    const fragSrc = buildFragmentShader(shaderCode);
    const fs = compileShader(gl, gl.FRAGMENT_SHADER, fragSrc);
    if (typeof fs === 'string') {
      // Adjust line numbers to match user code (subtract wrapper lines)
      const cleaned = fs.replace(/ERROR: \d+:(\d+):/g, (_m, line) => {
        const adjusted = Math.max(1, parseInt(line) - 5);
        return `Line ${adjusted}:`;
      });
      setError(cleaned);
      gl.deleteShader(vs);
      return;
    }

    const prog = createProgram(gl, vs, fs);
    if (typeof prog === 'string') { setError(prog); return; }

    programRef.current = prog;
    setError(null);
  }, []);

  // Render loop
  useEffect(() => {
    initGL();
    compileProgram(code);
    startTimeRef.current = Date.now();

    const render = () => {
      const gl = glRef.current;
      const prog = programRef.current;
      const canvas = canvasRef.current;
      if (!gl || !prog || !canvas) {
        animRef.current = requestAnimationFrame(render);
        return;
      }

      const dpr = window.devicePixelRatio || 1;
      const w = canvas.clientWidth;
      const h = canvas.clientHeight;
      canvas.width = w * dpr;
      canvas.height = h * dpr;
      gl.viewport(0, 0, canvas.width, canvas.height);

      gl.useProgram(prog);

      // Uniforms
      const uRes = gl.getUniformLocation(prog, 'iResolution');
      const uTime = gl.getUniformLocation(prog, 'iTime');
      const uMouse = gl.getUniformLocation(prog, 'iMouse');
      gl.uniform2f(uRes, canvas.width, canvas.height);
      gl.uniform1f(uTime, (Date.now() - startTimeRef.current) / 1000);
      gl.uniform4f(uMouse, mouseRef.current[0], mouseRef.current[1], mouseRef.current[2], mouseRef.current[3]);

      // Attribute
      const aPos = gl.getAttribLocation(prog, 'a_position');
      gl.enableVertexAttribArray(aPos);
      gl.vertexAttribPointer(aPos, 2, gl.FLOAT, false, 0, 0);

      gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);

      animRef.current = requestAnimationFrame(render);
    };

    if (playing) {
      animRef.current = requestAnimationFrame(render);
    }

    return () => { if (animRef.current) cancelAnimationFrame(animRef.current); };
  }, [playing, initGL, compileProgram, code]);

  // Mouse tracking on canvas
  const handleCanvasMouseMove = useCallback((e: React.MouseEvent<HTMLCanvasElement>) => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const rect = canvas.getBoundingClientRect();
    const dpr = window.devicePixelRatio || 1;
    mouseRef.current[0] = (e.clientX - rect.left) * dpr;
    mouseRef.current[1] = (rect.height - (e.clientY - rect.top)) * dpr; // flip Y
  }, []);

  const handleRun = useCallback(() => {
    compileProgram(code);
    if (!playing) setPlaying(true);
  }, [code, playing, compileProgram]);

  const handleReset = useCallback(() => {
    setCode(DEFAULT_SHADER);
    compileProgram(DEFAULT_SHADER);
    startTimeRef.current = Date.now();
    setPlaying(true);
  }, [compileProgram]);

  return (
    <div className="shader-app">
      {/* Toolbar */}
      <div className="shader-app__toolbar">
        <div className="shader-app__title">🔮 Shader</div>
        <div className="shader-app__toolbar-actions">
          <button className="shader-app__tool-btn shader-app__tool-btn--run" onClick={handleRun}>
            ▶ Run
          </button>
          <button
            className="shader-app__tool-btn"
            onClick={() => setPlaying(!playing)}
          >
            {playing ? '⏸ Pause' : '▶ Play'}
          </button>
          <button
            className={`shader-app__tool-btn ${showEditor ? 'shader-app__tool-btn--active' : ''}`}
            onClick={() => setShowEditor(!showEditor)}
          >
            {showEditor ? '◨ Hide Code' : '◧ Show Code'}
          </button>
          <button className="shader-app__tool-btn" onClick={handleReset}>
            ↺ Reset
          </button>
        </div>
      </div>

      {/* Main Content */}
      <div className="shader-app__content">
        {/* Canvas */}
        <div className="shader-app__canvas-container">
          <canvas
            ref={canvasRef}
            className="shader-app__canvas"
            onMouseMove={handleCanvasMouseMove}
          />
          {!playing && (
            <div className="shader-app__paused-overlay">PAUSED</div>
          )}
        </div>

        {/* Editor */}
        {showEditor && (
          <div className="shader-app__editor-container">
            <textarea
              className="shader-app__editor"
              value={code}
              onChange={(e) => setCode(e.target.value)}
              spellCheck={false}
              wrap="off"
            />
            {error && (
              <div className="shader-app__error">
                <span className="shader-app__error-icon">⚠</span>
                <pre className="shader-app__error-text">{error}</pre>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
