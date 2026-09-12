import { VoicePreferences } from "./VoicePreferences.jsx";
import React, { useState } from "react";
import {
  Camera,
  Watch,
  Monitor,
  Smartphone,
  Activity,
  Users,
  Route,
  Clock3,
  Pill,
  CupSoda,
  SlidersHorizontal,
  ShieldCheck,
  Volume2,
  BookOpen,
  UserRound,
  Plus,
  Heart,
  Droplets,
  DoorOpen,
  Moon,
} from "lucide-react";
import { Tag, MButton, Row, Sheet, Field } from "./MobileUI.jsx";
import { CARE_PROFILE, hydrationTimes } from "../shared/mobile.js";
import { GUIDANCE, HOME_RULES } from "../shared/home.js";
const types = {
  camera: ["摄像头", Camera],
  band: ["健康手环", Watch],
  screen: ["智能屏", Monitor],
  phone: ["老人手机", Smartphone],
  pressure: ["血压计", Activity],
  glucose: ["血糖仪", Droplets],
  door: ["门磁", DoorOpen],
  sleep: ["睡眠带", Moon],
};
export default function MobileSettings({
  state,
  perform,
  busy,
  onMedical,
  onMedication,
  onMap,
  onPatient,
}) {
  const h = state.home,
    p = { ...CARE_PROFILE, ...h.careProfile };
  const [edit, setEdit] = useState(null),
    [draft, setDraft] = useState({});
  const open = (kind, value = {}) => {
    setDraft(structuredClone(value));
    setEdit(kind);
  };
  const set = (k, v) => setDraft((d) => ({ ...d, [k]: v }));
  const save = async (section, value = draft) => {
    const r = await perform(
      "/api/home/config",
      { section, value, version: h.configVersion },
      "设置已保存",
    );
    if (r) setEdit(null);
    return r;
  };
  const profileForm = edit && ["routine", "diet", "voice"].includes(edit);
  const enabled = h.devices.filter((d) => d.enabled),
    online = enabled.filter((d) => d.online).length;
  return (
    <div className="m-settings m-pad">
      <div className="m-section-heading">
        <div>
          <p className="m-kicker">让照护，更懂您</p>
          <h1>我的照护</h1>
        </div>
        <ShieldCheck className="m-accent" size={30} />
      </div>
      <section className="m-profile">
        <div className="m-avatar">
          <UserRound size={27} />
        </div>
        <div>
          <h2>
            周宁 <span>主陪护人 · 女儿</span>
          </h2>
          <p>照护对象：周伯（爸爸）</p>
          <small>家庭照护 · 虚构演示档案</small>
        </div>
      </section>
      <section className="m-card">
        <div className="m-section-heading">
          <h2>设备管理</h2>
          <Tag>
            {online} 在线 / {enabled.length - online} 离线
          </Tag>
        </div>
        {h.devices.map((d) => (
          <Row
            key={d.id}
            icon={types[d.type]?.[1] || Activity}
            title={d.name}
            description={`${d.zone} · ${d.type === "camera" ? "行为观察 / 双向对讲" : d.type === "band" ? "定位 / 活动 / SOS" : d.type === "screen" ? "提醒播报 / 长辈模式" : "照护数据同步"}`}
            tail={
              <Tag tone={!d.online || !d.enabled ? "amber" : ""}>
                {!d.enabled
                  ? "停用"
                  : !d.online
                    ? "离线"
                    : d.battery != null
                      ? `${d.battery}%`
                      : "在线"}
              </Tag>
            }
            onClick={() => open("device", d)}
          />
        ))}
        <button
          className="m-text-link"
          onClick={() =>
            open("device", {
              name: "",
              type: "camera",
              zone: "客厅",
              online: false,
              enabled: true,
            })
          }
        >
          <Plus size={16} /> 添加设备
        </button>
        <p className="m-footnote">
          当前为模拟设备，支持摄像头、手环、智能屏、血压计等。
        </p>
      </section>
      <section className="m-card">
        <div className="m-section-heading">
          <h2>人员管理 · 紧急联系链</h2>
          <button
            className="m-text-link"
            onClick={() => open("policy", h.policy)}
          >
            联络规则
          </button>
        </div>
        {[...h.members]
          .sort((a, b) => a.level - b.level)
          .map((m) => (
            <Row
              key={m.id}
              icon={UserRound}
              title={`${m.name} · ${m.role}`}
              description={
                m.enabled
                  ? m.level === 1
                    ? "立即联络 · 应用内模拟"
                    : m.level === 2
                      ? `首轮联络 ${h.policy.tierTwoSeconds} 秒后追加`
                      : "仅接收通报"
                  : "已停用"
              }
              tail={
                <Tag
                  tone={m.level === 1 ? "rose" : m.level === 2 ? "amber" : ""}
                >
                  {["", "一级", "二级", "三级"][m.level]}
                </Tag>
              }
              onClick={() => open("member", m)}
            />
          ))}
        <button
          className="m-text-link"
          onClick={() =>
            open("member", {
              name: "",
              role: "其他家属",
              level: 2,
              phone: "",
              enabled: true,
              atHome: false,
            })
          }
        >
          <Plus size={16} /> 添加照护成员
        </button>
      </section>
      <section className="m-card">
        <div className="m-section-heading">
          <h2>个性化行为设置</h2>
          <Tag>因人而异</Tag>
        </div>
        <Row
          icon={Route}
          title="常用路线"
          description={`社区花园环线 · 偏离容差 ${h.map.tolerance} 米`}
          onClick={() =>
            open("map", { radius: h.map.radius, tolerance: h.map.tolerance })
          }
        />
        <Row
          icon={Clock3}
          title="作息基线"
          description={`起床 ${p.wake} · 午休 ${p.nap} · 就寝 ${p.bed}`}
          onClick={() => open("routine", p)}
        />
        <Row
          icon={Pill}
          title="用药方案"
          description={`${state.daily.medicationPlan.label} · ${state.daily.medicationPlan.enabled ? "提醒已开启" : "提醒未开启"}`}
          onClick={() => open("medication", state.daily.medicationPlan)}
        />
        <Row
          icon={CupSoda}
          title="饮食与饮水"
          description={`${p.diet} · ${p.waterEnabled ? `每 ${p.waterMinutes} 分钟提醒` : "饮水提醒未开启"}`}
          onClick={() => open("diet", p)}
        />
        <Row
          icon={SlidersHorizontal}
          title="危险行为敏感度"
          description={`跌倒${h.rules.fall.enabled ? "已开启" : "已关闭"} · 夜间徘徊 · 久坐`}
          onClick={() => open("rules", h.rules)}
        />
        <Row
          icon={ShieldCheck}
          title="隐私与免打扰"
          description={`敏感空间不布点 · ${h.privacy.nightEventOnly ? "夜间仅事件片段" : "夜间策略待确认"}`}
          onClick={() => open("privacy", h.privacy)}
        />
        <Row
          icon={Volume2}
          title="老人偏好"
          description={`${h.preferences.dialect} · 称呼“${p.salutation}” · 语速${p.speechRate < 1 ? "较慢" : "正常"}`}
          onClick={() =>
            open("voice", { ...p, dialect: h.preferences.dialect })
          }
        />
      </section>
      <section className="m-card">
        <div className="m-section-heading">
          <h2>知识库</h2>
          <BookOpen size={19} />
        </div>
        <Row
          icon={UserRound}
          title="个人特征库"
          description="作息、沟通、环境与家属纠错"
          tail={`${h.personalNotes.length + h.corrections.length} 条`}
          onClick={() => open("knowledge-personal")}
        />
        <Row
          icon={Heart}
          title="病情发展库"
          description="病历、用药与行为变化记录"
          tail={`${h.medicalRecords.filter((r) => r.status === "confirmed").length} 份`}
          onClick={onMedical}
        />
        <Row
          icon={BookOpen}
          title="照护知识"
          description="有来源、可查阅的照护资料"
          tail={`${GUIDANCE.length} 条`}
          onClick={() => open("knowledge-guide")}
        />
      </section>
      <p className="m-footnote center">有伴 · 把每一天的照护，连在一起</p>
      {edit && (
        <Sheet
          title={
            {
              device: draft.id ? "管理设备" : "添加设备",
              member: draft.id ? "编辑照护成员" : "添加照护成员",
              policy: "紧急联络规则",
              map: "常用路线与安全区域",
              routine: "作息基线",
              medication: "用药方案",
              diet: "饮食与饮水",
              rules: "危险行为敏感度",
              privacy: "隐私与免打扰",
              voice: "老人偏好",
              "knowledge-personal": "个人特征库",
              "knowledge-guide": "照护知识",
            }[edit]
          }
          onClose={() => setEdit(null)}
        >
          <form
            className="m-form"
            onSubmit={async (e) => {
              e.preventDefault();
              if (edit === "medication") {
                const r = await perform(
                  "/api/daily/plan",
                  { ...draft, version: state.daily.version },
                  "用药方案已保存",
                );
                if (r) setEdit(null);
              } else await save(profileForm ? "careProfile" : edit);
            }}
          >
            {edit === "device" && (
              <>
                <Field
                  label="设备名称"
                  required
                  value={draft.name}
                  onChange={(e) => set("name", e.target.value)}
                />
                <Field label="设备类型">
                  <select
                    value={draft.type}
                    onChange={(e) => set("type", e.target.value)}
                  >
                    {Object.entries(types).map(([v, [t]]) => (
                      <option value={v} key={v}>
                        {t}
                      </option>
                    ))}
                  </select>
                </Field>
                <Field
                  label="放置位置"
                  value={draft.zone}
                  onChange={(e) => set("zone", e.target.value)}
                />
                <Check
                  label="启用设备"
                  checked={draft.enabled}
                  onChange={(v) => set("enabled", v)}
                />
                <Check
                  label="模拟在线"
                  checked={draft.online}
                  onChange={(v) => set("online", v)}
                />
                <p className="m-note">
                  添加后保存在当前家庭档案。此处模拟设备连接状态。
                </p>
              </>
            )}
            {edit === "member" && (
              <>
                <Field
                  label="姓名"
                  required
                  value={draft.name}
                  onChange={(e) => set("name", e.target.value)}
                />
                <Field label="与老人的关系">
                  <select
                    value={draft.role}
                    onChange={(e) => set("role", e.target.value)}
                  >
                    {["子女", "其他家属", "在宅护工", "社区照护", "医生"].map(
                      (x) => (
                        <option key={x}>{x}</option>
                      ),
                    )}
                  </select>
                </Field>
                <Field label="联络级别">
                  <select
                    value={draft.level}
                    onChange={(e) => set("level", Number(e.target.value))}
                  >
                    {[1, 2, 3].map((x) => (
                      <option key={x} value={x}>
                        {
                          [
                            "",
                            "一级 · 立即联络",
                            "二级 · 延时追加",
                            "三级 · 仅通报",
                          ][x]
                        }
                      </option>
                    ))}
                  </select>
                </Field>
                <Field
                  label="电话"
                  value={draft.phone}
                  onChange={(e) => set("phone", e.target.value)}
                />
                <Check
                  label="启用联系人"
                  checked={draft.enabled}
                  onChange={(v) => set("enabled", v)}
                />
                <Check
                  label="目前在家陪护"
                  checked={draft.atHome}
                  onChange={(v) => set("atHome", v)}
                />
              </>
            )}
            {edit === "policy" && (
              <>
                <p className="m-note">
                  以下为演示压缩计时。一级成员同时联络，二级延时追加，三级仅通报。
                </p>
                {[
                  ["confirmationSeconds", "本人确认窗口（秒）", 3, 120],
                  ["tierTwoSeconds", "追加二级联络（秒）", 5, 300],
                  ["emergencySeconds", "急救信息前置（秒）", 10, 600],
                ].map(([k, l, min, max]) => (
                  <Field
                    key={k}
                    label={l}
                    type="number"
                    min={min}
                    max={max}
                    required
                    value={draft[k]}
                    onChange={(e) => set(k, Number(e.target.value))}
                  />
                ))}
              </>
            )}
            {edit === "map" && (
              <>
                <p className="m-note">
                  常用路线：家 → 社区花园 → 家。路线偏离和越出安全区域分别判断。
                </p>
                <Field
                  label="安全区域半径（米）"
                  type="number"
                  min="100"
                  max="1000"
                  value={draft.radius}
                  onChange={(e) => set("radius", Number(e.target.value))}
                />
                <Field
                  label="路线偏离容差（米）"
                  type="number"
                  min="20"
                  max="200"
                  value={draft.tolerance}
                  onChange={(e) => set("tolerance", Number(e.target.value))}
                />
                <MButton
                  type="button"
                  secondary
                  onClick={() => {
                    setEdit(null);
                    onMap();
                  }}
                >
                  在地图中查看路线
                </MButton>
              </>
            )}
            {edit === "routine" && (
              <>
                {[
                  ["wake", "起床时间"],
                  ["bed", "就寝时间"],
                ].map(([k, l]) => (
                  <Field
                    key={k}
                    label={l}
                    type="time"
                    required
                    value={draft[k]}
                    onChange={(e) => set(k, e.target.value)}
                  />
                ))}
                <Field
                  label="午休时间段"
                  value={draft.nap}
                  onChange={(e) => set("nap", e.target.value)}
                />
                <p className="m-note">
                  保存为个人作息基线，供照护者对照日常变化。
                </p>
              </>
            )}
            {edit === "medication" && (
              <>
                <Check
                  label="启用既定用药计划"
                  checked={draft.enabled}
                  onChange={(v) => set("enabled", v)}
                />
                <Field
                  label="方案名称／原医嘱备注"
                  required
                  value={draft.label}
                  onChange={(e) => set("label", e.target.value)}
                />
                {draft.slots.map((s, i) => (
                  <div className="m-card" key={s.id}>
                    <Field
                      label={s.label}
                      type="time"
                      value={s.time}
                      onChange={(e) =>
                        set(
                          "slots",
                          draft.slots.map((x, j) =>
                            j === i ? { ...x, time: e.target.value } : x,
                          ),
                        )
                      }
                    />
                    <Check
                      label="启用此时段"
                      checked={s.enabled}
                      onChange={(v) =>
                        set(
                          "slots",
                          draft.slots.map((x, j) =>
                            j === i ? { ...x, enabled: v } : x,
                          ),
                        )
                      }
                    />
                  </div>
                ))}
                <p className="m-note">
                  仅记录家属核对的既定方案。具体药品、剂量以原医嘱为准。
                </p>
                <button
                  type="button"
                  className="m-text-link"
                  onClick={() => {
                    setEdit(null);
                    onMedication();
                  }}
                >
                  查看用药记录与依据
                </button>
              </>
            )}
            {edit === "diet" && (
              <>
                <Check
                  label="启用白天饮水提醒"
                  checked={draft.waterEnabled}
                  onChange={(v) => set("waterEnabled", v)}
                />
                <Field
                  label="饮食偏好"
                  value={draft.diet}
                  onChange={(e) => set("diet", e.target.value)}
                />
                <Field
                  label="饮水间隔（分钟）"
                  type="number"
                  min="30"
                  max="480"
                  value={draft.waterMinutes}
                  onChange={(e) => set("waterMinutes", Number(e.target.value))}
                />
                <Field
                  label="需避免的食物／家属备注"
                  value={draft.avoid}
                  onChange={(e) => set("avoid", e.target.value)}
                />
                <section className="m-setting-preview">
                  <strong>患者端提醒预览</strong>
                  <p>
                    {draft.salutation || "周伯"}
                    ，到了您和家人约定的饮水提醒时间。
                  </p>
                  <small>
                    {draft.waterEnabled
                      ? `每日 ${hydrationTimes(draft).join("、")}；就寝后不提醒。`
                      : "保存后保持关闭，不发送定时提醒。"}
                  </small>
                </section>
                <MButton
                  type="button"
                  secondary
                  disabled={busy}
                  onClick={async () => {
                    const r = await save("careProfile", draft);
                    if (r) {
                      const preview = await perform(
                        "/api/mobile/action",
                        { action: "hydration_preview" },
                        "提醒已发送到患者端",
                      );
                      if (preview) onPatient?.();
                    }
                  }}
                >
                  保存并体验一条提醒
                </MButton>
              </>
            )}
            {edit === "rules" &&
              Object.entries(draft).map(([k, r]) => (
                <section key={k} className="m-card">
                  <h3>{HOME_RULES[k]?.label}</h3>
                  <Check
                    label="开启观察"
                    checked={r.enabled}
                    onChange={(v) => set(k, { ...r, enabled: v })}
                  />
                  <Field label="敏感度">
                    <select
                      value={r.sensitivity}
                      onChange={(e) =>
                        set(k, { ...r, sensitivity: e.target.value })
                      }
                    >
                      <option value="high">高</option>
                      <option value="medium">中</option>
                      <option value="low">低</option>
                    </select>
                  </Field>
                  {k !== "fall" && (
                    <Field
                      label="观察时长（分钟）"
                      type="number"
                      min="0"
                      max="480"
                      value={r.minutes}
                      onChange={(e) =>
                        set(k, { ...r, minutes: Number(e.target.value) })
                      }
                    />
                  )}
                </section>
              ))}
            {edit === "privacy" && (
              <>
                <div className="m-note">
                  <ShieldCheck /> 卫生间、浴室等敏感空间禁止布点。
                </div>
                <Check
                  label="夜间仅事件片段"
                  checked={draft.nightEventOnly}
                  onChange={(v) => set("nightEventOnly", v)}
                />
                <Check
                  label="家属已确认监控范围"
                  checked={draft.placementConfirmed}
                  onChange={(v) => set("placementConfirmed", v)}
                />
                <Check
                  label="家属记录已向老人说明"
                  checked={Boolean(draft.informed || draft.informedAt)}
                  onChange={(v) => set("informed", v)}
                />
                <p className="m-footnote">
                  当前记录配置与家属确认，不采集真实连续视频。
                </p>
              </>
            )}
            {edit === "voice" && (
              <>
                <Field
                  label="称呼"
                  value={draft.salutation}
                  onChange={(e) => set("salutation", e.target.value)}
                />
                <Field label="语音输入方式">
                  <select
                    value={draft.voiceInputMode || "tap"}
                    onChange={(e) => set("voiceInputMode", e.target.value)}
                  >
                    <option value="tap">点一下开始，再点一下结束</option>
                    <option value="hold">按住说话，松开结束</option>
                  </select>
                </Field>
                <VoicePreferences runId={state.runId} draft={draft} set={set} />
                <Field label="方言偏好">
                  <select
                    value={draft.dialect}
                    onChange={(e) => set("dialect", e.target.value)}
                  >
                    {["普通话", "四川话", "粤语", "上海话"].map((x) => (
                      <option key={x}>{x}</option>
                    ))}
                  </select>
                </Field>
                <Field
                  label={`语速 ${draft.speechRate}`}
                  type="range"
                  min="0.5"
                  max="1.5"
                  step="0.05"
                  value={draft.speechRate}
                  onChange={(e) => set("speechRate", Number(e.target.value))}
                />
                <Field
                  label={`音量 ${Math.round(draft.volume * 100)}%`}
                  type="range"
                  min="0"
                  max="1"
                  step="0.1"
                  value={draft.volume}
                  onChange={(e) => set("volume", Number(e.target.value))}
                />
                <p className="m-note">
                  音色、语速和音量用于聊天、提醒与找路播报。方言仅保存偏好，不会自动切换发音语言。
                </p>
              </>
            )}
            {edit === "knowledge-personal" && (
              <>
                {h.personalNotes.map((n) => (
                  <section className="m-card" key={n.id}>
                    <h3>{n.title}</h3>
                    <p>{n.text}</p>
                    <small>{n.source}</small>
                  </section>
                ))}
                {h.corrections.map((c) => (
                  <section className="m-card" key={c.id}>
                    <h3>家属纠错</h3>
                    <p>{c.reason}</p>
                    <MButton
                      type="button"
                      disabled={c.applied || busy}
                      onClick={() =>
                        perform(
                          "/api/home/correction",
                          { correctionId: c.id },
                          "已应用演示纠错规则",
                        )
                      }
                    >
                      {c.applied ? "已应用" : "应用到演示规则"}
                    </MButton>
                  </section>
                ))}
                <p className="m-footnote">
                  展示实际记录数量，不代表模型已完成训练。
                </p>
              </>
            )}
            {edit === "knowledge-guide" &&
              GUIDANCE.map((g) => (
                <article className="m-card" key={g.id}>
                  <h3>{g.title}</h3>
                  <p>{g.text}</p>
                  <a
                    href={g.url}
                    target="_blank"
                    rel="noreferrer"
                    className="m-text-link"
                  >
                    来源：{g.source}
                  </a>
                </article>
              ))}
            {!edit.startsWith("knowledge") && (
              <MButton type="submit" disabled={busy}>
                保存设置
              </MButton>
            )}
          </form>
        </Sheet>
      )}
    </div>
  );
}
function Check({ label, checked, onChange }) {
  return (
    <label className="m-check">
      <span>{label}</span>
      <input
        type="checkbox"
        checked={Boolean(checked)}
        onChange={(e) => onChange(e.target.checked)}
      />
    </label>
  );
}
