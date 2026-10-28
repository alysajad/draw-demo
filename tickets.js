const {
  Cam,
  fit,
  proj,
  facing,
  rings,
  prism,
  solid,
  put,
  mk,
  seg,
  tween,
  tset,
  tval,
  tdone,
  disposer,
  register,
  pointer,
} = HL;
function mount({ stage, svg, read }, value) {
  const bag = disposer(),
    C = Cam(45, 0.5, 1.9);
  fit(
    C,
    [
      [-50, -35, 0],
      [50, 35, 0],
      [-50, -35, 62],
      [50, 35, 62],
    ],
    200,
    166,
  );
  const P = proj(C),
    front = facing(C),
    g = mk("g", {}, svg);
  const [base, inside] = rings(-56, -38, 56, 38, 8, 2);
  put(solid(g), prism(P, front, base, inside, 0, 6));
  let reach = value,
    active = -1;
  const cards = [];
  for (let i = 0; i < 5; i++) {
    const y = -25 + i * 12,
      z = 12 + (4 - i) * 3;
    const [ring, inner] = rings(-39, y - 8, 39, y + 8, 3, 1);
    const body = solid(g),
      crease = mk("path", { class: "nf lo" }, body.g);
    cards.push({ body, crease, ring, inner, y, z, t: tween(z), last: NaN });
  }
  const loop = register(stage, (_dt, now) => {
    let moving = false;
    cards.forEach((c, i) => {
      const z = tval(c.t, now);
      if (z !== c.last) {
        put(c.body, prism(P, front, c.ring, c.inner, z, z + 2));
        c.crease.setAttribute(
          "d",
          seg(P(-30, c.y, z + 2.1), P(30, c.y, z + 2.1)),
        );
        c.last = z;
      }
      if (!tdone(c.t, now)) moving = true;
      c.body.sil.classList.toggle("hi", i === (active < 0 ? 2 : active));
    });
    return moving;
  });
  function select(a) {
    if (a === active) return;
    const from = a < 0 ? active : a;
    active = a;
    cards.forEach((c, i) =>
      tset(
        c.t,
        c.z + (a < 0 ? 0 : Math.max(0, reach - Math.abs(i - a) * 14)),
        performance.now(),
        Math.abs(i - from) * 40,
      ),
    );
    read.textContent = a < 0 ? "rest" : `ticket ${a + 1}`;
    loop.wake();
  }
  bag.add(loop.unregister);
  bag.add(
    pointer(stage, {
      move: ([x, y]) => {
        let nearest = -1,
          dist = 32;
        cards.forEach((c, i) => {
          const p = P(0, c.y, c.z + 2);
          const d = Math.hypot(x - p[0], y - p[1]);
          if (d < dist) {
            nearest = i;
            dist = d;
          }
        });
        select(nearest);
      },
      leave: () => select(-1),
    }),
  );
  bag.add(() => svg.replaceChildren());
  return {
    set: (v) => {
      reach = v;
      const a = active;
      active = -1;
      select(a);
    },
    destroy: bag.dispose,
  };
}
hairline({
  name: "tickets",
  means:
    "Folded tickets rest on a tray. A ticket lifts under the pointer, followed by its neighbours.",
  rules: [1, 2, 4, 7, 8, 9],
  range: [18, 28, 38],
  tour: [[215, 147], [184, 170], [167, 184], null],
  mount,
});
