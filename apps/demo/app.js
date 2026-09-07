(() => {
  const frames = [
    {
      title: "Kite-07 is already working when the story begins.",
      copy: "One failing checkout retry test still blocks job #418.",
      badge: "SCENE 01 / WORK",
      state: "WORKING / CHECKOUT RETRY TEST 2 OF 3",
      node: "agent",
      doneNodes: [],
      route: "route-work",
      event: 0,
      tone: "working",
      fuel: 8,
      fuelCount: "140 tokens left",
      forecast: "needs 2,300 tokens to finish",
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
      title: "The agent predicts it will run out before the fix is safe.",
      copy: "It checkpoints the job instead of producing a half-finished patch.",
      badge: "SCENE 02 / LOW TOKEN",
      state: "SAFE PAUSE / 140 AVAILABLE / 2,300 REQUIRED",
      node: "agent",
      doneNodes: ["agent"],
      route: "route-alert",
      event: 1,
      tone: "critical",
      fuel: 3,
      fuelCount: "140 tokens left",
      forecast: "shortfall: 2,160 tokens",
      agentStatus: "SAFE PAUSE",
      missionProgress: "checkpoint saved at retry.ts:87",
      beatKicker: "FUEL FORECAST",
      beatMetric: "-2,160",
      beatLabel: "token shortfall",
      log: "fuel forecast: 2,300 required\navailable: 140\nagent: checkpointing before context loss",
      experience: "network",
      experienceState: "idle",
    },
    {
      title: "Kite-07 shops for capacity it can buy by itself.",
      copy: "aiplans.dev exposes the market; human checkout is rejected and Toolkit's machine route wins.",
      badge: "SCENE 03 / DISCOVER",
      state: "SHOPPING / HUMAN PLAN REJECTED / MACHINE API SELECTED",
      node: "market",
      doneNodes: ["agent", "market"],
      route: "route-discover",
      event: 2,
      tone: "shopping",
      fuel: 3,
      fuelCount: "140 tokens left",
      forecast: "machine purchase required",
      agentStatus: "SHOPPING",
      missionProgress: "job paused / state retained",
      beatKicker: "OFFER FILTER",
      beatMetric: "1 / 3",
      beatLabel: "machine-eligible",
      log: "aiplans.dev: 3 offers found\ncoding plan: human checkout [reject]\nToolkit GLM-4.7-Flash: machine route [select]",
      experience: "market",
      experienceState: "scanning",
    },
    {
      title: "The owner policy turns money into a narrow permission.",
      copy: "The reservation binds this model, merchant, request digest, and a 0.100000 USDC ceiling.",
      badge: "SCENE 04 / RESERVE",
      state: "BUDGET RESERVED / REQUEST DIGEST LOCKED",
      node: "policy",
      doneNodes: ["agent", "market", "policy"],
      route: "route-reserve",
      event: 3,
      tone: "shopping",
      fuel: 3,
      fuelCount: "140 tokens left",
      forecast: "0.100000 USDC ceiling",
      agentStatus: "POLICY CHECK",
      missionProgress: "request bound / budget reserved",
      beatKicker: "OWNER POLICY",
      beatMetric: "0.10",
      beatLabel: "USDC maximum",
      log: "policy: toolkit + zhipu allowed\nreserve: 0.100000 USDC\nrequest digest: locked",
      experience: "market",
      experienceState: "selected",
    },
    {
      title: "Permit2 authorizes a ceiling, never a blank cheque.",
      copy: "Kite-07 signs the bounded route and Toolkit executes the Zhipu model request.",
      badge: "SCENE 05 / AUTHORIZE",
      state: "PERMIT2 VERIFIED / PROVIDER EXECUTING",
      node: "provider",
      doneNodes: ["agent", "market", "policy", "provider"],
      route: "route-authorize",
      event: 4,
      tone: "buying",
      fuel: 2,
      fuelCount: "82 tokens left",
      forecast: "authorization expires in 5 min",
      agentStatus: "BUYING CAPACITY",
      missionProgress: "waiting at safe checkpoint",
      beatKicker: "PERMIT2",
      beatMetric: "SIGNED",
      beatLabel: "bounded authorization",
      log: "Permit2 ceiling: signed\nprovider: executing request\nagent: task state remains checkpointed",
      experience: "api",
      experienceState: "configuring",
    },
    {
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
      fuelCount: "capacity restored",
      forecast: "result attached to job #418",
      agentStatus: "REFUELED",
      missionProgress: "resume token: retry.ts:87",
      beatKicker: "MODEL RESULT",
      beatMetric: "READY",
      beatLabel: "checkpoint restored",
      log: "model result: delivered\nagent context: restored\nresume token: checkout/retry.ts:87",
      experience: "api",
      experienceState: "delivered",
    },
    {
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
      fuelCount: "capacity restored",
      forecast: "receipt matched on Monad",
      agentStatus: "RECONCILING",
      missionProgress: "payment proven / task unlocked",
      beatKicker: "ACTUAL CHARGE",
      beatMetric: "0.000001",
      beatLabel: "USDC settled",
      log: "Monad transfer: 0.000001 USDC\nunused ceiling: 0.099999 USDC\npublic proof: durable",
      experience: "network",
      experienceState: "idle",
    },
    {
      title: "Kite-07 resumes the same job and finishes the work.",
      copy: "The patch continues from retry.ts:87, the final test passes, and the proof travels with the result.",
      badge: "SCENE 08 / RESUME",
      state: "JOB #418 COMPLETE / 3 OF 3 TESTS PASSING",
      node: "agent",
      doneNodes: ["agent", "market", "policy", "provider", "chain"],
      route: "route-resume",
      event: 7,
      tone: "complete",
      fuel: 72,
      fuelCount: "enough to continue",
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
      window.clearInterval(timer);
      timer = null;
    }
    byId("run").innerHTML = 'Run agent story <span class="key">SPACE</span>';
  }
  function play() {
    stop();
    byId("run").innerHTML = 'Pause story <span class="key">SPACE</span>';
    timer = window.setInterval(() => {
      if (cursor === frames.length - 1) {
        stop();
        return;
      }
      render(cursor + 1);
      if (cursor === frames.length - 1) stop();
    }, 1900);
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
