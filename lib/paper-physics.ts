import RAPIER from "@dimforge/rapier3d-compat";
let initialization: Promise<void> | undefined;
export const PAPER_COUNT = 64;
export async function createPaperPhysics() {
  await (initialization ??= RAPIER.init());
  const world = new RAPIER.World({ x: 0, y: -7.5, z: 0 });
  world.timestep = 1 / 120;
  world.numSolverIterations = 12;
  world.maxCcdSubsteps = 4;
  const box = world.createRigidBody(
    RAPIER.RigidBodyDesc.kinematicPositionBased(),
  );
  // Extend walls outward: their inner faces still match the acrylic exactly.
  const walls = [
    [1.25, 0, 0, 0.25, 1.175, 1.125],
    [-1.25, 0, 0, 0.25, 1.175, 1.125],
    [0, 0.925, 0, 1.5, 0.25, 1.125],
    [0, -0.925, 0, 1.5, 0.25, 1.125],
    [0, 0, 0.875, 1.5, 1.175, 0.25],
    [0, 0, -0.875, 1.5, 1.175, 0.25],
  ];
  walls.forEach(([x, y, z, hx, hy, hz]) =>
    world.createCollider(
      RAPIER.ColliderDesc.cuboid(hx, hy, hz)
        .setTranslation(x, y, z)
        .setFriction(0.65)
        .setRestitution(0.05),
      box,
    ),
  );
  const bodies = Array.from({ length: PAPER_COUNT }, (_, i) => {
    const body = world.createRigidBody(
      RAPIER.RigidBodyDesc.dynamic()
        .setTranslation(
          ((i % 4) - 1.5) * 0.42,
          -0.48 + Math.floor(i / 16) * 0.15,
          ((Math.floor(i / 4) % 4) - 1.5) * 0.28,
        )
        .setRotation({
          x: 0,
          y: Math.sin(i * 3) * 0.07,
          z: 0,
          w: Math.sqrt(1 - Math.sin(i * 3) ** 2 * 0.0049),
        })
        .setLinearDamping(0.35)
        .setAngularDamping(0.65)
        .setCcdEnabled(true)
        .setSoftCcdPrediction(0.12)
        .setAdditionalSolverIterations(4),
    );
    world.createCollider(
      RAPIER.ColliderDesc.cuboid(0.14, 0.022, 0.095)
        .setMass(0.004)
        .setFriction(0.5)
        .setRestitution(0.08),
      body,
    );
    return body;
  });
  let previousAngle = 0;
  return {
    world,
    bodies,
    get angle() {
      return previousAngle;
    },
    step(angle: number, seconds: number) {
      const duration = Math.min(0.1, Math.max(1 / 120, seconds));
      // Limit angular travel during a stalled browser frame so a wall cannot teleport through paper.
      angle =
        previousAngle +
        Math.max(-duration * 14, Math.min(duration * 14, angle - previousAngle));
      const steps = Math.max(1, Math.min(12, Math.ceil(duration * 120)));
      for (let i = 1; i <= steps; i++) {
        const next = previousAngle + ((angle - previousAngle) * i) / steps;
        box.setNextKinematicRotation({
          x: Math.sin(next / 2),
          y: 0,
          z: 0,
          w: Math.cos(next / 2),
        });
        world.step();
      }
      previousAngle = angle;
    },
    dispose() {
      world.free();
    },
  };
}
