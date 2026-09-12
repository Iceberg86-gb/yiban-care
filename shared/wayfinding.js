export const ROUTE_DESTINATIONS = {
  supermarket: {
    name: "超市发",
    address: "上地五街",
    question: "是您常去的上地五街的超市发吗？",
    minutes: 5,
    steps: [
      "沿现在的路向前走。",
      "走到下一个路口，向右拐。",
      "再向前走约100米，超市就在您的左手边。",
    ],
    nextLabels: ["我到路口了", "我已右转", "我找到了"],
  },
  home: {
    name: "家",
    address: "青禾社区",
    question: "您想回青禾社区的家，对吗？",
    minutes: 6,
    steps: [
      "先沿当前步道向前走。",
      "到社区入口，向左拐。",
      "沿社区内的路走到熟悉的单元门，家就在这里。",
    ],
    nextLabels: ["我到社区入口了", "我已左转", "我到家了"],
  },
  community: {
    name: "社区服务站",
    address: "青禾社区",
    question: "您想去青禾社区的服务站，对吗？",
    minutes: 4,
    steps: [
      "沿当前步道向前走。",
      "到花园路口，向左拐。",
      "再向前走一段，服务站就在右手边。",
    ],
    nextLabels: ["我到花园路口了", "我已左转", "我找到了"],
  },
};
export function directionsSpeech(route) {
  return `好的，我陪您走。${route.steps.map((s, i) => `第${["一", "二", "三"][i]}步，${s}`).join("")}全程大约${route.minutes}分钟。不用着急，小安一直陪着您。`;
}
export function splitSpeech(text, limit = 180) {
  const cleaned = String(text || "")
      .replace(/\s+/g, " ")
      .trim(),
    chunks = [];
  for (const sentence of cleaned.match(/[^。！？!?；;]+[。！？!?；;]?/g) ||
    []) {
    if (chunks.length && chunks.at(-1).length + sentence.length <= limit)
      chunks[chunks.length - 1] += sentence;
    else
      for (let i = 0; i < sentence.length; i += limit)
        chunks.push(sentence.slice(i, i + limit));
  }
  return chunks;
}
