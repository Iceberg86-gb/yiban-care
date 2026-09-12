import React from "react";
import { Navigation, Check, MapPin, Volume2 } from "lucide-react";
import { MButton, Tag } from "./MobileUI.jsx";
import { ROUTE_DESTINATIONS } from "../shared/wayfinding.js";
export default function WayfindingCard({
  message,
  navigation,
  busy,
  onAction,
  voice,
}) {
  const current = navigation?.id === message.navigationId ? navigation : null,
    active = current && !["arrived", "cancelled"].includes(current.status);
  if (message.kind === "destination-confirm")
    return (
      <>
        <p>{message.text}</p>
        {current?.status === "confirming" && (
          <div className="m-message-actions m-destination-actions">
            <MButton disabled={busy} onClick={() => onAction("confirm")}>
              是的，去这里
            </MButton>
            <MButton
              secondary
              disabled={busy}
              onClick={() => onAction("change")}
            >
              换个目的地
            </MButton>
          </div>
        )}
      </>
    );
  if (message.kind === "destination-choices")
    return (
      <>
        <p>{message.text}</p>
        {current?.status === "choosing" && (
          <div className="m-destination-choices">
            {Object.entries(ROUTE_DESTINATIONS).map(([id, r]) => (
              <button
                key={id}
                disabled={busy}
                onClick={() => onAction("select", { destination: id })}
              >
                <MapPin size={16} />
                {r.name}
                <span>{r.address}</span>
              </button>
            ))}
          </div>
        )}
      </>
    );
  if (message.kind === "directions") {
    const route = message.route;
    return (
      <div className="m-route-card">
        <p>
          <strong>好的，我陪您走。</strong>
        </p>
        <span className="m-route-destination">
          <MapPin size={14} />
          {route.address} · {route.name}
        </span>
        <ol>
          {route.steps.map((step, i) => (
            <li
              className={
                active && current.step === i
                  ? "current"
                  : current?.status === "arrived" ||
                      (current && i < current.step)
                    ? "done"
                    : ""
              }
              key={step}
            >
              <span>
                {current?.status === "arrived" ||
                (current && i < current.step) ? (
                  <Check size={13} />
                ) : (
                  i + 1
                )}
              </span>
              <div>{step}</div>
              <button
                aria-label={`播放第${i + 1}步`}
                onClick={() => voice.replay(step, `${message.id}-step-${i}`)}
              >
                <Volume2 size={15} />
              </button>
            </li>
          ))}
        </ol>
        <div className="m-route-estimate">
          <Navigation size={23} />
          <div>
            <strong>全程约 {route.minutes} 分钟</strong>
            <small>不用着急，小安一直陪着您</small>
          </div>
        </div>
        <small className="m-route-disclosure">
          路线情境演示 · 不使用真实定位
        </small>
        {active && current.status === "guiding" && (
          <MButton
            disabled={busy}
            onClick={() => onAction(current.step === 2 ? "arrived" : "next")}
          >
            {route.nextLabels[current.step]}
          </MButton>
        )}
        {active && (
          <div className="m-route-options">
            <button disabled={busy} onClick={() => onAction("change")}>
              更换目的地
            </button>
            <button disabled={busy} onClick={() => onAction("cancel")}>
              先不去了
            </button>
          </div>
        )}
        {current?.status === "arrived" && <Tag>已记录您确认到达</Tag>}
        {!current && <Tag>历史路线示例</Tag>}
      </div>
    );
  }
  return <p>{message.text}</p>;
}
