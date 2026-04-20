import React, { useRef, useEffect, useState } from 'react';
import {
  View, Text, StyleSheet, PanResponder,
  TouchableOpacity, Dimensions, Platform,
  ActivityIndicator,
} from 'react-native';
import * as THREE from 'three';
import { Asset } from 'expo-asset';

// Conditionally import GLView
let GLView = null;
if (Platform.OS !== 'web') {
  try {
    GLView = require('expo-gl').GLView;
  } catch (e) { }
}

// Conditionally import WebView (only available in development builds, not Expo Go)
let WebView = null;
if (Platform.OS !== 'web') {
  try {
    WebView = require('react-native-webview').default;
  } catch (e) { }
}

const { width: SCREEN_W, height: SCREEN_H } = Dimensions.get('window');

// ═══════════════════════════════════════════════════════════════════
// Zone Mapping & Palette Config
// ═══════════════════════════════════════════════════════════════════

const NEUTRAL_COLOR = '#8A8078'; // Darker neutral for contrast on light bg

const ZONE_MAPPING = {
  'FrontalScalp_body_low.010': 'frontal',
  'Head_Temple_L_body_low.001': 'temporal_left',
  'Head_Temple_R_body_low.011': 'temporal_right',
  'mid_scalp_body_low.004': 'mid_scalp',
  'Head_Occiput.001_body_low.003': 'vertex',  // Crown
  'Head_Occiput_body_low.008': 'occipital',
};

const UI_ZONE_NAMES = {
  frontal: 'Frontal',
  temporal_left: 'Temporal L',
  temporal_right: 'Temporal R',
  mid_scalp: 'Mid-Scalp',
  vertex: 'Crown',
  occipital: 'Occipital',
};

const LEGEND = [
  { label: 'Healthy', color: '#1A80FF' },
  { label: 'Mild Reduction', color: '#1AE680' },
  { label: 'Thinning', color: '#FFF233' },
  { label: 'Significant Loss', color: '#FF800D' },
  { label: 'Severe / Bald', color: '#FF1A1A' },
];

function scoreToColorHex(t) {
  const stops = [
    { s: 0.00, hex: '#FF1A1A' },
    { s: 0.25, hex: '#FF800D' },
    { s: 0.50, hex: '#FFF233' },
    { s: 0.75, hex: '#1AE680' },
    { s: 1.00, hex: '#1A80FF' },
  ];
  let lo = stops[0], hi = stops[stops.length - 1];
  for (let i = 0; i < stops.length - 1; i++) {
    if (t >= stops[i].s && t <= stops[i + 1].s) {
      lo = stops[i]; hi = stops[i + 1]; break;
    }
  }
  const range = hi.s - lo.s || 1;
  const alpha = (t - lo.s) / range;
  const c1 = new THREE.Color(lo.hex);
  const c2 = new THREE.Color(hi.hex);
  return '#' + c1.lerp(c2, alpha).getHexString();
}

// Returns RGB 0-1 object for a score
function scoreToPaletteRGB(t) {
  const stops = [
    { s: 0.00, r: 1.000, g: 0.100, b: 0.100 },
    { s: 0.25, r: 1.000, g: 0.500, b: 0.050 },
    { s: 0.50, r: 1.000, g: 0.950, b: 0.200 },
    { s: 0.75, r: 0.100, g: 0.900, b: 0.500 },
    { s: 1.00, r: 0.100, g: 0.500, b: 1.000 },
  ];
  let lo = stops[0], hi = stops[stops.length - 1];
  for (let i = 0; i < stops.length - 1; i++) {
    if (t >= stops[i].s && t <= stops[i + 1].s) { lo = stops[i]; hi = stops[i + 1]; break; }
  }
  const range = hi.s - lo.s || 1;
  const a = (t - lo.s) / range;
  return { r: lo.r + a * (hi.r - lo.r), g: lo.g + a * (hi.g - lo.g), b: lo.b + a * (hi.b - lo.b) };
}

// Zone anchor positions for IDW gradient blending
const ZONE_ANCHORS = {
  frontal:        [  0.00,  0.25,  0.90 ],
  temporal_left:  [ -0.90,  0.10,  0.15 ],
  temporal_right: [  0.90,  0.10,  0.15 ],
  mid_scalp:      [  0.00,  1.00,  0.10 ],
  vertex:         [  0.00,  0.55, -0.30 ],
  occipital:      [  0.00, -0.20, -0.92 ],
};
const IDW_POWER = 3;

// ═══════════════════════════════════════════════════════════════════
// Boundary Edge Extraction
// Finds edges that appear in only ONE triangle = the outer border
// of each zone mesh (zone partition lines, not internal wireframe)
// ═══════════════════════════════════════════════════════════════════

function computeBoundaryEdges(positions) {
  const edgeCount = new Map();
  const triCount = positions.length / 9; // 3 verts × 3 coords

  const key = (ax, ay, az, bx, by, bz) => {
    const a = `${ax.toFixed(4)},${ay.toFixed(4)},${az.toFixed(4)}`;
    const b = `${bx.toFixed(4)},${by.toFixed(4)},${bz.toFixed(4)}`;
    return a < b ? `${a}|${b}` : `${b}|${a}`;
  };

  // Pass 1: count how many triangles share each edge
  for (let t = 0; t < triCount; t++) {
    const i = t * 9;
    const v0 = [positions[i], positions[i+1], positions[i+2]];
    const v1 = [positions[i+3], positions[i+4], positions[i+5]];
    const v2 = [positions[i+6], positions[i+7], positions[i+8]];
    const edges = [[v0,v1],[v1,v2],[v2,v0]];
    for (const [a, b] of edges) {
      const k = key(...a, ...b);
      edgeCount.set(k, (edgeCount.get(k) || 0) + 1);
    }
  }

  // Pass 2: collect edges that appear only once (boundary)
  const result = [];
  for (let t = 0; t < triCount; t++) {
    const i = t * 9;
    const v0 = [positions[i], positions[i+1], positions[i+2]];
    const v1 = [positions[i+3], positions[i+4], positions[i+5]];
    const v2 = [positions[i+6], positions[i+7], positions[i+8]];
    const edges = [[v0,v1],[v1,v2],[v2,v0]];
    for (const [a, b] of edges) {
      const k = key(...a, ...b);
      if (edgeCount.get(k) === 1) {
        result.push(...a, ...b);
      }
    }
  }
  return new Float32Array(result);
}

// Compute per-vertex gradient colors using IDW from all zone anchors
function computeVertexColors(positions, zonesMap) {
  const count = positions.length / 3;
  const colors = new Float32Array(count * 3);
  const anchors = Object.entries(ZONE_ANCHORS).map(([key, [ax, ay, az]]) => ({
    ax, ay, az, score: zonesMap[key] !== undefined ? zonesMap[key] : 0.5,
  }));

  for (let i = 0; i < count; i++) {
    const px = positions[i * 3], py = positions[i * 3 + 1], pz = positions[i * 3 + 2];
    let wScore = 0, wTotal = 0;
    for (const { ax, ay, az, score } of anchors) {
      const d = Math.sqrt((px-ax)**2 + (py-ay)**2 + (pz-az)**2) || 1e-6;
      const w = 1 / Math.pow(d, IDW_POWER);
      wScore += w * score;
      wTotal += w;
    }
    const finalScore = wTotal > 0 ? wScore / wTotal : 0.5;
    const c = scoreToPaletteRGB(Math.max(0, Math.min(1, finalScore)));
    colors[i * 3] = c.r;
    colors[i * 3 + 1] = c.g;
    colors[i * 3 + 2] = c.b;
  }
  return colors;
}

// ═══════════════════════════════════════════════════════════════════
// Custom Blender Grouped OBJ Parser
// ═══════════════════════════════════════════════════════════════════

function parseGroupedOBJ(text) {
  const verts = [];
  const normals = [];
  const groups = [];
  let currentGroup = null;

  const lines = text.split('\n');
  for (const line of lines) {
    const tLine = line.trim();
    if (!tLine || tLine.startsWith('#') || tLine.startsWith('m') || tLine.startsWith('u') || tLine === 'off') continue;

    const parts = tLine.split(/\s+/);
    const tag = parts[0];

    if (tag === 'g' || tag === 'o') {
      const gName = parts.slice(1).join(' ');
      if (gName && gName !== 'Group' && gName !== 'off') {
        currentGroup = { name: gName, pos: [], norm: [] };
        groups.push(currentGroup);
      }
    } else if (tag === 'v') {
      verts.push(parseFloat(parts[1]), parseFloat(parts[2]), parseFloat(parts[3]));
    } else if (tag === 'vn') {
      normals.push(parseFloat(parts[1]), parseFloat(parts[2]), parseFloat(parts[3]));
    } else if (tag === 'f') {
      if (!currentGroup) {
        currentGroup = { name: 'Default', pos: [], norm: [] };
        groups.push(currentGroup);
      }
      const indices = parts.slice(1).map((tok) => {
        const segs = tok.split('/');
        return { vi: parseInt(segs[0]) - 1, ni: segs[2] ? parseInt(segs[2]) - 1 : -1 };
      });
      for (let i = 1; i < indices.length - 1; i++) {
        [indices[0], indices[i], indices[i + 1]].forEach(({ vi, ni }) => {
          currentGroup.pos.push(verts[vi * 3], verts[vi * 3 + 1], verts[vi * 3 + 2]);
          if (ni >= 0 && normals.length > ni * 3) {
            currentGroup.norm.push(normals[ni * 3], normals[ni * 3 + 1], normals[ni * 3 + 2]);
          } else {
            currentGroup.norm.push(0, 1, 0);
          }
        });
      }
    }
  }
  return groups;
}

import * as FileSystem from 'expo-file-system/legacy';

// ═══════════════════════════════════════════════════════════════════
// Model Loading & Scene Setup
// ═══════════════════════════════════════════════════════════════════

async function loadMultiMeshModel(zonesMap) {
  let text = null;
  try {
    const asset = Asset.fromModule(require('./assets/head_model.obj'));
    await asset.downloadAsync();
    
    if (Platform.OS !== 'web') {
      text = await FileSystem.readAsStringAsync(asset.localUri || asset.uri);
    } else {
      const res = await fetch(asset.localUri || asset.uri);
      text = await res.text();
    }
  } catch (e) {
    console.warn("OBJ Load error", e);
    return null;
  }

  if (!text) return null;

  const rawGroups = parseGroupedOBJ(text);

  // Find global bounds for scaling
  let minY = Infinity, maxY = -Infinity, minX = Infinity, maxX = -Infinity, minZ = Infinity, maxZ = -Infinity;
  rawGroups.forEach(g => {
    for (let i = 0; i < g.pos.length; i += 3) {
      minX = Math.min(minX, g.pos[i]); maxX = Math.max(maxX, g.pos[i]);
      minY = Math.min(minY, g.pos[i + 1]); maxY = Math.max(maxY, g.pos[i + 1]);
      minZ = Math.min(minZ, g.pos[i + 2]); maxZ = Math.max(maxZ, g.pos[i + 2]);
    }
  });

  const cx = (minX + maxX) / 2;
  const cy = (minY + maxY) / 2;
  const cz = (minZ + maxZ) / 2;
  const scaleF = 2.0 / (maxY - minY);

  const container = new THREE.Group();
  const labelNodes = [];

  rawGroups.forEach(g => {
    if (g.pos.length === 0) return;

    // Scale and center points natively
    let cxG = 0, cyG = 0, czG = 0;
    for (let i = 0; i < g.pos.length; i += 3) {
      g.pos[i] = (g.pos[i] - cx) * scaleF;
      g.pos[i + 1] = (g.pos[i + 1] - cy) * scaleF;
      g.pos[i + 2] = (g.pos[i + 2] - cz) * scaleF;

      cxG += g.pos[i];
      cyG += g.pos[i + 1];
      czG += g.pos[i + 2];
    }

    // Find absolute center of this specific chunk
    const pc = g.pos.length / 3;
    const center = new THREE.Vector3(cxG / pc, cyG / pc, czG / pc);

    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(g.pos), 3));
    geo.setAttribute('normal', new THREE.BufferAttribute(new Float32Array(g.norm), 3));
    geo.computeVertexNormals();

    const aiZone = ZONE_MAPPING[g.name];

    if (aiZone) {
      const score = zonesMap[aiZone] !== undefined ? zonesMap[aiZone] : 0.5;
      // Compute per-vertex gradient colors using IDW from all anchors
      const vertexColors = computeVertexColors(new Float32Array(g.pos), zonesMap);
      geo.setAttribute('color', new THREE.BufferAttribute(vertexColors, 3));

      const hoverCenter = center.clone().multiplyScalar(1.08);
      labelNodes.push({ id: aiZone, name: UI_ZONE_NAMES[aiZone], score, point: hoverCenter });

      const mat = new THREE.MeshPhongMaterial({
        vertexColors: true,
        shininess: 50,
        specular: new THREE.Color(0x334466),
      });
      const mesh = new THREE.Mesh(geo, mat);

      // Zone partition boundary lines (NOT internal wireframe)
      // Boundary edges = edges used by only ONE triangle = the outer border of each zone mesh
      const boundaryPositions = computeBoundaryEdges(g.pos);
      if (boundaryPositions.length > 0) {
        const lineGeo = new THREE.BufferGeometry();
        lineGeo.setAttribute('position', new THREE.BufferAttribute(boundaryPositions, 3));
        const lineMat = new THREE.LineBasicMaterial({
          color: 0x00ffff,
          transparent: true,
          opacity: 0.85,
          linewidth: 2,
        });
        const lines = new THREE.LineSegments(lineGeo, lineMat);
        lines.renderOrder = 1;
        mesh.add(lines);
      }

      container.add(mesh);
    } else {
      // Non-hair zone (face, neck) — neutral dark grey
      const mat = new THREE.MeshPhongMaterial({
        color: new THREE.Color(NEUTRAL_COLOR),
        shininess: 30,
        specular: new THREE.Color(0x111111),
      });
      container.add(new THREE.Mesh(geo, mat));
    }
  });

  return { model: container, labels: labelNodes };
}

function setupScene(width, height) {
  const scene = new THREE.Scene();
  scene.background = new THREE.Color(0xD8DCE6); // Soft cool-gray background

  const camera = new THREE.PerspectiveCamera(45, width / height, 0.01, 1000);
  camera.position.set(0, 0, 3.5);

  scene.add(new THREE.AmbientLight(0xffffff, 0.75));

  const keyLight = new THREE.DirectionalLight(0xffffff, 0.8);
  keyLight.position.set(2, 4, 5);
  scene.add(keyLight);

  const rimLight = new THREE.DirectionalLight(0x88aaff, 0.4);
  rimLight.position.set(-3, 1, -4);
  scene.add(rimLight);

  return { scene, camera };
}

// ═══════════════════════════════════════════════════════════════════
// Web Renderer
// ═══════════════════════════════════════════════════════════════════

function WebHead3DViewer({ zones, onBack }) {
  const canvasRef = useRef(null);
  const containerRef = useRef(null);
  const [labels, setLabels] = useState([]);

  const rotationRef = useRef({ x: 0.2, y: 0 });
  const scaleRef = useRef(1.0);
  const isDraggingRef = useRef(false);
  const prevMouseRef = useRef({ x: 0, y: 0 });
  const prevPinchDistRef = useRef(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const width = canvas.clientWidth;
    const height = canvas.clientHeight;
    const { scene, camera } = setupScene(width, height);

    const renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
    renderer.setSize(width, height);
    renderer.setPixelRatio(window.devicePixelRatio || 1);

    let meshGroup = null;
    let labelData = [];
    let animId = null;

    loadMultiMeshModel(zones).then((res) => {
      if (res) {
        meshGroup = res.model;
        labelData = res.labels;
        scene.add(meshGroup);
        setLabels(labelData);
      }
    });

    const animate = () => {
      animId = requestAnimationFrame(animate);
      if (meshGroup) {
        meshGroup.rotation.y = rotationRef.current.y;
        meshGroup.rotation.x = rotationRef.current.x;
        meshGroup.scale.set(scaleRef.current, scaleRef.current, scaleRef.current);

        // Dynamic Label Projection with dot-product occlusion
        labelData.forEach(l => {
          const el = document.getElementById('label-' + l.id);
          if (el) {
            // Get label's world position
            const worldPos = l.point.clone();
            worldPos.applyMatrix4(meshGroup.matrixWorld);

            // Compute label's outward-facing normal in world space
            const labelNormal = l.point.clone().normalize();
            labelNormal.applyMatrix4(new THREE.Matrix4().extractRotation(meshGroup.matrixWorld));

            // Camera view direction: from label toward camera
            const camDir = camera.position.clone().sub(worldPos).normalize();

            // Dot product: positive = facing camera, negative = facing away
            const dot = labelNormal.dot(camDir);

            // Project to screen
            const projected = worldPos.clone().project(camera);
            const x = (projected.x * 0.5 + 0.5) * window.innerWidth;
            const y = (projected.y * -0.5 + 0.5) * window.innerHeight;

            // Smooth fade: fully visible when facing camera (dot > 0.3), hidden when away (dot < 0)
            const opacity = dot > 0.3 ? 1 : dot > 0 ? dot / 0.3 : 0;

            el.style.transform = `translate(-50%, -50%) translate(${x}px, ${y}px)`;
            el.style.opacity = String(opacity);
            el.style.display = opacity < 0.05 ? 'none' : 'block';
            el.style.pointerEvents = 'none';
          }
        });
      }
      renderer.render(scene, camera);
    };
    animate();

    const onMouseDown = (e) => {
      e.preventDefault();
      isDraggingRef.current = true;
      prevMouseRef.current = { x: e.clientX, y: e.clientY };
    };
    const onMouseMove = (e) => {
      if (!isDraggingRef.current) return;
      const dx = e.clientX - prevMouseRef.current.x;
      const dy = e.clientY - prevMouseRef.current.y;
      rotationRef.current.y += dx * 0.007;
      rotationRef.current.x += dy * 0.007;
      rotationRef.current.x = Math.max(-1.5, Math.min(1.5, rotationRef.current.x));
      prevMouseRef.current = { x: e.clientX, y: e.clientY };
    };
    const onMouseUp = () => { isDraggingRef.current = false; };

    const onTouchStart = (e) => {
      if (e.touches.length === 1) {
        isDraggingRef.current = true;
        prevPinchDistRef.current = null;
        prevMouseRef.current = { x: e.touches[0].clientX, y: e.touches[0].clientY };
      } else if (e.touches.length === 2) {
        isDraggingRef.current = false;
        const dx = e.touches[0].clientX - e.touches[1].clientX;
        const dy = e.touches[0].clientY - e.touches[1].clientY;
        prevPinchDistRef.current = Math.sqrt(dx * dx + dy * dy);
      }
    };
    const onTouchMove = (e) => {
      if (e.touches.length === 1 && isDraggingRef.current) {
        const dx = e.touches[0].clientX - prevMouseRef.current.x;
        const dy = e.touches[0].clientY - prevMouseRef.current.y;
        rotationRef.current.y += dx * 0.007;
        rotationRef.current.x += dy * 0.007;
        rotationRef.current.x = Math.max(-1.5, Math.min(1.5, rotationRef.current.x));
        prevMouseRef.current = { x: e.touches[0].clientX, y: e.touches[0].clientY };
      } else if (e.touches.length === 2) {
        const dx = e.touches[0].clientX - e.touches[1].clientX;
        const dy = e.touches[0].clientY - e.touches[1].clientY;
        const dist = Math.sqrt(dx * dx + dy * dy);
        if (prevPinchDistRef.current !== null) {
          const diff = dist - prevPinchDistRef.current;
          scaleRef.current += diff * 0.005;
          scaleRef.current = Math.max(0.5, Math.min(3.0, scaleRef.current));
        }
        prevPinchDistRef.current = dist;
      }
    };
    const onTouchEnd = () => {
      isDraggingRef.current = false;
      prevPinchDistRef.current = null;
    };

    const onWheel = (e) => {
      e.preventDefault();
      scaleRef.current -= e.deltaY * 0.001;
      scaleRef.current = Math.max(0.5, Math.min(3.0, scaleRef.current));
    };

    // Bind all mouse/touch to window so overlays don't block dragging
    window.addEventListener('mousedown', onMouseDown);
    window.addEventListener('mousemove', onMouseMove);
    window.addEventListener('mouseup', onMouseUp);
    window.addEventListener('touchstart', onTouchStart, { passive: false });
    window.addEventListener('touchmove', onTouchMove, { passive: false });
    window.addEventListener('touchend', onTouchEnd);
    canvas.addEventListener('wheel', onWheel, { passive: false });

    const onResize = () => {
      const w = canvasRef.current.clientWidth;
      const h = canvasRef.current.clientHeight;
      camera.aspect = w / h;
      camera.updateProjectionMatrix();
      renderer.setSize(w, h);
    };
    window.addEventListener('resize', onResize);

    return () => {
      cancelAnimationFrame(animId);
      window.removeEventListener('mousedown', onMouseDown);
      window.removeEventListener('mousemove', onMouseMove);
      window.removeEventListener('mouseup', onMouseUp);
      window.removeEventListener('touchstart', onTouchStart);
      window.removeEventListener('touchmove', onTouchMove);
      window.removeEventListener('touchend', onTouchEnd);
      if (canvasRef.current) canvasRef.current.removeEventListener('wheel', onWheel);
    };
  }, [zones]);

  return (
    <View style={styles.container} ref={containerRef}>
      <canvas ref={canvasRef} style={styles.glView} />

      {/* 3D Dynamic Labels */}
      {labels.map(l => (
        <div
          key={l.id}
          id={'label-' + l.id}
          style={{
            position: 'absolute',
            top: 0, left: 0,
            transition: 'opacity 0.2s',
            zIndex: 100,
            pointerEvents: 'none',
          }}
        >
          <View style={styles.zoneLabelWrap}>
            <View style={[styles.zoneDot, { backgroundColor: scoreToColorHex(l.score) }]} />
            <View>
              <Text style={styles.zoneName}>{l.name}</Text>
              <Text style={styles.zoneScore}>{Math.round(l.score * 100)}% density</Text>
            </View>
          </View>
        </div>
      ))}

      {/* Floating UI */}
      <View style={styles.overlay} pointerEvents="box-none">
        <View style={styles.header}>
          <TouchableOpacity onPress={onBack} style={styles.backBtn}>
            <Text style={styles.backArrow}>←</Text>
          </TouchableOpacity>
          <Text style={styles.title}>3D Scalp Heatmap</Text>
          <View style={{ width: 44 }} />
        </View>

        <Text style={styles.hint}>↺ Drag to rotate</Text>

        <View style={styles.legendContainer}>
          {LEGEND.map((item, idx) => (
            <View key={idx} style={styles.legendItem}>
              <View style={[styles.legendColor, { backgroundColor: item.color }]} />
              <Text style={styles.legendText}>{item.label}</Text>
            </View>
          ))}
        </View>
      </View>
    </View>
  );
}

// ═══════════════════════════════════════════════════════════════════
// Native GLView Renderer (for Expo Go — with fixed touch controls)
// ═══════════════════════════════════════════════════════════════════

function NativeHead3DViewer({ zones, onBack }) {
  const rotationRef = useRef({ x: 0.2, y: 0 });
  const scaleRef = useRef(1.0);
  const prevPinchDistRef = useRef(null);
  const [labels, setLabels] = useState([]);
  const labelRefs = useRef({});

  // ── Fixed PanResponder with proper gesture capture ──
  const panResponder = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => true,
      onMoveShouldSetPanResponder: () => true,
      onStartShouldSetPanResponderCapture: () => true,
      onMoveShouldSetPanResponderCapture: () => true,
      onPanResponderGrant: () => {
        prevPinchDistRef.current = null;
      },
      onPanResponderMove: (e, state) => {
        if (state.numberActiveTouches === 2 && e.nativeEvent.touches.length === 2) {
          // Pinch to zoom
          const t1 = e.nativeEvent.touches[0];
          const t2 = e.nativeEvent.touches[1];
          const dx = t1.pageX - t2.pageX;
          const dy = t1.pageY - t2.pageY;
          const dist = Math.sqrt(dx * dx + dy * dy);

          if (prevPinchDistRef.current !== null) {
            const diff = dist - prevPinchDistRef.current;
            scaleRef.current += diff * 0.005;
            scaleRef.current = Math.max(0.5, Math.min(3.0, scaleRef.current));
          }
          prevPinchDistRef.current = dist;
        } else if (state.numberActiveTouches === 1) {
          // One finger drag to rotate
          prevPinchDistRef.current = null;
          rotationRef.current.y += state.vx * 0.04;
          rotationRef.current.x += state.vy * 0.04;
          rotationRef.current.x = Math.max(-1.5, Math.min(1.5, rotationRef.current.x));
        }
      },
      onPanResponderRelease: () => {},
      onPanResponderTerminate: () => {},
    })
  ).current;

  const onContextCreate = async (gl) => {
    const { scene, camera } = setupScene(gl.drawingBufferWidth, gl.drawingBufferHeight);

    const renderer = new THREE.WebGLRenderer({
      canvas: {
        width: gl.drawingBufferWidth,
        height: gl.drawingBufferHeight,
        style: {},
        addEventListener: () => { },
        removeEventListener: () => { },
        clientHeight: gl.drawingBufferHeight,
      },
      context: gl,
      antialias: true,
    });
    renderer.setSize(gl.drawingBufferWidth, gl.drawingBufferHeight);

    let meshGroup = null;
    let labelData = [];

    const res = await loadMultiMeshModel(zones);
    if (res) {
      meshGroup = res.model;
      labelData = res.labels;
      scene.add(meshGroup);
      setLabels(labelData);
    }

    const render = () => {
      requestAnimationFrame(render);
      if (meshGroup) {
        meshGroup.rotation.y = rotationRef.current.y;
        meshGroup.rotation.x = rotationRef.current.x;
        meshGroup.scale.set(scaleRef.current, scaleRef.current, scaleRef.current);

        // Update label positions with proper dot-product occlusion
        labelData.forEach(l => {
          if (labelRefs.current[l.id]) {
            const worldPos = l.point.clone();
            worldPos.applyMatrix4(meshGroup.matrixWorld);

            // Compute label's outward-facing normal in world space
            const labelNormal = l.point.clone().normalize();
            labelNormal.applyMatrix4(new THREE.Matrix4().extractRotation(meshGroup.matrixWorld));

            // Camera view direction
            const camDir = camera.position.clone().sub(worldPos).normalize();
            const dot = labelNormal.dot(camDir);

            // Project to screen
            const projected = worldPos.clone().project(camera);
            const x = (projected.x * 0.5 + 0.5) * SCREEN_W;
            const y = (projected.y * -0.5 + 0.5) * SCREEN_H;

            // Smooth fade based on dot product
            const opacity = dot > 0.3 ? 1 : dot > 0 ? dot / 0.3 : 0;

            labelRefs.current[l.id].setNativeProps({
              style: {
                transform: [{ translateX: x - 60 }, { translateY: y - 25 }],
                opacity: opacity,
              }
            });
          }
        });
      }
      renderer.render(scene, camera);
      gl.endFrameEXP();
    };
    render();
  };

  return (
    <View style={styles.container}>
      {/* Touch layer sits ON TOP of GLView to capture all gestures */}
      <View style={StyleSheet.absoluteFill}>
        <GLView style={styles.glView} onContextCreate={onContextCreate} />
      </View>

      {/* Transparent touch overlay — captures PanResponder gestures */}
      <View
        style={[StyleSheet.absoluteFill, { zIndex: 10 }]}
        {...panResponder.panHandlers}
      />

      {/* Floating labels */}
      {labels.map(l => (
        <View
          key={l.id}
          ref={(el) => (labelRefs.current[l.id] = el)}
          style={styles.absNativeLabel}
          pointerEvents="none"
        >
          <View style={styles.zoneLabelWrap}>
            <View style={[styles.zoneDot, { backgroundColor: scoreToColorHex(l.score) }]} />
            <View>
              <Text style={styles.zoneName}>{l.name}</Text>
              <Text style={styles.zoneScore}>{Math.round(l.score * 100)}% density</Text>
            </View>
          </View>
        </View>
      ))}

      {/* UI Overlay — pointerEvents box-none so taps pass through except on buttons */}
      <View style={[styles.overlay, { zIndex: 20 }]} pointerEvents="box-none">
        <View style={styles.header}>
          <TouchableOpacity onPress={onBack} style={styles.backBtn}>
            <Text style={styles.backArrow}>←</Text>
          </TouchableOpacity>
          <Text style={styles.title}>3D Scalp Heatmap</Text>
          <View style={{ width: 44 }} />
        </View>
        <Text style={styles.hint}>↺ Drag to rotate • Pinch to zoom</Text>

        <View style={styles.legendContainer}>
          {LEGEND.map((item, idx) => (
            <View key={idx} style={styles.legendItem}>
              <View style={[styles.legendColor, { backgroundColor: item.color }]} />
              <Text style={styles.legendText}>{item.label}</Text>
            </View>
          ))}
        </View>
      </View>
    </View>
  );
}

export default function Head3DViewer(props) {
  if (Platform.OS === 'web') return <WebHead3DViewer {...props} />;
  if (GLView) return <NativeHead3DViewer {...props} />;
  return (
    <View style={[styles.container, { justifyContent: 'center', alignItems: 'center' }]}>
      <Text style={{ color: '#3A3F56' }}>3D rendering not supported</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#D8DCE6' },
  glView: { flex: 1 },
  absNativeLabel: {
    position: 'absolute', top: 0, left: 0, zIndex: 15,
  },
  overlay: {
    ...StyleSheet.absoluteFillObject,
    paddingTop: Platform.OS === 'ios' ? 50 : 20,
    justifyContent: 'space-between',
  },
  header: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 16,
  },
  backBtn: {
    width: 44, height: 44, borderRadius: 22, backgroundColor: 'rgba(255,255,255,0.7)',
    alignItems: 'center', justifyContent: 'center',
    shadowColor: '#000', shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.08, shadowRadius: 4, elevation: 2,
  },
  backArrow: { color: '#3A3F56', fontSize: 24, fontWeight: '600' },
  title: { color: '#1A1D2E', fontSize: 20, fontWeight: '800' },
  hint: {
    position: 'absolute', bottom: 40, width: '100%', textAlign: 'center',
    color: 'rgba(60,65,85,0.45)', fontSize: 14, fontStyle: 'italic', fontWeight: '500',
    pointerEvents: 'none',
  },
  legendContainer: {
    position: 'absolute', bottom: 20, right: 20,
    backgroundColor: 'rgba(255,255,255,0.92)', padding: 12, borderRadius: 16,
    borderWidth: 1, borderColor: 'rgba(0,0,0,0.08)',
    shadowColor: '#000', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.08, shadowRadius: 8, elevation: 3,
  },
  legendItem: { flexDirection: 'row', alignItems: 'center', marginVertical: 4 },
  legendColor: { width: 14, height: 14, borderRadius: 4, marginRight: 10 },
  legendText: { color: '#3A3F56', fontSize: 12, fontWeight: '600' },

  zoneLabelWrap: {
    flexDirection: 'row', alignItems: 'center',
    backgroundColor: 'rgba(255,255,255,0.92)', paddingHorizontal: 14, paddingVertical: 10,
    borderRadius: 12, borderWidth: 1, borderColor: 'rgba(0,0,0,0.1)',
    minWidth: 120,
    shadowColor: '#000', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.1, shadowRadius: 6,
  },
  zoneDot: { width: 12, height: 12, borderRadius: 6, marginRight: 10, borderWidth: 1, borderColor: 'rgba(0,0,0,0.1)' },
  zoneName: { color: '#1A1D2E', fontSize: 14, fontWeight: '800', letterSpacing: 0.3 },
  zoneScore: { color: '#6B7291', fontSize: 12, fontWeight: '700', marginTop: 2 },
});
