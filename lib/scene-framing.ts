import { PerspectiveCamera, Vector3 } from "three";

// Bounds include the flowers, both lamps, and the rotating drum with its lid.
const corners = [
  ...Array.from({ length: 32 }, (_, i) => new Vector3(Math.cos(i * Math.PI / 16) * 2, 0, Math.sin(i * Math.PI / 16) * 2)),
  ...[-2.37, 2.37].flatMap(x => [0, 1.2].flatMap(y => [-0.1, 0.5].map(z => new Vector3(x, y, z)))),
  ...[-1.2, 1.2].flatMap(x => [0.13, 2.9].flatMap(y => [-1.3, 1.3].map(z => new Vector3(x, y, z)))),
];
const projected = new Vector3();

export function frameArrangement(camera: PerspectiveCamera) {
  camera.zoom = 1;
  camera.updateProjectionMatrix();
  camera.updateMatrixWorld();
  let extent = 0;
  for (const corner of corners) {
    projected.copy(corner).project(camera);
    extent = Math.max(extent, Math.abs(projected.x), Math.abs(projected.y));
  }
  camera.zoom = Math.min(1, 0.9 / extent);
  camera.updateProjectionMatrix();
}
