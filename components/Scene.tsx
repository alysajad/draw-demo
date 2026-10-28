"use client";
import { Canvas, useFrame, useThree } from "@react-three/fiber";
import {
  ContactShadows,
  Environment,
  Lightformer,
  PerformanceMonitor,
  Preload,
} from "@react-three/drei";
import {
  Component,
  ReactNode,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import * as THREE from "three";
import { createTimeline } from "animejs";
import { ceremonyTiming as timing } from "@/lib/draw-animation";
import { createPaperPhysics, PAPER_COUNT } from "@/lib/paper-physics";

import type { Result } from "@/lib/model";
const brass = "#b68a38";
function Flowers() {
  const ref = useRef<THREE.InstancedMesh>(null);
  useEffect(() => {
    const o = new THREE.Object3D();
    const color = new THREE.Color();
    let i = 0;
    for (let ring = 0; ring < 15; ring++) {
      const radius = 0.15 + ring * 0.125;
      const count = Math.max(12, Math.round(radius * 100));
      for (let j = 0; j < count; j++) {
        const angle = (j / count) * Math.PI * 2;
        o.position.set(
          Math.cos(angle) * radius,
          0.075 + Math.sin(j * 7) * 0.015,
          Math.sin(angle) * radius,
        );
        o.rotation.set(0, -angle, Math.sin(j) * 0.25);
        o.scale.set(0.09, 0.027, 0.045);
        o.updateMatrix();
        ref.current!.setMatrixAt(i, o.matrix);
        ref.current!.setColorAt(
          i,
          color.set(
            ["#e5a72e", "#f4cd57", "#fff4d6", "#9b2330", "#db6f22", "#234c3c"][
              Math.floor(ring / 2) % 6
            ],
          ),
        );
        i++;
      }
    }
    ref.current!.count = i;
    ref.current!.instanceMatrix.needsUpdate = true;
    if (ref.current!.instanceColor)
      ref.current!.instanceColor.needsUpdate = true;
  }, []);
  return (
    <instancedMesh ref={ref} args={[undefined, undefined, 2200]}>
      <sphereGeometry args={[1, 7, 5]} />
      <meshStandardMaterial roughness={0.85} />
    </instancedMesh>
  );
}
function Lamp({ x }: { x: number }) {
  return (
    <group position={[x, 0.05, 0.2]}>
      <mesh position={[0, 0.04, 0]}>
        <cylinderGeometry args={[0.19, 0.26, 0.08, 32]} />
        <meshStandardMaterial color={brass} metalness={0.85} roughness={0.25} />
      </mesh>
      <mesh position={[0, 0.43, 0]}>
        <cylinderGeometry args={[0.045, 0.085, 0.8, 24]} />
        <meshStandardMaterial color={brass} metalness={0.85} roughness={0.25} />
      </mesh>
      {[0.2, 0.65, 0.86].map((y) => (
        <mesh key={y} position={[0, y, 0]}>
          <sphereGeometry args={[0.095, 20, 12]} />
          <meshStandardMaterial
            color={brass}
            metalness={0.85}
            roughness={0.25}
          />
        </mesh>
      ))}
      <mesh position={[0, 0.92, 0]}>
        <cylinderGeometry args={[0.27, 0.08, 0.09, 32]} />
        <meshStandardMaterial color={brass} metalness={0.8} roughness={0.22} />
      </mesh>
      {[0, 1, 2, 3, 4].map((i) => (
        <mesh
          key={i}
          position={[
            Math.cos(i * 1.256) * 0.19,
            1.01,
            Math.sin(i * 1.256) * 0.19,
          ]}
          scale={[0.025, 0.075, 0.025]}
        >
          <sphereGeometry args={[1, 12, 8]} />
          <meshBasicMaterial color="#ffd887" />
        </mesh>
      ))}
    </group>
  );
}
function World({
  sequence,
  reduced,
  shown,
  winner,
  prize,
  onFailure,
}: {
  sequence: number;
  reduced: boolean;
  shown: boolean;
  winner?: Result;
  prize: string;
  onFailure: () => void;
}) {
  const drum = useRef<THREE.Group>(null),
    lid = useRef<THREE.Group>(null),
    chits = useRef<THREE.InstancedMesh>(null);
  const camera = useThree((s) => s.camera),
    invalidate = useThree((s) => s.invalidate);
  const simulation = useRef<Awaited<
    ReturnType<typeof createPaperPhysics>
  > | null>(null);
  const rest = {
    spin: 0,
    lid: 0,
    lift: 0,
    unfold: 0,
    paperScale: 0.14,
    distance: 7.5,
    azimuth: 0.44,
    height: 3.1,
    target: 1.1,
    bank: 0,
  };
  const pose = useRef({ ...rest });
  const object = useMemo(() => new THREE.Object3D(), []);
  const warmup = useRef(0);
  const timeline = useRef<ReturnType<typeof createTimeline> | null>(null);
  const geometry = useMemo(() => {
    // One thin sheet folded back on itself, with a raised free edge and a visible crease.
    const shape = new THREE.Shape();
    shape.moveTo(-0.09, 0);
    shape.lineTo(0.09, 0);
    shape.lineTo(0.09, 0.004);
    shape.lineTo(-0.078, 0.032);
    shape.lineTo(-0.078, 0.027);
    shape.lineTo(0.075, 0.004);
    shape.lineTo(-0.09, 0.004);
    shape.closePath();
    const folded = new THREE.ExtrudeGeometry(shape, {
      depth: 0.19,
      bevelEnabled: false,
      steps: 1,
    });
    folded.rotateY(Math.PI / 2);
    folded.scale(1.45, 1, 1);
    folded.translate(-0.13775, -0.016, 0);
    return folded;
  }, []);
  useEffect(() => () => geometry.dispose(), [geometry]);
  useEffect(() => {
    let cancelled = false;
    simulation.current?.dispose();
    simulation.current = null;
    createPaperPhysics()
      .then((world) => {
        if (cancelled) {
          world.dispose();
          return;
        }
        simulation.current = world;
        if (reduced) for (let i = 0; i < 180; i++) world.step(0, 1 / 120);
        warmup.current = reduced ? 2 : 0;
        invalidate();
      })
      .catch(onFailure);
    return () => {
      cancelled = true;
      simulation.current?.dispose();
      simulation.current = null;
    };
  }, [sequence, reduced, invalidate, onFailure]);
  useEffect(() => {
    const p = pose.current;
    Object.assign(p, rest);
    for (let i = 0; i < PAPER_COUNT; i++)
      chits.current!.setColorAt(
        i,
        new THREE.Color(["#e9d6ad", "#fff3d7", "#f5e7c8"][i % 3]),
      );
    if (chits.current!.instanceColor)
      chits.current!.instanceColor.needsUpdate = true;
    invalidate();
    if (!sequence || reduced) return;
    const tl = createTimeline({ onUpdate: () => invalidate() })
      .add(
        p,
        {
          distance: 5.6,
          height: 2.8,
          target: 1.65,
          duration: 900,
          ease: "outQuad",
        },
        0,
      )
      .add(
        p,
        {
          spin: Math.PI * 8,
          duration: timing.fastSpinEnd,
          ease: "linear",
        },
        timing.spinStart,
      )
      .add(
        p,
        {
          spin: Math.PI * 10,
          duration: timing.spinEnd - timing.fastSpinEnd,
          ease: "outQuad",
        },
        timing.fastSpinEnd,
      )
      .add(
        p,
        { azimuth: -0.42, bank: -0.025, duration: 2200, ease: "inOutSine" },
        timing.spinStart,
      )
      .add(
        p,
        {
          azimuth: 0,
          bank: 0,
          distance: 5.3,
          height: 2.7,
          duration: 1400,
          ease: "inOutSine",
        },
        1900,
      )
      .add(p, { lid: -1.9, duration: 450, ease: "outQuad" }, timing.lidOpen)
      .add(
        p,
        {
          lift: 1.05,
          target: 2.15,
          height: 2.5,
          duration: 650,
          ease: "outQuad",
        },
        timing.paperRise,
      )
      .add(
        p,
        { unfold: 1, paperScale: 1, duration: 650, ease: "outQuad" },
        timing.paperRise + 350,
      );
    timeline.current = tl;
    return () => {
      tl.revert();
      invalidate();
    };
  }, [sequence, reduced, invalidate]);
  useEffect(() => {
    if (shown) {
      timeline.current?.pause();
      Object.assign(pose.current, {
        spin: simulation.current?.angle ?? 0,
        lid: -1.9,
        lift: 1.05,
        unfold: 1,
        paperScale: 1,
        distance: 5.3,
        azimuth: 0,
        height: 2.5,
        target: 2.15,
        bank: 0,
      });
      invalidate();
    }
  }, [shown, invalidate]);
  useFrame((_, delta) => {
    const p = pose.current;
    drum.current!.rotation.x = p.spin;
    lid.current!.rotation.x = p.lid;
    const aspect = (camera as THREE.PerspectiveCamera).aspect;
    const distance = Math.max(
      p.distance,
      (p.lift > 0.5 ? 3.6 : 2.7) / (0.65 * aspect),
    );
    camera.position.set(
      Math.sin(p.azimuth) * distance,
      p.height,
      Math.cos(p.azimuth) * distance,
    );
    camera.lookAt(0, p.target, 0);
    camera.rotation.z += p.bank;
    const sim = simulation.current;
    chits.current!.visible = !!sim;
    if (sim) {
      if (
        warmup.current < 2 ||
        (sequence > 0 &&
          (!shown ||
            Math.abs(sim.angle - (reduced ? 0 : p.spin)) > 0.0001 ||
            sim.bodies.some((body) => !body.isSleeping())))
      ) {
        sim.step(reduced ? 0 : p.spin, delta);
        warmup.current += Math.min(delta, 0.1);
        invalidate();
      }
      drum.current!.rotation.x = sim.angle;
      for (let i = 0; i < PAPER_COUNT; i++) {
        const body = sim.bodies[i];
        object.position.copy(body.translation());
        object.quaternion.copy(body.rotation());
        object.scale.setScalar(i === 0 && p.lift > 0.01 ? 0 : 1);
        object.updateMatrix();
        chits.current!.setMatrixAt(i, object.matrix);
      }
      chits.current!.instanceMatrix.needsUpdate = true;
    }
  });
  return (
    <>
      <ambientLight intensity={0.7} />
      <directionalLight position={[3, 7, 5]} intensity={3} color="#fff1d4" />
      <directionalLight position={[-4, 3, 0]} intensity={1.5} />
      <Environment resolution={128}>
        <Lightformer position={[0, 4, 2]} scale={[8, 3, 1]} intensity={3} />
        <Lightformer
          position={[-4, 2, -2]}
          rotation={[0, Math.PI / 2, 0]}
          scale={[3, 5, 1]}
          intensity={2}
        />
      </Environment>
      <Flowers />
      <Lamp x={-2.1} />
      <Lamp x={2.1} />
      <group position={[0, 0.13, 0]}>
        <mesh position={[0, 0.08, 0]}>
          <boxGeometry args={[2.4, 0.13, 0.85]} />
          <meshStandardMaterial
            color={brass}
            metalness={0.85}
            roughness={0.25}
          />
        </mesh>
        {[-1.13, 1.13].map((x) => (
          <group key={x}>
            <mesh position={[x, 0.78, 0]} rotation={[0, 0, x * 0.06]}>
              <cylinderGeometry args={[0.045, 0.08, 1.5, 24]} />
              <meshStandardMaterial
                color={brass}
                metalness={0.85}
                roughness={0.22}
              />
            </mesh>
            <mesh position={[x, 1.48, 0]} rotation={[0, 0, Math.PI / 2]}>
              <cylinderGeometry args={[0.12, 0.12, 0.18, 32]} />
              <meshStandardMaterial
                color={brass}
                metalness={0.85}
                roughness={0.22}
              />
            </mesh>
          </group>
        ))}
        <group position={[0, 1.48, 0]} ref={drum}>
          <mesh>
            <boxGeometry args={[2, 1.35, 1.25]} />
            <meshPhysicalMaterial
              color="#e9f5ef"
              transparent
              opacity={0.13}
              metalness={0.05}
              roughness={0.08}
              side={THREE.DoubleSide}
              depthWrite={false}
            />
          </mesh>
          {[-1, 1].map((x) =>
            [-0.625, 0.625].map((z) => (
              <mesh key={`${x}${z}`} position={[x, 0, z]}>
                <boxGeometry args={[0.022, 1.35, 0.022]} />
                <meshStandardMaterial
                  color="#e5d6b3"
                  metalness={0.6}
                  roughness={0.25}
                />
              </mesh>
            )),
          )}
          {[-0.675, 0.675].map((y) => (
            <group key={y}>
              {[-0.625, 0.625].map((z) => (
                <mesh key={z} position={[0, y, z]}>
                  <boxGeometry args={[2.02, 0.025, 0.025]} />
                  <meshStandardMaterial
                    color={brass}
                    metalness={0.65}
                    roughness={0.2}
                  />
                </mesh>
              ))}
              {[-1, 1].map((x) => (
                <mesh key={x} position={[x, y, 0]}>
                  <boxGeometry args={[0.025, 0.025, 1.25]} />
                  <meshStandardMaterial
                    color={brass}
                    metalness={0.65}
                    roughness={0.2}
                  />
                </mesh>
              ))}
            </group>
          ))}

          {[-1, 1].flatMap((x) =>
            [-0.675, 0.675].flatMap((y) =>
              [-0.625, 0.625].map((z) => (
                <mesh key={`${x}-${y}-${z}`} position={[x, y, z]}>
                  <sphereGeometry args={[0.035, 12, 8]} />
                  <meshStandardMaterial
                    color="#d9bf84"
                    metalness={0.95}
                    roughness={0.18}
                  />
                </mesh>
              )),
            ),
          )}
          {[-0.6, 0.6].map((x) => (
            <mesh
              key={x}
              position={[x, 0.69, -0.625]}
              rotation={[0, 0, Math.PI / 2]}
            >
              <cylinderGeometry args={[0.035, 0.035, 0.22, 16]} />
              <meshStandardMaterial
                color={brass}
                metalness={0.85}
                roughness={0.22}
              />
            </mesh>
          ))}
          <group ref={lid} position={[0, 0.69, -0.625]}>
            <mesh position={[0, 0, 0.625]}>
              <boxGeometry args={[2, 0.025, 1.25]} />
              <meshPhysicalMaterial
                color="#d8eee5"
                transparent
                opacity={0.22}
                roughness={0.1}
                depthWrite={false}
              />
            </mesh>
            <mesh position={[0, 0.04, 1.1]}>
              <boxGeometry args={[0.22, 0.065, 0.07]} />
              <meshStandardMaterial
                color={brass}
                metalness={0.8}
                roughness={0.2}
              />
            </mesh>
          </group>
        </group>
      </group>
      <group position={[0, 1.61, 0]}>
        <instancedMesh
          ref={chits}
          args={[geometry, undefined, PAPER_COUNT]}
          frustumCulled={false}
        >
          <meshStandardMaterial roughness={0.95} side={THREE.DoubleSide} />
        </instancedMesh>
      </group>

      <ContactShadows
        position={[0, -0.01, 0]}
        opacity={0.28}
        scale={10}
        blur={2.5}
        far={5}
        resolution={256}
        frames={1}
      />
    </>
  );
}
class Boundary extends Component<
  { children: ReactNode; fallback: ReactNode; onFailure: () => void },
  { failed: boolean }
> {
  state = { failed: false };
  static getDerivedStateFromError() {
    return { failed: true };
  }
  componentDidCatch() {
    this.props.onFailure();
  }
  render() {
    return this.state.failed ? this.props.fallback : this.props.children;
  }
}
export default function Scene({
  sequence,
  reduced,
  quality,
  shown,
  winner,
  prize,
  onFailure,
}: {
  sequence: number;
  reduced: boolean;
  quality: string;
  shown: boolean;
  winner?: Result;
  prize: string;
  onFailure: () => void;
}) {
  const [dpr, setDpr] = useState(1.5);
  const [failed, setFailed] = useState(false);
  const fallback = (
    <div className="scene-fallback">
      <span>✧</span>
      <p>The ceremony is ready.</p>
      <small>
        Graphics unavailable. Saved winners can still be revealed below.
      </small>
    </div>
  );
  return (
    <Boundary fallback={fallback} onFailure={onFailure}>
      {failed ? (
        fallback
      ) : (
        <Canvas
          frameloop="demand"
          dpr={quality === "low" ? 1 : dpr}
          camera={{ position: [3.2, 3.1, 6.8], fov: 36 }}
          gl={{ antialias: true, alpha: true }}
          onCreated={({ gl }) => {
            gl.domElement.addEventListener(
              "webglcontextlost",
              (e) => {
                e.preventDefault();
                setFailed(true);
                onFailure();
              },
              { once: true },
            );
          }}
        >
          <PerformanceMonitor onDecline={() => setDpr(1)} />
          <World
            sequence={sequence}
            reduced={reduced}
            shown={shown}
            winner={winner}
            prize={prize}
            onFailure={onFailure}
          />
          <Preload all />
        </Canvas>
      )}
    </Boundary>
  );
}
