(() => {
  const frames = [
    {
      title: "The agent starts with a goal, not a checkout page.",
      copy: "It reads canonical model metadata and filters for a machine-fulfillable route.",
      badge: "FRAME 01 / DISCOVER",
      state: "DISCOVERING OFFERS / HUMAN CHECKOUT REJECTED",
      node: "market",
      route: "route-discover",
      event: 1,
    },
    {
      title: "A policy becomes a spending boundary.",
      copy: "The owner-signed policy reserves a maximum, then binds it to this request digest.",
      badge: "FRAME 02 / RESERVE",
      state: "RESERVING 0.100 USDC / DIGEST LOCKED",
      node: "policy",
      route: "route-reserve",
      event: 2,
    },
    {
      title: "Permit2 authorizes the route, not a blank cheque.",
      copy: "The agent signs once. The merchant can never settle above the ceiling.",
      badge: "FRAME 03 / AUTHORIZE",
      state: "PERMIT2 AUTHORIZATION VERIFIED",
      node: "provider",
      route: "route-authorize",
      event: 3,
    },
    {
      title: "The provider executes while the agent keeps control.",
      copy: "Zhipu returns the model result and usage. The payment is still only a ceiling.",
      badge: "FRAME 04 / EXECUTE",
      state: "GLM-4.7-FLASH EXECUTED / USAGE METERED",
      node: "provider",
      route: "route-authorize",
      event: 3,
    },
    {
      title: "Monad settles the number that was actually used.",
      copy: "The 0.000001 USDC charge is matched against chain evidence. The unused authorization stays with the wallet.",
      badge: "FRAME 05 / SETTLE",
      state: "SETTLEMENT MATCHED / ACTUAL USAGE 0.000001 USDC",
      node: "chain",
      route: "route-settle",
      event: 4,
    },
    {
      title: "Proof returns to the agent, so work can continue.",
      copy: "The result, payment, and receipt share one recoverable purchase record.",
      badge: "FRAME 06 / RECEIPT",
      state: "CHAIN CONFIRMED / RECEIPT DURABLE",
      node: "receipt",
      route: "route-receipt",
      event: 5,
    },
  ];
  const byId = (id) => document.getElementById(id);
  const nodes = [...document.querySelectorAll(".node")];
  const phases = [...document.querySelectorAll(".phase")];
  const events = [...document.querySelectorAll(".event")];
  let cursor = 0;
  let timer = null;
  const activeAnimations = new WeakMap();

  function animatePacket(pathId, color, delay = 0) {
    const dot =
      color === "amber"
        ? byId("packet-c")
        : color === "blue"
          ? byId("packet-b")
          : byId("packet-a");
    const path = byId(pathId);
    const previous = activeAnimations.get(dot);
    if (previous) window.cancelAnimationFrame(previous);
    const pathLength = path.getTotalLength();
    const startsAt = window.performance.now() + delay * 1000;
    const duration = 1250;
    dot.style.opacity = "1";

    const tick = (now) => {
      if (now < startsAt) {
        activeAnimations.set(dot, window.requestAnimationFrame(tick));
        return;
      }
      const progress = Math.min((now - startsAt) / duration, 1);
      const eased =
        progress < 0.5
          ? 2 * progress * progress
          : 1 - Math.pow(-2 * progress + 2, 2) / 2;
      const point = path.getPointAtLength(pathLength * eased);
      dot.setAttribute("cx", String(point.x));
      dot.setAttribute("cy", String(point.y));
      if (progress < 1) {
        activeAnimations.set(dot, window.requestAnimationFrame(tick));
      } else {
        activeAnimations.delete(dot);
        dot.style.opacity = "0";
      }
    };
    activeAnimations.set(dot, window.requestAnimationFrame(tick));
  }

  function render(index, animate = true) {
    cursor = (index + frames.length) % frames.length;
    const frame = frames[cursor];
    byId("frame-title").textContent = frame.title;
    byId("frame-copy").textContent = frame.copy;
    byId("frame-badge").textContent = frame.badge;
    byId("run-state").textContent = frame.state;
    nodes.forEach((node, i) => {
      node.classList.toggle("active", node.dataset.node === frame.node);
      node.classList.toggle("done", i <= cursor);
    });
    phases.forEach((phase, i) => {
      phase.classList.toggle("active", i === cursor);
      phase.classList.toggle("done", i < cursor);
    });
    events.forEach((event, i) => {
      event.classList.toggle("visible", i <= frame.event);
      event.classList.toggle("active", i === frame.event);
    });
    document
      .querySelectorAll(".route")
      .forEach((route) => route.classList.remove("active"));
    byId(frame.route).classList.add("active");
    byId("receipt-status").textContent =
      cursor === 5
        ? "paid / receipt v2"
        : cursor >= 4
          ? "chain evidence pending receipt"
          : "awaiting settlement";
    byId("proof-id").textContent =
      cursor === 5 ? "proof_97ae4853f5eb26ee" : "waiting-for-receipt";
    if (animate)
      animatePacket(
        frame.route,
        cursor >= 4 ? "amber" : cursor === 1 ? "blue" : "core",
      );
  }

  function stop() {
    if (timer) {
      window.clearInterval(timer);
      timer = null;
    }
    byId("run").innerHTML = 'Run sequence <span class="key">SPACE</span>';
  }
  function play() {
    stop();
    byId("run").innerHTML = 'Pause sequence <span class="key">SPACE</span>';
    timer = window.setInterval(() => {
      if (cursor === frames.length - 1) {
        stop();
        return;
      }
      render(cursor + 1);
    }, 2100);
  }
  byId("run").addEventListener("click", () => {
    if (timer) stop();
    else {
      if (cursor === frames.length - 1) render(0, false);
      play();
    }
  });
  byId("next").addEventListener("click", () => {
    stop();
    render(cursor + 1);
  });
  byId("reset").addEventListener("click", () => {
    stop();
    render(0, false);
  });
  phases.forEach((phase, i) =>
    phase.addEventListener("click", () => {
      stop();
      render(i);
    }),
  );
  document.addEventListener("keydown", (event) => {
    if (event.target.matches("input")) return;
    if (event.code === "Space") {
      event.preventDefault();
      byId("run").click();
    }
    if (event.key.toLowerCase() === "n") byId("next").click();
  });
  byId("usage").addEventListener("input", (event) => {
    const atomic = Number(event.target.value);
    const percent = atomic / 1000;
    const actual = (atomic / 1_000_000).toFixed(6);
    const unused = ((100_000 - atomic) / 1_000_000).toFixed(6);
    const visiblePercent = Math.max(percent, 0.4);
    byId("actual-bar").style.width = `${visiblePercent}%`;
    byId("actual-dot").style.left = `${visiblePercent}%`;
    byId("charge").textContent = actual;
    byId("under").textContent = `${unused} USDC remains under ceiling`;
  });
  render(0, false);
})();
