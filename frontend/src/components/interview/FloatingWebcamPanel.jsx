import { useEffect, useRef, useState } from "react";
import { clampPanelPosition, clampPanelSize, getDefaultPanelLayout } from "../../utils/webcamPanel.js";

export default function FloatingWebcamPanel({ videoRef, cameraError, onClose, onReset }) {
  const panelRef = useRef(null);
  const stageRef = useRef(null);
  const dragRef = useRef(null);
  const resizeRef = useRef(null);
  const userAdjustedRef = useRef(false);
  const wasCompactRef = useRef(null);
  const [stageSize, setStageSize] = useState({ width: 0, height: 0 });
  const [position, setPosition] = useState({ x: 0, y: 64 });
  const [size, setSize] = useState({ width: 220, height: 150 });

  useEffect(() => {
    const stage = panelRef.current?.parentElement;
    if (!stage) return undefined;
    stageRef.current = stage;
    const update = () => {
      const rect = stage.getBoundingClientRect();
      setStageSize({ width: rect.width, height: rect.height });
      const firstLayout = panelRef.current.dataset.initialized !== "true";
      const compact = rect.width < 520;
      const useCompactDefault = compact && !userAdjustedRef.current && (firstLayout || wasCompactRef.current === false);
      const defaultLayout = getDefaultPanelLayout(rect);
      const currentSize = firstLayout || useCompactDefault
        ? defaultLayout.size
        : { width: panelRef.current.offsetWidth || 220, height: panelRef.current.offsetHeight || 150 };
      const currentPosition = firstLayout || useCompactDefault
        ? defaultLayout.position
        : { x: panelRef.current.offsetLeft, y: panelRef.current.offsetTop };
      panelRef.current.dataset.initialized = "true";
      wasCompactRef.current = compact;
      setPosition(clampPanelPosition(currentPosition, currentSize, rect));
      setSize(clampPanelSize(currentSize, currentPosition, rect));
    };
    update();
    const observer = window.ResizeObserver ? new window.ResizeObserver(update) : null;
    observer?.observe(stage);
    if (!observer) window.addEventListener("resize", update);
    return () => { observer?.disconnect(); window.removeEventListener("resize", update); };
  }, []);

  function startDrag(event) {
    if (event.target.closest("button")) return;
    event.preventDefault();
    userAdjustedRef.current = true;
    const rect = panelRef.current.getBoundingClientRect();
    dragRef.current = { pointerX: event.clientX, pointerY: event.clientY, x: rect.left - stageRef.current.getBoundingClientRect().left, y: rect.top - stageRef.current.getBoundingClientRect().top };
    event.currentTarget.setPointerCapture(event.pointerId);
  }

  function moveDrag(event) {
    if (dragRef.current) {
      const stage = stageRef.current.getBoundingClientRect();
      setPosition(clampPanelPosition({
        x: dragRef.current.x + event.clientX - dragRef.current.pointerX,
        y: dragRef.current.y + event.clientY - dragRef.current.pointerY,
      }, size, stage));
    }
    if (resizeRef.current) {
      const dx = event.clientX - resizeRef.current.pointerX;
      const dy = event.clientY - resizeRef.current.pointerY;
      const stage = stageRef.current.getBoundingClientRect();
      const nextSize = clampPanelSize({ width: resizeRef.current.width + dx, height: resizeRef.current.height + dy }, position, stage);
      setSize(nextSize);
      setPosition((current) => clampPanelPosition(current, nextSize, stage));
    }
  }

  function stopPointer() {
    dragRef.current = null;
    resizeRef.current = null;
  }

  function startResize(event) {
    event.preventDefault();
    event.stopPropagation();
    userAdjustedRef.current = true;
    resizeRef.current = { pointerX: event.clientX, pointerY: event.clientY, width: size.width, height: size.height };
    event.currentTarget.setPointerCapture(event.pointerId);
  }

  function handleResizeKey(event) {
    if (!["ArrowLeft", "ArrowRight", "ArrowUp", "ArrowDown"].includes(event.key)) return;
    event.preventDefault();
    userAdjustedRef.current = true;
    const step = event.shiftKey ? 32 : 12;
    const stage = stageRef.current.getBoundingClientRect();
    const nextSize = clampPanelSize({
      width: size.width + (event.key === "ArrowRight" ? step : event.key === "ArrowLeft" ? -step : 0),
      height: size.height + (event.key === "ArrowDown" ? step : event.key === "ArrowUp" ? -step : 0),
    }, position, stage);
    setSize(nextSize);
    setPosition((current) => clampPanelPosition(current, nextSize, stage));
  }

  function handleDragKey(event) {
    const delta = event.shiftKey ? 24 : 10;
    const movement = { ArrowLeft: [-delta, 0], ArrowRight: [delta, 0], ArrowUp: [0, -delta], ArrowDown: [0, delta] }[event.key];
    if (!movement) return;
    event.preventDefault();
    userAdjustedRef.current = true;
    setPosition(clampPanelPosition({ x: position.x + movement[0], y: position.y + movement[1] }, size, stageSize));
  }

  function reset() {
    userAdjustedRef.current = false;
    const layout = getDefaultPanelLayout(stageSize);
    setSize(layout.size);
    setPosition(layout.position);
    onReset?.();
  }

  return (
    <div ref={panelRef} className="floating-webcam" role="region" aria-label="Movable webcam preview" style={{ left: position.x, top: position.y, width: size.width, height: size.height }}>
      <header className="floating-webcam__header" role="group" aria-label="Drag webcam preview. Use arrow keys to reposition." tabIndex={0} onKeyDown={handleDragKey} onPointerDown={startDrag} onPointerMove={moveDrag} onPointerUp={stopPointer} onPointerCancel={stopPointer}>
        <span aria-hidden="true" className="floating-webcam__grip">⠿</span>
        <span className="truncate">Your camera {cameraError ? "· unavailable" : "· on"}</span>
        <button aria-label="Reset webcam panel position and size" className="floating-webcam__action" onClick={reset} onPointerDown={(event) => event.stopPropagation()} type="button">↺</button>
        <button aria-label="Turn camera off" className="floating-webcam__action" onClick={onClose} onPointerDown={(event) => event.stopPropagation()} type="button">×</button>
      </header>
      {cameraError ? <div className="floating-webcam__error">{cameraError}</div> : <video className="floating-webcam__video" autoPlay muted playsInline ref={videoRef} aria-label="Local webcam preview" />}
      <button className="floating-webcam__resize" aria-label="Resize webcam panel. Use arrow keys to resize." onKeyDown={handleResizeKey} onPointerDown={startResize} onPointerMove={moveDrag} onPointerUp={stopPointer} onPointerCancel={stopPointer} type="button"><span /></button>
    </div>
  );
}
