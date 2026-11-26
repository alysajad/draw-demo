import { test } from "node:test";
import assert from "node:assert/strict";
import { PerspectiveCamera, Vector3 } from "three";
import { frameArrangement } from "../lib/scene-framing";

test("the full arrangement stays inside the canvas across camera motion and screen shapes", () => {
  for (const aspect of [0.55, 1, 1.6, 2.8, 4.5]) {
    const camera = new PerspectiveCamera(36, aspect, 0.1, 100);
    for (const [distance, height, target, azimuth, bank] of [
      [7.5, 3.1, 1.1, 0.44, 0], [5.6, 2.8, 1.65, -0.42, -0.025],
      [5.3, 2.7, 1.65, 0, 0], [5.3, 2.5, 2.15, 0, 0],
    ]) {
      camera.position.set(Math.sin(azimuth) * distance, height, Math.cos(azimuth) * distance);
      camera.lookAt(0, target, 0);
      camera.rotation.z += bank;
      frameArrangement(camera);
      // Flower perimeter, lamp bases/flames and rotating box extremities.
      const points = Array.from({ length: 32 }, (_, i) => new Vector3(Math.cos(i * Math.PI / 16) * 2, 0, Math.sin(i * Math.PI / 16) * 2));
      for (const x of [-2.37, 2.37]) for (const y of [0.05, 1.15]) points.push(new Vector3(x, y, 0.47));
      for (const x of [-1.2, 1.2]) for (const y of [0.13, 2.9]) for (const z of [-1.3, 1.3]) points.push(new Vector3(x, y, z));
      for (const point of points) {
        point.project(camera);
        assert.ok(Math.abs(point.x) <= 0.901 && Math.abs(point.y) <= 0.901, `Clipped at aspect ${aspect}`);
      }
    }
  }
});
