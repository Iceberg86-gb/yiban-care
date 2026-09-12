// Stable IDs are persisted in careProfile; credentials stay on the server.
export const VOICE_OPTIONS = [
  { id: "default", name: "小安推荐", description: "使用服务端默认音色" },
  { id: "4197", name: "度沁遥", description: "知性女声 · 百度大模型" },
  { id: "4195", name: "度怀安", description: "磁性男声 · 百度大模型" },
  { id: "local", name: "本机中文", description: "无需联网的备用声音" },
];
export const VOICE_STYLES = [
  { id: "neutral", name: "平和自然" },
  { id: "happy", name: "轻快问候" },
];
export const validVoice = (value) => VOICE_OPTIONS.some((v) => v.id === value);
export const validStyle = (value) => VOICE_STYLES.some((v) => v.id === value);
export function voiceLabel(provider, speaker) {
  if (provider === "local") return "本机中文声音";
  if (provider === "baidu")
    return VOICE_OPTIONS.find((v) => v.id === speaker)?.name || "百度合成声音";
  return "正在准备声音";
}
export function speechText(value) {
  return String(value || "")
    .replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/g, "")
    .replace(/\[\[.*?\]\]/g, "")
    .replace(/\[([^\]]+)\]\(https?:\/\/[^)]+\)/g, "$1")
    .replace(/^\s{0,3}(?:#{1,6}\s+|[-*]\s+)/gm, "")
    .replace(/\*\*([^*]+)\*\*/g, "$1")
    .replace(/\n+/g, "。")
    .replace(/\s+/g, " ")
    .replace(/([。！？])。+/g, "$1")
    .trim();
}
// Keep complete thoughts together; the first short thought can start promptly.
// Do not rewrite numbers, dosages, dates, names or the underlying display text.
export function speechChunks(value, limit = 90) {
  const text = speechText(value),
    parts = [];
  const sentences = text.match(/[^。！？!?；;]+[。！？!?；;]?/g) || [];
  for (const sentence of sentences) {
    const units =
      sentence.length > limit
        ? sentence.match(/[^，,：:]+[，,：:]?/g) || [sentence]
        : [sentence];
    for (const unit of units) {
      for (let i = 0; i < unit.length; i += limit) {
        const piece = unit.slice(i, i + limit);
        // Leave the first complete sentence alone, then combine later thoughts.
        if (parts.length > 1 && parts.at(-1).length + piece.length <= limit)
          parts[parts.length - 1] += piece;
        else parts.push(piece);
      }
    }
  }
  return parts;
}
