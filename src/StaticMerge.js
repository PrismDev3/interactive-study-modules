/**
 * StaticMerge.js — collapse a built-from-parts prop into one mesh per material.
 *
 * Props here are assembled from dozens of small boxes and cylinders (a ferry is 131 meshes, a
 * changing booth 48). Every one is its own draw call, and a second one in the shadow pass. Parts
 * that never move relative to the prop's root can share a draw call: this bakes each part's
 * transform into its vertices and merges parts that use the same material and shadow flags.
 *
 * `keep(object)` marks sub-trees that animate (a radar dish, a door) and must stay separate.
 * Skinned, instanced, morphing, multi-material and hidden meshes are left alone as well.
 * Returns the merged meshes (already added to `root`), each with a BVH for fast raycasts.
 */
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';

const KEEP_ATTRS = ['position', 'normal', 'uv', 'color'];

/** Material "look" signature: props that clone a material per part still share a draw when nothing differs. */
const look = m => [m.name, m.type, m.color?.getHex(), m.emissive?.getHex(), m.emissiveIntensity, m.roughness, m.metalness,
  m.map?.uuid, m.emissiveMap?.uuid, m.normalMap?.uuid, m.alphaMap?.uuid, m.transparent, m.opacity, m.side,
  m.vertexColors, m.depthWrite, m.depthTest, m.polygonOffset, m.polygonOffsetFactor, m.toneMapped, m.wireframe,
  m.flatShading, m.blending, m.alphaTest].join(',');

/** `byLook`: bucket by material settings instead of material identity (opt-in; use only where no code
 *  later edits one part's material on its own). */
export function mergeStatic(root, { keep = () => false, minParts = 2, byLook = false } = {}) {
  root.updateMatrixWorld(true);
  const inv = new THREE.Matrix4().copy(root.matrixWorld).invert();
  const rel = new THREE.Matrix4();
  const buckets = new Map();

  root.traverse(o => {
    if (!o.isMesh || o.isSkinnedMesh || o.isInstancedMesh || Array.isArray(o.material)) return;
    if (o.userData.noMerge || Object.keys(o.geometry.morphAttributes ?? {}).length) return;
    for (let p = o; p && p !== root; p = p.parent) if (!p.visible || p.userData.noMerge || keep(p)) return;
    const g = o.geometry;
    const attrs = KEEP_ATTRS.filter(a => g.attributes[a]);
    if (!attrs.includes('position') || !attrs.includes('normal')) return;
    const key = [byLook ? look(o.material) : o.material.uuid, o.castShadow, o.receiveShadow, o.renderOrder, o.layers.mask, attrs.join()].join('|');
    let b = buckets.get(key);
    if (!b) buckets.set(key, b = { parts: [], attrs });
    b.parts.push(o);
  });

  const out = [];
  for (const { parts, attrs } of buckets.values()) {
    if (parts.length < minParts) continue;
    const geos = parts.map(o => {
      const src = o.geometry.index ? o.geometry.toNonIndexed() : o.geometry.clone();
      const g = new THREE.BufferGeometry();
      for (const a of attrs) g.setAttribute(a, src.attributes[a]);
      rel.multiplyMatrices(inv, o.matrixWorld);
      g.applyMatrix4(rel);
      // A mirrored part (negative scale) comes out wound backwards: swap two corners per triangle.
      if (rel.determinant() < 0) for (const a of attrs) {
        const at = g.attributes[a], n = at.itemSize, arr = at.array;
        for (let t = 0; t + 2 < at.count; t += 3) for (let k = 0; k < n; k++) {
          const i1 = (t + 1) * n + k, i2 = (t + 2) * n + k, tmp = arr[i1];
          arr[i1] = arr[i2]; arr[i2] = tmp;
        }
      }
      return g;
    });
    const merged = mergeGeometries(geos, false);
    if (!merged) continue;
    merged.computeBoundingSphere();
    merged.computeBoundingBox();
    merged.computeBoundsTree?.();
    const first = parts[0];
    const mesh = new THREE.Mesh(merged, first.material);
    mesh.name = 'merged:' + (first.material.name || first.material.type);
    mesh.castShadow = first.castShadow;
    mesh.receiveShadow = first.receiveShadow;
    mesh.renderOrder = first.renderOrder;
    mesh.layers.mask = first.layers.mask;
    for (const o of parts) { o.removeFromParent(); o.geometry.dispose(); }
    root.add(mesh);
    out.push(mesh);
  }
  return out;
}
