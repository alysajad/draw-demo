import { test } from "node:test";
import assert from "node:assert/strict";
import { createPaperPhysics, PAPER_COUNT } from "../lib/paper-physics";
test("folded papers stay inside the rotating collider and settle under gravity", async () => {
  const simulation = await createPaperPhysics();
  try {
    assert.equal(simulation.bodies.length, PAPER_COUNT);
    for (let frame = 0; frame < 840; frame++) {
      const t = Math.min(1, Math.max(0, (frame - 120) / 600));
      const angle = (8 * Math.PI * (1 - Math.cos(Math.PI * t))) / 2;
      simulation.step(angle, 1 / 60);
      for (const body of simulation.bodies) {
        const p = body.translation();
        const y = p.y * Math.cos(angle) + p.z * Math.sin(angle);
        const z = -p.y * Math.sin(angle) + p.z * Math.cos(angle);
        assert.ok(
          Math.abs(p.x) < 1.05 && Math.abs(y) < 0.75 && Math.abs(z) < 0.72,
          `Escaped: ${p.x},${y},${z}`,
        );
      }
    }
    for (let i = 0; i < 240; i++) simulation.step(8 * Math.PI, 1 / 120);
    const height =
      simulation.bodies.reduce((sum, b) => sum + b.translation().y, 0) /
      PAPER_COUNT;
    assert.ok(
      height < -0.3,
      "Paper should settle into the bottom half of the box",
    );
  } finally {
    simulation.dispose();
  }
});

test("stalled animation frames cannot teleport the collider through paper", async () => {
  const sim = await createPaperPhysics();
  try {
    for (let i = 0; i < 180; i++) {
      sim.step(i < 30 ? 0 : Math.PI * 8, 0.1);
      const angle = sim.angle;
      for (const b of sim.bodies) {
        const p = b.translation();
        assert.ok(
          Math.abs(p.y * Math.cos(angle) + p.z * Math.sin(angle)) < 0.76,
        );
        assert.ok(
          Math.abs(-p.y * Math.sin(angle) + p.z * Math.cos(angle)) < 0.73,
        );
      }
    }
  } finally {
    sim.dispose();
  }
});
