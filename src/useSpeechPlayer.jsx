import { useEffect, useRef, useState } from "react";
import { CompanionAudio } from "./companion-audio.js";
export function useSpeechPlayer(runId, profile = {}) {
  const [playback, setPlayback] = useState({ status: "idle", provider: null });
  const ref = useRef(null);
  if (!ref.current) ref.current = new CompanionAudio({ onChange: setPlayback });
  const player = ref.current;
  useEffect(() => {
    player.audio.hidden = true;
    player.audio.setAttribute("aria-hidden", "true");
    document.body.append(player.audio);
    return () => {
      player.destroy();
      player.audio.remove();
    };
  }, [player]);
  useEffect(() => {
    player.configure(runId, profile);
  }, [
    player,
    runId,
    profile.speechRate,
    profile.volume,
    profile.speechVoice,
    profile.speechStyle,
  ]);
  return { player, ...playback };
}
