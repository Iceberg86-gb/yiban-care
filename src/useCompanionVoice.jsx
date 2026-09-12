import { useEffect, useRef, useState } from "react";
import { useSpeechPlayer } from "./useSpeechPlayer.jsx";
export function useCompanionVoice({ state, profile, patientVisible }) {
  const [enabled, setEnabled] = useState(true);
  const { player: audioPlayer, ...playback } = useSpeechPlayer(
    state.runId,
    profile,
  );
  const player = useRef(audioPlayer);
  const observed = useRef({
    runId: state.runId,
    scope: state.mobile?.demo?.id,
    ids: new Set((state.mobile?.chat || []).map((m) => m.id)),
  });
  const cues = useRef(new Set());
  useEffect(() => {
    player.current.setPaused(state.pausedAt != null);
  }, [state.pausedAt]);
  useEffect(() => {
    const scope = state.mobile?.demo?.id;
    if (
      observed.current.runId !== state.runId ||
      observed.current.scope !== scope
    ) {
      player.current.stop();
      observed.current.runId = state.runId;
      observed.current.scope = scope;
      cues.current.clear();
    }
    for (const m of state.mobile?.chat || []) {
      if (!observed.current.ids.has(m.id)) {
        observed.current.ids.add(m.id);
        if (
          m.role === "assistant" &&
          (patientVisible || state.mobile?.tour?.status === "running")
        )
          player.current.enqueue(m.id, m.text);
      }
    }
    const cue = (id, text, priority = false) => {
      if (cues.current.has(id)) return;
      cues.current.add(id);
      player.current.enqueue(id, text, {
        replace: priority,
        emotion: "neutral",
      });
    };
    if (!enabled) return;
    const name = profile.salutation || "周伯",
      demo = state.mobile?.demo;
    if (patientVisible && !state.mobile?.chat?.length)
      cue("greeting:" + state.runId, `${name}，我在这里陪您。今天想聊些什么？`);
    const active =
      state.events.find((e) => e.id === demo?.eventId) ||
      state.events.find(
        (e) => e.id === state.activeId && e.status !== "closed",
      );
    if (
      active &&
      active.status !== "closed" &&
      demo?.kind !== "wayfinding" &&
      (patientVisible || state.mobile?.tour?.status === "running")
    ) {
      cue(
        "emergency:" + active.id,
        active.type === "location"
          ? "您现在想去哪里？需要联系家人吗？"
          : `${name}，您需要帮助吗？`,
        true,
      );
      if (active.status === "handling")
        cue(
          "handling:" + active.id,
          `${active.assignee}已经接手，正在联系您。`,
        );
    }
    if (demo?.kind === "medication") {
      cue(
        "medication:" + demo.id,
        `${name}，到用药提醒时间了。请先和家人核对用药安排。如果已经吃过，就不要重复吃。`,
      );
      const task = state.home.routineTasks.find((t) =>
        state.planner.occurrences.some(
          (o) =>
            o.id === t.occurrenceId &&
            state.planner.plans.some(
              (p) => p.id === o.planId && p.mobileDemoId === demo.id,
            ),
        ),
      );
      if (task?.candidate)
        cue("candidate:" + task.id, "我已经记下了，等家人一起核实这次用药。");
      if (task?.verified)
        cue(
          "verified:" + task.id,
          task.verifiedBy?.includes("演示")
            ? "演示中的家属已经确认了这次用药。"
            : "家人已经确认了这次用药。",
        );
    }
    if (patientVisible)
      for (const o of state.planner.occurrences.filter(
        (o) =>
          o.recipient === "patient" &&
          o.category === "custom" &&
          o.status === "pending",
      ))
        cue("reminder:" + o.id, o.message);
  }, [state, enabled, patientVisible]);
  const replay = (text, id = "manual") => {
    if (!enabled) {
      setEnabled(true);
      player.current.setEnabled(true);
    }
    player.current.setPaused(false);
    player.current.enqueue(id, text, { replace: true, emotion: "neutral" });
    player.current.unlock();
  };
  return {
    enabled,
    ...playback,
    arm: () => player.current.unlock(),
    stop: () => player.current.stop(),
    replay,
    toggle: () => {
      const next = !enabled;
      setEnabled(next);
      player.current.setEnabled(next);
      if (next) {
        const last = state.mobile?.chat
          ?.filter((m) => m.role === "assistant")
          .at(-1);
        replay(
          last?.text ||
            `${profile.salutation || "周伯"}，我在。您慢慢说，我听着呢。`,
          last?.id || "welcome",
        );
      }
    },
    resume: () => {
      if (playback.status === "blocked") player.current.unlock();
      else {
        const last = state.mobile?.chat
          ?.filter((m) => m.role === "assistant")
          .at(-1);
        if (last) replay(last.text, last.id);
      }
    },
  };
}
