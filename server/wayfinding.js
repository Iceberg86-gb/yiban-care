import { randomUUID } from "node:crypto";
import { CareError } from "./errors.js";
import { ROUTE_DESTINATIONS, directionsSpeech } from "../shared/wayfinding.js";
const iso = (n) => new Date(n).toISOString();
function message(engine, role, text, extra = {}) {
  engine.state.mobile.chat.push({
    id: randomUUID(),
    role,
    text,
    at: iso(engine.now()),
    source: "找路情境演示",
    navigationId: engine.state.mobile.navigation?.id,
    ...extra,
  });
  engine.state.mobile.chat = engine.state.mobile.chat.slice(-60);
}
export function beginWayfinding(
  engine,
  destination = "supermarket",
  userText = "帮我找到去超市发的路",
) {
  const route = Object.hasOwn(ROUTE_DESTINATIONS, destination)
    ? ROUTE_DESTINATIONS[destination]
    : null;
  if (!route) throw new CareError("请从演示目的地中选择。");
  const n = {
    id: randomUUID(),
    version: 0,
    status: "confirming",
    destination,
    step: 0,
    startedAt: iso(engine.now()),
    sourceMode: "simulated",
  };
  engine.state.mobile.navigation = n;
  message(engine, "user", userText);
  message(engine, "assistant", route.question, {
    kind: "destination-confirm",
    navigationId: n.id,
  });
  return n;
}
export function wayfindingAction(engine, body) {
  const n = engine.state.mobile.navigation;
  if (!n || n.id !== body.navigationId || n.version !== body.version)
    throw new CareError("找路进度已更新，请按当前提示继续。", 409);
  const route = ROUTE_DESTINATIONS[n.destination];
  if (body.op === "confirm") {
    if (n.status !== "confirming") throw new CareError("请先确认当前目的地。");
    n.status = "guiding";
    n.step = 0;
    message(engine, "user", "是的");
    message(engine, "assistant", directionsSpeech(route), {
      kind: "directions",
      navigationId: n.id,
      route: structuredClone(route),
    });
  } else if (body.op === "change") {
    n.status = "choosing";
    message(engine, "user", "不是，我想换一个地方");
    message(
      engine,
      "assistant",
      "好的，先确认您想去哪里。可以去超市发、社区服务站，或者回家。",
      { kind: "destination-choices", navigationId: n.id },
    );
  } else if (body.op === "select") {
    const selected = Object.hasOwn(ROUTE_DESTINATIONS, body.destination)
      ? ROUTE_DESTINATIONS[body.destination]
      : null;
    if (!selected) throw new CareError("请选择有效的演示目的地。");
    n.destination = body.destination;
    n.status = "confirming";
    n.step = 0;
    message(engine, "user", `我想去${selected.name}`);
    message(engine, "assistant", selected.question, {
      kind: "destination-confirm",
      navigationId: n.id,
    });
  } else if (body.op === "next") {
    if (n.status !== "guiding" || n.step >= 2)
      throw new CareError("请按当前找路提示操作。");
    message(engine, "user", route.nextLabels[n.step]);
    n.step++;
    message(
      engine,
      "assistant",
      n.step === 1
        ? `好的，${route.steps[1]}不用着急，我会接着提醒您。`
        : `接下来，${route.steps[2]}`,
      { kind: "route-step", navigationId: n.id, step: n.step },
    );
  } else if (body.op === "arrived") {
    if (n.status !== "guiding")
      throw new CareError("当前没有进行中的找路演示。");
    n.status = "arrived";
    n.finishedAt = iso(engine.now());
    message(engine, "user", route.nextLabels[2]);
    message(
      engine,
      "assistant",
      `找到就好！您已经确认到了${route.name}。今天也慢慢来，需要时再叫小安。`,
      { kind: "route-arrived", navigationId: n.id },
    );
  } else if (body.op === "cancel") {
    n.status = "cancelled";
    message(
      engine,
      "assistant",
      "好的，我们先停下来。需要帮助时，可以联系家人。",
      { navigationId: n.id },
    );
  } else throw new CareError("无效的找路操作。");
  n.version++;
}
export function routeChat(engine, text) {
  const n = engine.state.mobile.navigation;
  if (
    n?.status === "confirming" &&
    /^(是的?|对的?|没错|好的?)[。！!\s]*$/.test(text)
  ) {
    wayfindingAction(engine, {
      navigationId: n.id,
      version: n.version,
      op: "confirm",
    });
    return true;
  }
  if (n?.status === "confirming" && /不是|换个|换一个/.test(text)) {
    wayfindingAction(engine, {
      navigationId: n.id,
      version: n.version,
      op: "change",
    });
    return true;
  }
  if (n?.status === "guiding" && /我找到了|我到家了|我到超市了/.test(text)) {
    wayfindingAction(engine, {
      navigationId: n.id,
      version: n.version,
      op: "arrived",
    });
    return true;
  }
  if (
    n?.status === "guiding" &&
    /到(?:了)?路口|右转|左转|到社区入口|到花园路口|完成这一步|下一步/.test(
      text,
    ) &&
    n.step < 2
  ) {
    wayfindingAction(engine, {
      navigationId: n.id,
      version: n.version,
      op: "next",
    });
    return true;
  }
  if (/找路|怎么走|去.+的路|导航|带我去|超市发|回家/.test(text)) {
    const destination = /回家/.test(text)
      ? "home"
      : /服务站/.test(text)
        ? "community"
        : "supermarket";
    const next = beginWayfinding(engine, destination, text);
    if (!/回家|服务站|超市/.test(text)) {
      next.status = "choosing";
      const reply = engine.state.mobile.chat.at(-1);
      reply.kind = "destination-choices";
      reply.text =
        "先确认您想去哪里。这次演示可以选择超市发、社区服务站，或者回家。其他目的地可以请家人帮您确认。";
    }
    return true;
  }
  return false;
}
