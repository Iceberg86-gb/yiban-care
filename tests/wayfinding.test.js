import test from "node:test";
import assert from "node:assert/strict";
import { CareEngine } from "../server/engine.js";
import { mobileAction } from "../server/mobile.js";
import { createSpeechService } from "../server/speech.js";
import { CompanionAudio } from "../src/companion-audio.js";
import { splitSpeech } from "../shared/wayfinding.js";
const setup = () => {
  const e = new CareEngine({ now: () => Date.parse("2026-09-12T02:00:00Z") });
  const cmd = (action, data = {}) =>
    mobileAction(e, { runId: e.state.runId, action, ...data });
  const move = (op, data = {}) =>
    cmd("wayfinding", {
      navigationId: e.state.mobile.navigation.id,
      version: e.state.mobile.navigation.version,
      op,
      ...data,
    });
  return { e, cmd, move };
};
test("找路先确认目的地，再生成三步路线并记录本人到达", () => {
  const { e, cmd, move } = setup();
  cmd("start", { kind: "wayfinding" });
  assert.equal(e.state.mobile.navigation.status, "confirming");
  assert.equal(e.state.mobile.chat.at(-1).kind, "destination-confirm");
  assert.equal(
    e.state.mobile.chat.some((m) => m.kind === "directions"),
    false,
  );
  move("confirm");
  assert.equal(e.state.mobile.chat.at(-1).route.steps.length, 3);
  move("next");
  assert.equal(e.state.mobile.navigation.step, 1);
  move("next");
  assert.equal(e.state.mobile.navigation.step, 2);
  move("arrived");
  assert.equal(e.state.mobile.navigation.status, "arrived");
  assert.match(e.state.mobile.chat.at(-1).text, /确认到了超市发/);
  assert.equal(e.state.events.length, 0);
});
test("目的地可更换，旧进度不能继续操作新的路线", () => {
  const { e, cmd, move } = setup();
  cmd("start", { kind: "wayfinding" });
  const id = e.state.mobile.navigation.id,
    version = e.state.mobile.navigation.version;
  move("change");
  move("select", { destination: "home" });
  assert.match(e.state.mobile.chat.at(-1).text, /青禾社区/);
  assert.throws(
    () => cmd("wayfinding", { navigationId: id, version, op: "confirm" }),
    /进度已更新/,
  );
  move("confirm");
  assert.match(e.state.mobile.chat.at(-1).text, /单元门/);
  cmd("start", { kind: "chat" });
  assert.equal(e.state.mobile.navigation.status, "cancelled");
  assert.throws(() => move("next"));
});
test("聊天文本可触发找路并确认，普通的“是的”不凭空生成路线", () => {
  const { e, cmd } = setup();
  cmd("chat", { text: "是的" });
  assert.equal(e.state.mobile.navigation, undefined);
  cmd("chat", { text: "帮我找到去超市发的路" });
  assert.equal(e.state.mobile.navigation.status, "confirming");
  cmd("chat", { text: "是的" });
  assert.equal(e.state.mobile.navigation.status, "guiding");
  cmd("chat", { text: "我到路口了" });
  assert.equal(e.state.mobile.navigation.step, 1);
  cmd("chat", { text: "我找到了" });
  assert.equal(e.state.mobile.navigation.status, "arrived");
});
test("语音合成去重、缓存，拒绝无效和超长文本", async () => {
  let calls = 0;
  const service = createSpeechService({
    synthesizeLocal: async () => {
      calls++;
      return {
        audio: Buffer.from("RIFF test"),
        type: "audio/wav",
        provider: "local",
      };
    },
  });
  const [a, b] = await Promise.all([
    service.synthesize("沿现在的路向前走。"),
    service.synthesize("沿现在的路向前走。"),
  ]);
  assert.equal(calls, 1);
  assert.equal(a, b);
  await service.synthesize("沿现在的路向前走。");
  assert.equal(calls, 1);
  assert.throws(() => service.synthesize("x".repeat(301)));
  assert.throws(() => service.synthesize("你好", 20));
});
test("百度合成验证响应类型，失败回退时不把本机声音标成百度", async () => {
  let requests = 0;
  const service = createSpeechService({
    key: "test",
    secret: "test",
    fetcher: async () => {
      requests++;
      return requests === 1
        ? new Response(
            JSON.stringify({ access_token: "test-token", expires_in: 3600 }),
            { headers: { "Content-Type": "application/json" } },
          )
        : new Response(JSON.stringify({ err_no: 500 }), {
            headers: { "Content-Type": "application/json" },
          });
    },
    synthesizeLocal: async () => ({
      audio: Buffer.from("RIFF sample"),
      type: "audio/wav",
      provider: "local",
    }),
  });
  const result = await service.synthesize("好的，我陪您走。");
  assert.equal(result.provider, "local");
  assert.equal(result.fallback, true);
  assert.equal(service.status().verified, false);
  assert.equal("secret" in service.status(), false);
});
const flush = () => new Promise((resolve) => setImmediate(resolve));
function playerFixture(
  fetcher = async () =>
    new Response("wave", {
      headers: { "Content-Type": "audio/wav", "X-Voice-Provider": "local" },
    }),
) {
  const audio = {
    playCalls: 0,
    paused: true,
    play() {
      this.playCalls++;
      this.paused = false;
      return Promise.resolve();
    },
    pause() {
      this.paused = true;
    },
    setAttribute() {},
    removeAttribute() {},
  };
  let revoked = 0;
  const player = new CompanionAudio({
    fetcher,
    createAudio: () => audio,
    createURL: () => `blob:test`,
    revokeURL: () => revoked++,
  });
  player.configure("run", { speechRate: 0.85, volume: 0.8 });
  return { audio, player, revoked: () => revoked };
}
test("新应答按顺序播报，同一消息不重复，结束后播放下一句", async () => {
  const { player, audio, revoked } = playerFixture();
  player.enqueue("a", "第一步，向前走。");
  player.enqueue("a", "第一步，向前走。");
  player.enqueue("b", "第二步，向右拐。");
  await flush();
  assert.equal(audio.playCalls, 1);
  assert.equal(player.state.messageId, "a");
  audio.onended();
  await flush();
  assert.equal(audio.playCalls, 2);
  assert.equal(player.state.messageId, "b");
  assert.equal(revoked(), 1);
  player.destroy();
});
test("关闭语音后忽略迟到的合成响应，暂停不会丢掉待播队列", async () => {
  let release;
  const { player, audio } = playerFixture(
    () =>
      new Promise((r) => {
        release = r;
      }),
  );
  player.enqueue("a", "您好");
  player.stop();
  release(new Response("wave"));
  await flush();
  assert.equal(audio.playCalls, 0);
  const next = playerFixture();
  next.player.setPaused(true);
  next.player.enqueue("b", "我陪您走");
  await flush();
  assert.equal(next.audio.playCalls, 0);
  next.player.setPaused(false);
  await flush();
  assert.equal(next.audio.playCalls, 1);
  next.player.destroy();
});
test("长回复按段拆分，保留全部文字和顺序", () => {
  const text = "您好。" + "沿这条路向前走。".repeat(50);
  const parts = splitSpeech(text);
  assert.ok(parts.every((p) => p.length <= 180));
  assert.equal(parts.join(""), text);
});
test("未知目的地先给出选择，不编造医院路线；目的地ID按白名单验证", () => {
  const { e, cmd, move } = setup();
  cmd("chat", { text: "去医院怎么走" });
  assert.equal(e.state.mobile.navigation.status, "choosing");
  assert.equal(e.state.mobile.chat.at(-1).kind, "destination-choices");
  assert.throws(() => move("select", { destination: "__proto__" }));
  assert.equal(e.state.mobile.navigation.status, "choosing");
});
test("浏览器阻止自动播放时保留待播音频，用户开启后可继续", async () => {
  const { player, audio } = playerFixture();
  let blocked = true;
  audio.play = () =>
    blocked
      ? Promise.reject(
          Object.assign(new Error("blocked"), { name: "NotAllowedError" }),
        )
      : Promise.resolve();
  player.enqueue("guide", "下一路口向右拐。");
  await flush();
  assert.equal(player.state.status, "blocked");
  assert.ok(player.current.url);
  blocked = false;
  player.unlock();
  await flush();
  assert.equal(player.state.status, "playing");
  player.destroy();
});
test("百度返回有效音频时才标记已验证，并在服务端复用token", async () => {
  let requests = 0;
  const service = createSpeechService({
    key: "demo-key",
    secret: "demo-secret",
    fetcher: async (_url, options) => {
      requests++;
      if (requests === 1)
        return new Response(
          JSON.stringify({ access_token: "private-token", expires_in: 3600 }),
        );
      assert.equal(options.body.get("ctp"), "1");
      assert.equal(options.body.get("lan"), "zh");
      return new Response(new Uint8Array([73, 68, 51, 1]), {
        headers: { "Content-Type": "audio/mpeg" },
      });
    },
  });
  assert.equal((await service.synthesize("第一句")).provider, "baidu");
  await service.synthesize("第二句");
  assert.equal(requests, 3);
  assert.equal(service.status().verified, true);
  assert.equal(
    JSON.stringify(service.status()).includes("private-token"),
    false,
  );
});
