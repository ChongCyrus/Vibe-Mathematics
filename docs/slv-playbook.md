# 脚本化真机验证（SLV）手册

> 目的：在**真实 DSH** 上、用**脚本**（不是 GUI）建一个指定 `agentPreset` 的会话并驱动若干回合，拿到可引用的转录证据。
> 面向读者：维护者/复核者。命令与字段名均来自实测。
> **铁律**：**上限或超时都不是通过**——它们是**非结果（NON-RESULT）**，必须如实记录，绝不写成 PASS。

## 1. 隔离：绝不碰用户自己的 profile

```powershell
# 1) 克隆一份 profile（不要用用户正在用的那份）
Copy-Item -Recurse -Force "$HOME\.dsh\profiles\web" "$HOME\.dsh\profiles\<clone>"
# 2) 改克隆里 package.json 的 name，避免与用户 profile 混淆
# 3) 从【纯 ASCII】的临时 cwd 启动，独立端口 + --no-open
New-Item -ItemType Directory -Force -Path "$env:TEMP\slv-ws"
dsh --profile <clone> --port <自有端口> --no-open
# 等价写法（需要指定 DSH 入口时）：node <dsh>/lib/bin.js --profile <clone> --port <自有端口> --no-open
```

- **`--no-open`**：不弹 GUI；stdout 会打印一行 `dsh web: http://127.0.0.1:<端口>/?token=<TOKEN>` ⇒ **从这里取 `token=`**。
- **`--port`**：必须是你自己的端口，别占用用户实例的端口。
- **cwd 必须是纯 ASCII**：非 ASCII 工作区会在宿主侧变成乱码并报 `ENOENT`（编码问题，不是宿主缺陷）。
- 认证（实测）：`GET /?token=<TOKEN>` ⇒ **303 + `Set-Cookie: dsh-auth-…`**；随后带 cookie 调 `/api/*` 返回 200，不带 cookie 返回 **401**。
- RPC 信封（逐字）：`POST /api/<endpoint>`，正文 `{"type":"client-request","rpcId":"<唯一>","method":"<与 endpoint 同名>","payload":{"args":{…}}}`；**`payload` 必须恰好是 `{"args":{…}}`**（传 `{}` 或 `{"args":[]}` 会被拒）。
- **profile 补丁是顶层序列**：`cordis.patch.yml` 首个非注释行以 `-` 开头，因此追加行**必须从第 0 列开始**；用 2 空格缩进会得到 `YAMLException: bad indentation of a sequence entry`。

## 2. 模拟声明：必须留可检索证据

在**根会话的第一条 user message** 里明示这是一次模拟，例如：

> 本次运行是一次**模拟测试**（协议与端到端验证），**不是**真实研究任务。请按规范正常协作：快速尝试各功能逻辑，产出可验证的产物，并在完成后**按正确流程收敛收口**。

**断言方式（不许只"声称"）**：

1. 在**运行产物** `transcript.jsonl` 里 grep **用户原句 `这是一次模拟`**；
2. 该命中必须落在 **`user/message` 事件**里（不是系统提示、不是回显）；
3. 报告要写**该事件的 `seq` ＋ 文件行号**（实测形态：`{"sink":"user/message","seq":8,…}`）。

> 提醒：短语是**用户原句**，比对时按 UTF-8 字节比对最稳（可以先取该句的 hex，再在产物里定位）。

## 3. 驱动 CLI（23 个开关）

```
--profile --port --cwd --ws --preset --task --task-file
--steer --steer-after --cancel --cancel-after --timeout --max-tokens
--quiet --out --jsonl --follow --follow-stream --follow-members
--allow-probe-patch --token --session --resume
```

- 常用组合：`--port <端口> --token <TOKEN> --preset vibe-math-v4 --task-file <任务> --jsonl <产物.jsonl> [--follow-stream] [--follow-members]`。
- **`--steer-after`** 是中途注入/中继通道：用它在运行中追加指令（例如模拟声明或中途 steer），**不要**为此另开一个会话。
- `--timeout` 与 `--max-tokens` **每次都要设**（见 §4）。

## 4. 预算与上限

- **总预算 ≤ 2.5 M tokens**；分项上限：最小 `configure`+`status` **≤ 50 k**；v5 启动 + 1 轮 **≤ 250 k**；v4 启动 + 1 轮 **≤ 900 k**；2 名常驻的会议 **≤ 600 k**。
- **成本量级（实测）**：最小 `configure`+`status` ≈ **8 s**；v4 启动 + 1 轮 ≈ **100 s / 732,888 tokens**；v5 ≈ **21–25 s / ≈150 k**；2 名常驻会议 ≈ **64 s / 473 k** ⇒ 一律用**受管后台作业**跑，不要让前台阻塞。
- 到达任何上限（tokens/墙钟）⇒ 记为 **NON-RESULT**，不要写成通过；先记录、再**单跑复现**，仍红才按真回归处理。

## 5. 能建立什么、不能建立什么

**能**（在本机可达范围内）：

- 多预设流程的**落位**：工具确实被注册并返回真实结果（例如 `vibe_v4_configure` / `vibe_v4_status` 的真实返回），而不是假设；
- 研究所/邮箱路径、会议（首位发言可观测；**后位发言需要 ≥2 名常驻**）、论文/归档的启动路径；
- `math_computation` 的 `probe`/`run`（本机 Python 在 PATH；R 走已知安装目录）。

**不能**：

- **没有任何引擎**（Octave/Julia/MATLAB/Maple/Wolfram 等）⇒ 这些面只能核对**诚实文本**：`configured`（配置启用）与 `absent[]`（每项带 `why`），这是**部分替代**，不是执行验证；
- **单客户端** ⇒ 并发要靠两个克隆 + 两个端口模拟，否则如实声明超出范围；
- **有界运行只能建立"落位与可观测性"**，**不能**建立"收敛/收口"结论——收敛结论必须来自随包套件。

## 6. 中止触发与处置

| 触发 | 处置 |
|---|---|
| 模拟声明没落地 | 立即中止，记为**证据失败**（不是产品通过） |
| 触到 token/墙钟上限 | 记为 **NON-RESULT**；需要时缩小规模（更少成员/更短任务）重跑 |
| 出现产品缺陷迹象 | 先**单跑复现**；复现成功 ⇒ 当真回归处理并附转录行号 |
| 明显是宿主限制 | 记为**诚实边界**（写清限制与观测点）；**不得**写成产品通过 |

## 7. 产物、报告与清理

**产物（可引用）**：`transcript.jsonl`、`run.log`、任务文本、提取脚本、**本次运行自己的 sessionId 清单**。

**报告**（写进仓库外的工作记录）应包含：逐步证据（命令 + 退出码 + 关键输出行 + 转录行号）、模拟声明的 `seq` 与行号、逐条收敛判据的结论、**非 SLV 项的实测结果**、**诚实边界清单**（未验证/无法验证的项）。

**清理（只限自己）**：

- 只删**自己**的会话目录：`~/.dsh/sessions/<escaped-cwd>/<sessionId>/`；
- 只删**文件名包含自己 sessionId** 的投影缓存条目（`…/session_projcache/sessions/<sessionId>.json`）；
- 只删**自己克隆的 profile** 与**自己起的服务/端口**；
- **绝不**按时间窗（例如"最近 20 分钟 mtime"）批量删除——历史上这样做误删了不属于本次运行的投影缓存条目；删除数量要与预期**逐个对齐**并回报。

## 8. 最后：这次运行"证明了什么"

写结论时把"我们看到的"与"它支持的结论"分开：

- **观测**：转录里出现了什么（带 seq/行号）、工具返回了什么；
- **支持**：这些观测支持**落位与可观测性**；
- **不支持**：不能据此声称收敛、性能、或未安装引擎的行为；
- **非结果**：被上限/超时终止的运行，逐条列出并说明原因。
