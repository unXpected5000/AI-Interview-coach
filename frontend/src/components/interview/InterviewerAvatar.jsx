import { useEffect, useRef, useState } from "react";
import * as THREE from "three";

const stateCopy = {
  idle: "Ready when you are",
  listening: "Listening",
  thinking: "Preparing the next question",
  speaking: "Speaking",
  interrupted: "Interrupted · ready for your answer",
  disconnected: "Voice unavailable · text mode ready",
};

function createHeadGeometry() {
  const rows = 48;
  const columns = 64;
  const positions = [];
  const indices = [];
  for (let row = 0; row <= rows; row += 1) {
    const vertical = -1 + (2 * row) / rows;
    const ring = Math.sqrt(Math.max(0, 1 - vertical * vertical));
    const jawTaper = vertical < -0.08 ? 0.83 + 0.17 * ((vertical + 1) / 0.92) : 1;
    for (let column = 0; column <= columns; column += 1) {
      const angle = (column / columns) * Math.PI * 2;
      const cheekWidth = 1 + 0.045 * Math.exp(-((vertical - 0.05) ** 2) / 0.12);
      positions.push(
        Math.cos(angle) * 0.62 * ring * jawTaper * cheekWidth,
        vertical * 0.92,
        Math.sin(angle) * 0.54 * ring * (vertical < -0.45 ? 0.94 : 1),
      );
    }
  }
  for (let row = 0; row < rows; row += 1) {
    for (let column = 0; column < columns; column += 1) {
      const index = row * (columns + 1) + column;
      indices.push(index, index + columns + 1, index + 1, index + 1, index + columns + 1, index + columns + 2);
    }
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3));
  geometry.setIndex(indices);
  geometry.computeVertexNormals();
  return geometry;
}

export default function InterviewerAvatar({ state = "idle", speechActivity = 0, hasSpeechBoundaryEvents = false }) {
  const canvasRef = useRef(null);
  const stateRef = useRef(state);
  const speechActivityRef = useRef(speechActivity);
  const speechBoundaryRef = useRef(hasSpeechBoundaryEvents);
  const [webglReady, setWebglReady] = useState(false);
  stateRef.current = state;
  speechActivityRef.current = speechActivity;
  speechBoundaryRef.current = hasSpeechBoundaryEvents;

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return undefined;

    let renderer;
    let frameId;
    let resizeObserver;
    let intersectionObserver;
    try {
      renderer = new THREE.WebGLRenderer({ canvas, alpha: true, antialias: false, powerPreference: "low-power" });
      renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.5));
      renderer.setClearColor(0x000000, 0);
      renderer.outputColorSpace = THREE.SRGBColorSpace;

      const scene = new THREE.Scene();
      const camera = new THREE.PerspectiveCamera(30, 1, 0.1, 100);
      camera.position.set(0, 0.28, 6);
      camera.lookAt(0, 0.18, 0);
      scene.add(new THREE.HemisphereLight(0xdbeafe, 0x172033, 1.9));
      const keyLight = new THREE.DirectionalLight(0xffeadb, 2.1);
      keyLight.position.set(-2.5, 3.5, 4);
      scene.add(keyLight);
      const fillLight = new THREE.DirectionalLight(0xb8d4e8, 0.7);
      fillLight.position.set(2.5, 1.2, 3);
      scene.add(fillLight);
      const rimLight = new THREE.DirectionalLight(0x4bb9b1, 1.1);
      rimLight.position.set(3, 2, -3);
      scene.add(rimLight);

      const interviewer = new THREE.Group();
      scene.add(interviewer);
      const sphere = new THREE.SphereGeometry(1, 40, 32);
      const skin = new THREE.MeshPhysicalMaterial({ color: 0xe3b99f, roughness: 0.72, clearcoat: 0.04, clearcoatRoughness: 0.78 });
      const hair = new THREE.MeshStandardMaterial({ color: 0x493326, roughness: 0.72 });
      const hairLight = new THREE.MeshStandardMaterial({ color: 0x694a35, roughness: 0.7 });
      const jacket = new THREE.MeshStandardMaterial({ color: 0x17253a, roughness: 0.78, side: THREE.DoubleSide });
      const shirt = new THREE.MeshStandardMaterial({ color: 0xf8fafc, roughness: 0.8 });
      const tieMaterial = new THREE.MeshStandardMaterial({ color: 0x9f3438, roughness: 0.65 });
      const dark = new THREE.MeshStandardMaterial({ color: 0x2e2927, roughness: 0.62 });
      const irisMaterial = new THREE.MeshStandardMaterial({ color: 0x5b4435, roughness: 0.5 });
      const mouthMaterial = new THREE.MeshStandardMaterial({ color: 0x70403e, roughness: 0.88 });
      const addSphere = (material, position, scale) => {
        const mesh = new THREE.Mesh(sphere, material);
        mesh.position.set(...position);
        mesh.scale.set(...scale);
        interviewer.add(mesh);
        return mesh;
      };

      // Chest-up video-call portrait: custom silhouette head, softly shaded
      // features, and an extruded tailored jacket rather than a sphere torso.
      const torsoShape = new THREE.Shape();
      torsoShape.moveTo(-1.22, -1.48);
      torsoShape.lineTo(-1.26, -0.88);
      torsoShape.quadraticCurveTo(-1.08, -0.58, -0.48, -0.5);
      torsoShape.lineTo(-0.27, -0.62);
      torsoShape.lineTo(0, -0.48);
      torsoShape.lineTo(0.27, -0.62);
      torsoShape.lineTo(0.48, -0.5);
      torsoShape.quadraticCurveTo(1.08, -0.58, 1.26, -0.88);
      torsoShape.lineTo(1.22, -1.48);
      torsoShape.closePath();
      const torsoGeometry = new THREE.ExtrudeGeometry(torsoShape, { depth: 0.38, bevelEnabled: true, bevelSegments: 3, bevelSize: 0.08, bevelThickness: 0.1, curveSegments: 10 });
      const torso = new THREE.Mesh(torsoGeometry, jacket);
      torso.position.set(0, -0.27, -0.24);
      interviewer.add(torso);
      addSphere(shirt, [0, -0.78, 0.17], [0.3, 0.53, 0.12]);
      const lapelShape = new THREE.Shape();
      lapelShape.moveTo(-0.22, -0.48); lapelShape.lineTo(-0.52, 0.31); lapelShape.lineTo(-0.1, 0.14); lapelShape.lineTo(0.02, -0.3); lapelShape.closePath();
      const lapelGeometry = new THREE.ExtrudeGeometry(lapelShape, { depth: 0.025, bevelEnabled: true, bevelSegments: 2, bevelSize: 0.018, bevelThickness: 0.015 });
      const leftLapel = new THREE.Mesh(lapelGeometry, jacket);
      leftLapel.position.set(0, -0.68, 0.34);
      interviewer.add(leftLapel);
      const rightLapel = new THREE.Mesh(lapelGeometry, jacket);
      rightLapel.scale.x = -1;
      rightLapel.position.set(0, -0.68, 0.34);
      interviewer.add(rightLapel);
      const collarShape = new THREE.Shape();
      collarShape.moveTo(-0.27, 0.16); collarShape.lineTo(-0.13, -0.29); collarShape.lineTo(0, -0.42); collarShape.lineTo(-0.05, 0.12); collarShape.closePath();
      const collarGeometry = new THREE.ShapeGeometry(collarShape);
      const collarLeft = new THREE.Mesh(collarGeometry, shirt);
      collarLeft.position.set(0, -0.45, 0.34);
      interviewer.add(collarLeft);
      const collarRight = new THREE.Mesh(collarGeometry, shirt);
      collarRight.scale.x = -1;
      collarRight.position.set(0, -0.45, 0.34);
      interviewer.add(collarRight);
      const tieShape = new THREE.Shape();
      tieShape.moveTo(-0.065, 0.03); tieShape.lineTo(0.065, 0.03); tieShape.lineTo(0.105, -0.44); tieShape.lineTo(0, -0.56); tieShape.lineTo(-0.105, -0.44); tieShape.closePath();
      const tie = new THREE.Mesh(new THREE.ShapeGeometry(tieShape), tieMaterial);
      tie.position.set(0, -0.45, 0.37);
      interviewer.add(tie);
      const neck = new THREE.Mesh(new THREE.CylinderGeometry(0.2, 0.23, 0.58, 32), skin);
      neck.position.set(0, -0.1, 0.02);
      interviewer.add(neck);
      const face = new THREE.Mesh(createHeadGeometry(), skin);
      face.position.set(0, 0.73, 0.1);
      interviewer.add(face);
      const ears = [
        addSphere(skin, [-0.59, 0.72, 0.02], [0.105, 0.18, 0.13]),
        addSphere(skin, [0.59, 0.72, 0.02], [0.105, 0.18, 0.13]),
      ];
      ears.forEach((ear) => ear.material = skin);
      addSphere(hair, [0, 1.48, -0.015], [0.59, 0.27, 0.49]);
      addSphere(hair, [-0.48, 1.11, 0.02], [0.12, 0.4, 0.35]);
      addSphere(hair, [0.48, 1.11, 0.02], [0.12, 0.4, 0.35]);
      const fringeCurve = new THREE.CatmullRomCurve3([
        new THREE.Vector3(-0.5, 1.28, 0.32), new THREE.Vector3(-0.32, 1.49, 0.44),
        new THREE.Vector3(0.02, 1.55, 0.46), new THREE.Vector3(0.34, 1.44, 0.4),
        new THREE.Vector3(0.48, 1.31, 0.32),
      ]);
      interviewer.add(new THREE.Mesh(new THREE.TubeGeometry(fringeCurve, 40, 0.09, 10, false), hairLight));
      const hairPart = new THREE.Mesh(new THREE.TubeGeometry(new THREE.CatmullRomCurve3([
        new THREE.Vector3(-0.18, 1.65, 0.28), new THREE.Vector3(0.02, 1.68, 0.33), new THREE.Vector3(0.23, 1.61, 0.34),
      ]), 18, 0.018, 6, false), hairLight);
      interviewer.add(hairPart);
      const eyes = [
        addSphere(shirt, [-0.225, 0.91, 0.59], [0.07, 0.038, 0.025]),
        addSphere(shirt, [0.225, 0.91, 0.59], [0.07, 0.038, 0.025]),
      ];
      const pupils = [
        addSphere(irisMaterial, [-0.225, 0.91, 0.616], [0.027, 0.031, 0.013]),
        addSphere(irisMaterial, [0.225, 0.91, 0.616], [0.027, 0.031, 0.013]),
      ];
      const pupilCenters = [
        addSphere(dark, [-0.225, 0.91, 0.628], [0.014, 0.02, 0.008]),
        addSphere(dark, [0.225, 0.91, 0.628], [0.014, 0.02, 0.008]),
      ];
      const eyeHighlights = [
        addSphere(shirt, [-0.232, 0.922, 0.636], [0.006, 0.007, 0.003]),
        addSphere(shirt, [0.218, 0.922, 0.636], [0.006, 0.007, 0.003]),
      ];
      const brows = [
        new THREE.CatmullRomCurve3([new THREE.Vector3(-0.32, 1.02, 0.59), new THREE.Vector3(-0.23, 1.055, 0.62), new THREE.Vector3(-0.13, 1.02, 0.60)]),
        new THREE.CatmullRomCurve3([new THREE.Vector3(0.13, 1.02, 0.60), new THREE.Vector3(0.23, 1.055, 0.62), new THREE.Vector3(0.32, 1.02, 0.59)]),
      ];
      brows.forEach((curve) => interviewer.add(new THREE.Mesh(new THREE.TubeGeometry(curve, 12, 0.026, 6, false), hair)));
      addSphere(skin, [0, 0.57, 0.68], [0.07, 0.17, 0.13]);
      addSphere(skin, [-0.045, 0.49, 0.73], [0.065, 0.055, 0.08]);
      const mouth = addSphere(mouthMaterial, [0, 0.23, 0.57], [0.09, 0.014, 0.018]);
      addSphere(skin, [0, 0.19, 0.56], [0.075, 0.025, 0.025]);

      const resize = () => {
        const width = Math.max(1, canvas.clientWidth);
        const height = Math.max(1, canvas.clientHeight);
        renderer.setSize(width, height, false);
        camera.aspect = width / height;
        camera.updateProjectionMatrix();
      };
      resize();
      if ("ResizeObserver" in window) {
        resizeObserver = new window.ResizeObserver(resize);
        resizeObserver.observe(canvas);
      } else {
        window.addEventListener("resize", resize);
      }

      const startedAt = performance.now();
      const reducedMotion = window.matchMedia?.("(prefers-reduced-motion: reduce)").matches ?? false;
      let lastRenderAt = 0;
      let inViewport = true;
      const canRender = () => inViewport && !document.hidden;
      const pauseRendering = () => {
        if (frameId !== undefined) window.cancelAnimationFrame(frameId);
        frameId = undefined;
      };
      const resumeRendering = () => {
        if (canRender() && frameId === undefined) frameId = window.requestAnimationFrame(animate);
      };
      const animate = (now) => {
        if (now - lastRenderAt >= 33) {
          lastRenderAt = now;
          const elapsed = (now - startedAt) / 1000;
          const currentState = stateRef.current;
          interviewer.position.y = reducedMotion ? 0 : Math.sin(elapsed * 1.0) * 0.012;
          interviewer.rotation.y = reducedMotion ? 0 : currentState === "thinking" ? Math.sin(elapsed * 0.6) * 0.04 : currentState === "listening" ? 0.012 : Math.sin(elapsed * 0.35) * 0.008;
          const blink = !reducedMotion && elapsed % 5.1 > 4.96 && elapsed % 5.1 < 5.08;
          eyes.forEach((eye) => { eye.scale.y = blink ? 0.004 : 0.038; });
          pupils.forEach((pupil) => { pupil.scale.y = blink ? 0.002 : 0.031; });
          pupilCenters.forEach((pupil) => { pupil.scale.y = blink ? 0.001 : 0.02; });
          eyeHighlights.forEach((highlight) => { highlight.scale.y = blink ? 0.001 : 0.007; });
          if (currentState === "speaking") {
            const speechPulse = speechBoundaryRef.current
              ? speechActivityRef.current
              : reducedMotion ? 0.18 : 0.24 + Math.abs(Math.sin(elapsed * 9.5)) * 0.3;
            mouth.scale.y = 0.012 + speechPulse * 0.055;
            mouth.scale.x = 0.09 + speechPulse * 0.018;
          } else {
            mouth.scale.set(0.09, 0.014, 0.018);
          }
          if (currentState === "disconnected") {
            skin.color.set(0xaaa39e);
          hair.color.set(0x59514b);
          } else {
            skin.color.set(0xe3b69b);
            hair.color.set(0x493326);
          }
          renderer.render(scene, camera);
        }
        if (canRender()) frameId = window.requestAnimationFrame(animate);
      };
      frameId = window.requestAnimationFrame(animate);
      document.addEventListener("visibilitychange", resumeRendering);
      if ("IntersectionObserver" in window) {
        intersectionObserver = new window.IntersectionObserver(([entry]) => {
          inViewport = entry.isIntersecting;
          if (inViewport) resumeRendering(); else pauseRendering();
        });
        intersectionObserver.observe(canvas);
      }
      setWebglReady(true);

      const handleContextLoss = (event) => {
        event.preventDefault();
        pauseRendering();
        setWebglReady(false);
      };
      canvas.addEventListener("webglcontextlost", handleContextLoss);

      return () => {
        canvas.removeEventListener("webglcontextlost", handleContextLoss);
        window.removeEventListener("resize", resize);
        resizeObserver?.disconnect();
        intersectionObserver?.disconnect();
        document.removeEventListener("visibilitychange", resumeRendering);
        pauseRendering();
        scene.traverse((object) => {
          if (object.geometry) object.geometry.dispose();
          if (object.material) {
            const materials = Array.isArray(object.material) ? object.material : [object.material];
            materials.forEach((material) => material.dispose());
          }
        });
        renderer.dispose();
      };
    } catch {
      renderer?.dispose();
      setWebglReady(false);
      return undefined;
    }
  }, []);

  return (
    <div className={`interviewer-avatar interviewer-avatar--${state}${hasSpeechBoundaryEvents ? " interviewer-avatar--word-timing" : ""}`} style={{ "--speech-activity": speechActivity }} role="img" aria-label={`AI interviewer: ${stateCopy[state]}`}>
      <canvas aria-hidden="true" className={`interviewer-avatar__canvas ${webglReady ? "" : "hidden"}`} ref={canvasRef} />
      {!webglReady ? <svg aria-hidden="true" className="interviewer-avatar__art" viewBox="0 0 420 470" xmlns="http://www.w3.org/2000/svg">
        <defs>
          <radialGradient id="avatar-halo" cx="50%" cy="35%" r="70%"><stop stopColor="#2dd4bf" stopOpacity=".34"/><stop offset="1" stopColor="#0f172a" stopOpacity="0"/></radialGradient>
          <linearGradient id="avatar-jacket" x1="0" x2="1" y1="0" y2="1"><stop stopColor="#26364d"/><stop offset="1" stopColor="#111c2e"/></linearGradient>
          <linearGradient id="avatar-face" x1="0" x2="1" y1="0" y2="1"><stop stopColor="#f6d2b6"/><stop offset=".55" stopColor="#e9b99c"/><stop offset="1" stopColor="#c98c73"/></linearGradient>
          <radialGradient id="avatar-light" cx="35%" cy="25%" r="80%"><stop stopColor="#fff" stopOpacity=".36"/><stop offset="1" stopColor="#fff" stopOpacity="0"/></radialGradient>
        </defs>
        <ellipse cx="210" cy="225" rx="190" ry="220" fill="url(#avatar-halo)"/>
        <ellipse cx="210" cy="445" rx="142" ry="18" fill="#020617" fillOpacity=".45"/>
        <path d="M66 442c12-91 61-132 144-132s132 41 144 132H66Z" fill="url(#avatar-jacket)" stroke="#94a3b8" strokeOpacity=".18" strokeWidth="3"/>
        <path d="m164 319 46 66 46-66-24-24h-44l-24 24Z" fill="#f8fafc"/>
        <path d="m187 342 23 43 23-43-23-18-23 18Z" fill="#9f3438"/>
        <path d="M183 272h54v57c-15 16-39 16-54 0v-57Z" fill="#d9a287"/>
        <path d="M123 155c0-72 36-112 88-112s88 40 88 112v61c0 67-39 112-88 112s-88-45-88-112v-61Z" fill="url(#avatar-face)" stroke="#f6d2b6" strokeOpacity=".5" strokeWidth="3"/>
        <path d="M123 169c-13-94 25-143 91-143 71 0 105 51 84 146-7-25-19-42-39-54-32 16-78 20-136 13v38Z" fill="#493326"/>
        <path d="M132 107c14-46 46-67 83-67 43 0 72 24 84 71-25-22-51-33-81-33-31 0-59 10-86 29Z" fill="#76543b" fillOpacity=".62"/>
        <path d="M143 189c9-8 23-11 37-7" fill="none" stroke="#744d42" strokeLinecap="round" strokeWidth="5"/>
        <path d="M241 182c14-4 28-1 37 7" fill="none" stroke="#744d42" strokeLinecap="round" strokeWidth="5"/>
        <g className="interviewer-avatar__eyes"><ellipse cx="162" cy="204" rx="7" ry="5" fill="#263244"/><ellipse cx="258" cy="204" rx="7" ry="5" fill="#263244"/></g>
        <path d="M210 205c-2 22-13 35-8 41 4 4 10 5 16 2" fill="none" stroke="#b77763" strokeLinecap="round" strokeWidth="4"/>
        <path className="interviewer-avatar__mouth" d="M187 269c14 9 32 9 46 0" fill="none" stroke="#8a4d47" strokeLinecap="round" strokeWidth="5"/>
        <path d="M124 159c18-55 57-89 101-89 36 0 62 16 81 49-25-18-52-26-82-26-37 0-69 15-100 43v23Z" fill="url(#avatar-light)"/>
        <path d="m108 355 58-34 45 46-58 75h-91l17-63 29-24Zm204 0-58-34-45 46 58 75h91l-17-63-29-24Z" fill="url(#avatar-jacket)" stroke="#94a3b8" strokeOpacity=".16" strokeWidth="3"/>
      </svg> : null}
      <p className="interviewer-avatar__caption">{stateCopy[state] ?? stateCopy.idle}</p>
    </div>
  );
}
