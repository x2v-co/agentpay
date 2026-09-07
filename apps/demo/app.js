(() => {
  const frames = [
    {
      duration: 2600,
      title: "Kite-07 is already working when the story begins.",
      copy: "Teaching fixture: one failing checkout retry test blocks job #418. These notebook events are scripted.",
      badge: "SCENE 01 / WORK",
      state: "WORKING / CHECKOUT RETRY TEST 2 OF 3",
      node: "agent",
      doneNodes: [],
      route: "route-work",
      event: 0,
      tone: "working",
      fuel: 18,
      fuelCount: "capacity pressure detected",
      forecast: "bounded refill available",
      agentStatus: "WORKING",
      missionProgress: "2 / 3 tests passing",
      beatKicker: "JOB #418",
      beatMetric: "2 / 3",
      beatLabel: "tests passing",
      log: "$ npm test checkout-retry\nFAIL retry preserves idempotency\nagent: inspecting payment state...",
      experience: "network",
      experienceState: "idle",
    },
    {
      duration: 3000,
      title: "The scenario triggers a capacity checkpoint.",
      copy: "The pause is scripted. Capacity indicators do not measure a real token balance.",
      badge: "SCENE 02 / LOW TOKEN",
      state: "SAFE PAUSE / CAPACITY CHECK REQUIRED",
      node: "agent",
      doneNodes: ["agent"],
      route: "route-alert",
      event: 1,
      tone: "critical",
      fuel: 6,
      fuelCount: "below finish threshold",
      forecast: "checkpoint before context loss",
      agentStatus: "SAFE PAUSE",
      missionProgress: "checkpoint saved at retry.ts:87",
      beatKicker: "FUEL FORECAST",
      beatMetric: "LOW",
      beatLabel: "capacity forecast",
      log: "fuel forecast: below finish threshold\nagent: checkpointing before context loss\nprocurement: autonomous refill requested",
      experience: "network",
      experienceState: "idle",
    },
    {
      duration: 5500,
      title: "Kite-07 shops for capacity it can buy by itself.",
      copy: "The real aiplans.dev catalog becomes a machine-readable market; AgentPay then filters for autonomous checkout.",
      badge: "SCENE 03 / DISCOVER",
      state: "SHOPPING / PRICED ROUTES COMPARED / AGENTPAY READY",
      node: "market",
      doneNodes: ["agent", "market"],
      route: "route-discover",
      event: 2,
      tone: "shopping",
      fuel: 6,
      fuelCount: "job safely checkpointed",
      forecast: "machine purchase required",
      agentStatus: "SHOPPING",
      missionProgress: "job paused / state retained",
      beatKicker: "OFFER FILTER",
      beatMetric: "3",
      beatLabel: "priced routes compared",
      log: "Zhipu: CNY 0 / 0 per 1M\nOpenRouter: USD 0.06 / 0.40 per 1M\nToolkit testnet route: AgentPay ready [select]",
      experience: "market",
      experienceState: "scanning",
    },
    {
      duration: 3800,
      title: "The owner policy turns money into a narrow permission.",
      copy: "The reservation binds this model, merchant, request digest, and a 0.100000 USDC ceiling.",
      badge: "SCENE 04 / RESERVE",
      state: "BUDGET RESERVED / REQUEST DIGEST LOCKED",
      node: "policy",
      doneNodes: ["agent", "market", "policy"],
      route: "route-reserve",
      event: 3,
      tone: "shopping",
      fuel: 6,
      fuelCount: "job safely checkpointed",
      forecast: "0.100000 USDC ceiling",
      agentStatus: "POLICY CHECK",
      missionProgress: "request bound / budget reserved",
      beatKicker: "OWNER POLICY",
      beatMetric: "0.100000",
      beatLabel: "USDC ceiling",
      log: "policy: toolkit + zhipu allowed\nPermit2 ceiling: 100,000 atomic USDC\nrequest digest: locked",
      experience: "market",
      experienceState: "selected",
    },
    {
      duration: 5200,
      title: "Permit2 authorizes a ceiling, never a blank cheque.",
      copy: "A real Toolkit page capture accompanies an illustrative configuration overlay. No new API key or payment permission is created.",
      badge: "SCENE 05 / AUTHORIZE",
      state: "PERMIT2 VERIFIED / PROVIDER EXECUTING",
      node: "provider",
      doneNodes: ["agent", "market", "policy", "provider"],
      route: "route-authorize",
      event: 4,
      tone: "buying",
      fuel: 5,
      fuelCount: "request bounds locked",
      forecast: "1,024 input est. / 256 output cap",
      agentStatus: "BUYING CAPACITY",
      missionProgress: "waiting at safe checkpoint",
      beatKicker: "PERMIT2",
      beatMetric: "1 ATOMIC",
      beatLabel: "preflight maximum",
      log: "input estimate: 1,024 tokens\noutput cap: 256 tokens\npreflight worst case: 1 atomic USDC",
      experience: "api",
      experienceState: "configuring",
    },
    {
      duration: 3800,
      title: "The purchased result returns to the exact pause point.",
      copy: "Capacity is restored before settlement finalizes; the original job never loses its place.",
      badge: "SCENE 06 / REFUEL",
      state: "CAPACITY RESTORED / CHECKPOINT READY",
      node: "provider",
      doneNodes: ["agent", "market", "policy", "provider"],
      route: "route-refuel",
      event: 5,
      tone: "restored",
      fuel: 100,
      fuelCount: "273 tokens metered",
      forecast: "17 input / 256 output",
      agentStatus: "REFUELED",
      missionProgress: "resume token: retry.ts:87",
      beatKicker: "MODEL RESULT",
      beatMetric: "273",
      beatLabel: "actual total tokens",
      log: "provider usage: 17 input + 256 output\nmodel result: delivered\nresume token: checkout/retry.ts:87",
      experience: "api",
      experienceState: "delivered",
    },
    {
      duration: 4200,
      title: "Monad charges only what the agent actually consumed.",
      copy: "The verified transfer is 0.000001 USDC; the other 0.099999 remains unused.",
      badge: "SCENE 07 / SETTLE",
      state: "SETTLEMENT MATCHED / 1 ATOMIC USDC",
      node: "chain",
      doneNodes: ["agent", "market", "policy", "provider", "chain"],
      route: "route-settle",
      event: 6,
      tone: "settled",
      fuel: 100,
      fuelCount: "273 tokens metered",
      forecast: "receipt matched on Monad",
      agentStatus: "RECONCILING",
      missionProgress: "payment proven / task unlocked",
      beatKicker: "ACTUAL CHARGE",
      beatMetric: "0.000001",
      beatLabel: "USDC settled",
      log: "meter: ceil((17 x 2 + 256 x 8) / 1M)\nMonad transfer: 1 atomic USDC\nunused ceiling: 0.099999 USDC",
      experience: "network",
      experienceState: "idle",
    },
    {
      duration: 4500,
      title: "The scripted task resumes at its checkpoint.",
      copy: "The repair is a teaching fixture, not output from the historical model call. Run its acceptance tests in the interactive commission.",
      badge: "SCENE 08 / RESUME",
      state: "JOB #418 COMPLETE / 3 OF 3 TESTS PASSING",
      node: "agent",
      doneNodes: ["agent", "market", "policy", "provider", "chain"],
      route: "route-resume",
      event: 7,
      tone: "complete",
      fuel: 72,
      fuelCount: "273 tokens delivered",
      forecast: "next job can start autonomously",
      agentStatus: "SHIPPING",
      missionProgress: "3 / 3 tests passing",
      beatKicker: "JOB #418",
      beatMetric: "PASS",
      beatLabel: "work completed",
      log: "agent: resumed at retry.ts:87\nPASS retry preserves idempotency\njob #418: ready to ship",
      experience: "network",
      experienceState: "idle",
    },
  ];
  const byId = (id) => document.getElementById(id);
  const nodes = [...document.querySelectorAll(".node")];
  const phases = [...document.querySelectorAll(".phase")];
  const events = [...document.querySelectorAll(".event")];
  let cursor = 0;
  let timer = null;
  let playing = false;
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
    nodes.forEach((node) => {
      node.classList.toggle("active", node.dataset.node === frame.node);
      node.classList.toggle("done", frame.doneNodes.includes(node.dataset.node));
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
    byId("agent-story").dataset.tone = frame.tone;
    byId("story-core").dataset.tone = frame.tone;
    byId("canvas").dataset.experience = frame.experience;
    const experienceOverlay = byId("experience-overlay");
    experienceOverlay.dataset.state = "idle";
    if (animate) void experienceOverlay.offsetWidth;
    experienceOverlay.dataset.state = frame.experienceState;
    experienceOverlay.setAttribute(
      "aria-hidden",
      String(frame.experience === "network"),
    );
    byId("market-browser").setAttribute(
      "aria-hidden",
      String(frame.experience !== "market"),
    );
    byId("api-console").setAttribute(
      "aria-hidden",
      String(frame.experience !== "api"),
    );
    byId("api-stage-status").textContent =
      frame.experienceState === "delivered" ? "CAPACITY READY" : "CONFIGURING";
    byId("timeline").style.setProperty(
      "--scene-duration",
      `${frame.duration}ms`,
    );
    byId("agent-status").textContent = frame.agentStatus;
    byId("fuel-count").textContent = frame.fuelCount;
    byId("fuel-forecast").textContent = frame.forecast;
    byId("fuel-bar").style.width = `${frame.fuel}%`;
    byId("mission-progress").textContent = frame.missionProgress;
    byId("beat-kicker").textContent = frame.beatKicker;
    byId("beat-metric").textContent = frame.beatMetric;
    byId("beat-label").textContent = frame.beatLabel;
    const runtimeLog = byId("runtime-log");
    runtimeLog.textContent = frame.log;
    runtimeLog.classList.remove("refresh");
    if (animate) {
      void runtimeLog.offsetWidth;
      runtimeLog.classList.add("refresh");
    }
    byId("receipt-status").textContent =
      cursor === 7
        ? "paid / receipt v2"
        : cursor >= 6
          ? "chain confirmed / restoring job"
          : "awaiting settlement";
    byId("proof-id").textContent =
      cursor >= 6 ? "proof_97ae4853f5eb26ee" : "waiting-for-receipt";
    if (animate)
      animatePacket(
        frame.route,
        cursor >= 4 ? "amber" : cursor === 1 ? "blue" : "core",
      );
  }

  function stop() {
    if (timer) {
      window.clearTimeout(timer);
      timer = null;
    }
    playing = false;
    byId("timeline").classList.remove("is-playing");
    byId("run").innerHTML = 'Run agent story <span class="key">SPACE</span>';
  }
  function scheduleNext() {
    const timeline = byId("timeline");
    timeline.classList.remove("is-playing");
    void timeline.offsetWidth;
    timeline.classList.add("is-playing");
    timer = window.setTimeout(() => {
      if (cursor === frames.length - 1) {
        stop();
        return;
      }
      render(cursor + 1);
      scheduleNext();
    }, frames[cursor].duration);
  }
  function play() {
    stop();
    playing = true;
    byId("run").innerHTML = 'Pause story <span class="key">SPACE</span>';
    render(cursor);
    scheduleNext();
  }
  byId("run").addEventListener("click", () => {
    if (playing) stop();
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
  render(0, false);
})();
