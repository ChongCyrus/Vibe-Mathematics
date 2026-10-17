# 02 · **运行：装起来、跑起来、看到结题**

> ★ 这一卷只讲**怎么用**。★ 它不解释设计（★ 那在 `01-architecture`），★ 也不教扩展（★ 那在 `03-extending`）。

## 1. ★★ 装

★ vmu 以**一个 npm 包**（★ `dsh-vibe-math`）＋ **一个 DSH preset** 的形态交付 ✓
```bash
# 装到一个【独立的 profile】（★ 不要污染你自己的 profile）
dsh plugin --profile <你的profile> add <包名或本地路径>@<版本>
```
★ **两条硬提醒**（★ 都踩过）：
1. ★★ **包里新增的文件必须同时进 `package.json#files` 与 `installer.js` 的 managed 清单** ⇒ ★ **否则装完就 `MODULE_NOT_FOUND`，★ 而本地永远发现不了** ✓（★ 本仓有专门的门禁查这件事）
2. ★★ **要跑真机，模型提供商必须用 `commandcode` 下的 `deepseek/deepseek-v4.1-flash`**，★ **不是 deepseek 官方的同名模型** ✓

## 2. ★★★★ 起一次运行（★ 这是唯一需要理解的地方）

### 2.1 两种投递模式
| ★ `vmu.turn.deliverMode` | ★ 谁扮演成员回合 | ★ 现状 |
|---|---|---|
| ★ `'subagents'`（默认） | ★ 框架自己起子代理 | ★ ★ **实测【结构性不可用】**：★ 宿主不提供插件可合法构造的"当前 Agent"（★ `agents.list()` 只回 id 字符串，★ 而契约要带 `options`/`session.header` 的对象） |
| ★★ **`'caller'`** | ★ **调用你的那个会话** | ★★ **这是能用的一种** ✓ |

⇒ ★★ **因此在真机上请用 `caller`** ✓

### 2.2 caller 通道的**完整握手**（★ 背下来）

```
①  vibe_vmu_turn { op:'step' }
       ↓
    返回 { ok, awaiting:true, deliveryPath:'caller',
           memberPrompt:{ member, turnId, text } }
       ↓
②  ★ 你按 memberPrompt.text 【以该成员的身份真作答】
     ★ 必须是【真实回复】，不是占位符
       ↓
③  vibe_vmu_turn { op:'step', reply:"<成员回复的 JSON>" }
       ↓
    框架把它记为【该成员的】判断/发言，然后继续
       ↓
④  重复 ①–③ 直到 status 的 closureVote.cast === true
```
★ **三个必须核对的字段**：★ **`awaiting:true`**／★ **`deliveryPath:'caller'`**／★ **`memberPrompt.member`**（★ 它是**谁**在作答）✓
★ **★ 判据纪律**：★ **"你以为交付了" 不等于 "交付了"** —— ★ 本阶段曾因一个返回包装器把 `supply` 方法藏掉，★ **导致 21 次"这个投递接缝不接受调用方提供的回复"，★ 而 agent 把我的任务书原文引用回给我，★ 看起来像成功** ⇒ ★ **只认接缝自己报的字段** ✓

## 3. ★★★★ 结题（★ 唯一判据 ＋ 它的两种"不是"）

```js
const st = await vibe_vmu_status()
st.closureVote = {
  window: 'round',
  cast: true,                              // ★ 结题
  for: ['m2','m3'], against: [], missing: [],
  eligible: ['m2','m3'],                   // ★ 有表决权且在场的人
  permission: 'vote',
  reason: null
}
```
★ **★ 三种情况必须分清**：
| ★ 形态 | ★ 意思 | ★ 该怎么办 |
|---|---|---|
| ★ `cast:true` | ★ **结题** | ★ 结束 |
| ★ `cast:false` ＋ **`eligible` 非空** ＋ `missing` 非空 | ★ **还没投齐** | ★ 继续跑回合 |
| ★★ `cast:false` ＋ **`eligible:[]`** | ★★ **不可达**（★ 结构问题，★ 不是"未通过"） | ★ **看 `reason`** —— ★ 它会说 *"no member holds the closure-vote permission… seat members with `hire`"* |

★ **★ 为什么这条重要**：★ **"不可达"和"未通过"是两件事**；★ 把前者当后者，★ 会让人**无休止地跑回合**去追一个**结构上不可能**的结果 ✓

## 4. ★★★ 开局的四步（★ 每次真机都一样）

```js
vibe_vmu_status                          // 先看有哪些字段
vibe_vmu_control { action:'roster' }     // 有人吗
vibe_vmu_control { action:'hire', member_id:'m1', slot:'member', institution:'Swp' }
                                         // ★ 没人就 hire 到【你的 pack 声明的槽位】
vibe_vmu_meeting { action:'open' }        // ★ 开一场会并【尽量一直开着】
```
★ **★ 实测教训**：★ 有一轮 **`VMU_NO_OPEN_MEETING` 出现了 39 次**，★ **不是拒绝错，★ 是流程被拖慢** ⇒ ★ **任务书里直接要求"让会议一直开着"** ✓
★ **`slot` 必须是你 pack 里声明的 id**（★ 内核不知道"院士"）⇒ ★ **`slot:'member'` 只是 v5r 与 institute-min 都用的那个名字** ✓

## 5. ★★ 跑完一轮真机，该看什么（★ 五样）

| ★ 看什么 | ★ 怎么读 |
|---|---|
| ★★ **结题** | ★ `closureVote.cast === true` |
| ★ **触达了几个面** | ★ 从运行记录里数 `vibe_vmu_*` 的工具名 |
| ★ **拒绝** | ★ 每条记 `code` ＋ **它有没有 `hint`** ⇒ ★ **"有 hint" ＝ 可执行**，★ **"没有" ＝ 缺陷候选** |
| ★★ **有没有引擎消息／崩溃** | ★ 出现裸的 `Error:`／`TypeError` ＝ **缺陷**（★ 拒绝必须是具名的） |
| ★★ **`enforced[]`／`fired[]`** | ★ 前者＝**求值过什么**，★ 后者＝**哪些【改变了结果】** ⇒ ★ 注意：★ **`fired` 空 ≠ 没作用**，★ 它意味着**策略与自然结果一致**（★ 见 `04-verification` §4）|

## 6. ★ 常见"看着像缺陷、其实不是"的四种
1. ★★ **`VMU_INVALID_ARGUMENT`**：★ 多数是**调用形不对**（★ 参数名／位置参数 vs 对象／嵌套在 `ids` 里…）⇒ ★ **先读它的 `hint`，★ 它常常逐字给出正确形状** ✓
2. ★★ **`cast:false` ＋ `eligible:[]`**：★ **不可达**，★ 不是未通过 ✓
3. ★★ **某个面返回 `unlimited:true`**／**`degraded:true`**／**`guarded:false`**：★ **它在【自曝零机制】**，★ 不是坏了 ✓
4. ★★ **`fired:[]`**：★ **策略没改变结果**，★ 不是"策略没生效" ✓
★ **共同点**：★ **这四种都是"它在如实报告"，★ 而读者按错的假设去读，★ 就把它读成了缺陷** ✓
