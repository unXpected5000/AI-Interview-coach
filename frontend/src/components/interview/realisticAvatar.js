import * as THREE from "three";
import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";

import { blendshapeWeights } from "./avatarBehavior.js";

// Optional realistic interviewer. Put a head-and-shoulders (or full body)
// glTF binary at public/avatars/interviewer.glb with ARKit blendshapes
// (jawOpen, eyeBlinkLeft, mouthSmileLeft, browInnerUp, ...) and, ideally,
// Oculus visemes (viseme_aa, viseme_O, ...). Free sources that export these
// include Avaturn and Character Creator (check each asset's license). When no
// valid file is present the built-in avatar is used.
export const REALISTIC_AVATAR_PATH = "avatars/interviewer.glb";

function isGlb(buffer) {
  if (!buffer || buffer.byteLength < 12) return false;
  const magic = new Uint8Array(buffer, 0, 4);
  return String.fromCharCode(...magic) === "glTF";
}

function findBone(root, patterns) {
  let found = null;
  root.traverse((object) => {
    if (!found && object.isBone && patterns.some((pattern) => pattern.test(object.name))) found = object;
  });
  return found;
}

/**
 * Load the avatar into the scene if it exists. Resolves null when absent or
 * invalid (a single-page-app host may answer a missing file with index.html).
 */
export async function loadRealisticAvatar({ scene, camera, url } = {}) {
  const path = url ?? `${import.meta.env?.BASE_URL ?? "/"}${REALISTIC_AVATAR_PATH}`;
  let buffer;
  try {
    const response = await fetch(path, { cache: "force-cache" });
    if (!response.ok) return null;
    buffer = await response.arrayBuffer();
  } catch {
    return null;
  }
  if (!isGlb(buffer)) return null;

  const gltf = await new GLTFLoader().parseAsync(buffer, "");
  const model = gltf.scene;
  const morphMeshes = [];
  model.traverse((object) => {
    if (object.isMesh && object.morphTargetDictionary && object.morphTargetInfluences) morphMeshes.push(object);
    if (object.isMesh) object.frustumCulled = false;
  });
  const headBone = findBone(model, [/^head$/i, /head/i]);
  const neckBone = findBone(model, [/^neck$/i, /neck/i]);
  const spineBone = findBone(model, [/spine2/i, /chest/i, /spine1/i]);
  const leftEye = findBone(model, [/lefteye/i, /eye_?l/i]);
  const rightEye = findBone(model, [/righteye/i, /eye_?r/i]);

  // Frame head and shoulders like a video call.
  model.updateMatrixWorld(true);
  const headPosition = new THREE.Vector3();
  if (headBone) headBone.getWorldPosition(headPosition);
  else new THREE.Box3().setFromObject(model).getCenter(headPosition);
  const box = new THREE.Box3().setFromObject(model);
  const height = box.max.y - box.min.y;
  const frameHeight = headBone ? Math.min(height, 0.75) : height;
  const distance = frameHeight / (2 * Math.tan(THREE.MathUtils.degToRad(camera.fov / 2))) * 1.05;
  camera.position.set(headPosition.x, headPosition.y - frameHeight * 0.08, headPosition.z + distance);
  camera.lookAt(headPosition.x, headPosition.y - frameHeight * 0.12, headPosition.z);
  scene.add(model);

  const rest = new Map();
  [headBone, neckBone, spineBone, leftEye, rightEye].filter(Boolean).forEach((bone) => rest.set(bone, bone.quaternion.clone()));
  const euler = new THREE.Euler();
  const delta = new THREE.Quaternion();
  const rotate = (bone, x, y, z) => {
    if (!bone) return;
    delta.setFromEuler(euler.set(x, y, z));
    bone.quaternion.copy(rest.get(bone)).multiply(delta);
  };

  return {
    update({ mouth, blink, gaze, expression, motion, breathing }) {
      const weights = blendshapeWeights({ mouth, blink, gaze, expression });
      for (const mesh of morphMeshes) {
        const dictionary = mesh.morphTargetDictionary;
        for (const [name, value] of Object.entries(weights)) {
          const index = dictionary[name];
          if (index !== undefined) mesh.morphTargetInfluences[index] = Math.max(0, Math.min(1, value));
        }
      }
      rotate(neckBone, -motion.pitch * 0.4, motion.yaw * 0.4, motion.roll * 0.4);
      rotate(headBone, -motion.pitch * 0.6, motion.yaw * 0.6, motion.roll * 0.6);
      rotate(spineBone, breathing * 0.015, 0, 0);
      rotate(leftEye, -gaze.y * 0.15, gaze.x * 0.25, 0);
      rotate(rightEye, -gaze.y * 0.15, gaze.x * 0.25, 0);
    },
    dispose() {
      scene.remove(model);
      model.traverse((object) => {
        object.geometry?.dispose?.();
        const materials = Array.isArray(object.material) ? object.material : object.material ? [object.material] : [];
        materials.forEach((material) => {
          Object.values(material).forEach((value) => value?.isTexture && value.dispose());
          material.dispose();
        });
      });
    },
  };
}
