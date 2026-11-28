# DSH 0.2.2-rc.1 本地宿主兼容补丁

本补丁版本为 **2.8.6-local.1**，基于原 2.8.5 和 2026-11-28 的已验证加载修复；仅供本地验收，未发布 npm。四套预设的数学策略、参数与持久化格式保留。

## 实际接口与适配边界

| 契约 | 原框架 | 当前实际宿主 | 本地处理 |
| --- | --- | --- | --- |
| 创建子代理 | startContinuable | startActivation | 按能力分流，旧路径保留原调用 |
| 父代理 | request.parent | 必须为注册表中的同一对象 | 保持对象身份，拒绝伪造父对象 |
| 深度 | 未显式解析 | resolveMaxDepth / request.maxDepth | 使用宿主解析结果，不放宽限制 |
| 生命周期 | childId、原生结束事件 | childId、result、dispose、runId | 地址仍用 childId；逐收据拥有和释放 Activation |
| 通信 / 中断 | sendMessage / interrupt | 两者仍在 | 保持原调用与祖先权限参数 |
| 工具限制 | request.toolFilter | 当前公开创建请求未消费此字段 | 显式配置时具名停止派发，防止变成无限制派发 |
| V5 身份 | request.persona | 当前公开请求未消费此字段 | 现代路径在首轮任务前放入同一份冻结身份文本；旧路径保持 persona |
| 结果投递 | 依赖旧持续子代理行为 | caller 首轮；冷恢复默认 parent | 首轮使用 caller，保留原生事件；冷恢复仍可能唤醒父代理 |
| 当前目录 | persona 中使用 {{cwd}} | 严格模板仅有 provider/model；目录由必需运行上下文贡献 | 现代生成链改为相对路径与最新运行上下文；四份旧版组合保持原样 |

V5 的文本内容保持逐字一致，但从独立 persona 字段移至首轮用户内容属于**提示层级差异**，并非完全等价的系统层注入。成员随后冷恢复使用原会话历史；此补丁未加入隐式 persona 重复注入。

## 代码位置

- [共享入口](../shared/subagent-compat.js)处理准入、结果观察、释放及错误传播；在准入窗口内暂存最多 1024 个尚未登记地址的原生事件，并在框架完成元数据登记后按确切 childId 交给既有处理器。它不重发宿主事件，也不改写数学调度。
- 上下文关闭时取消尚未完成的准入并等待回滚；逐 Activation 收据释放当前 epoch，并按原始父对象与已知 childId 调用现代 drainChildren，覆盖 sendMessage 触发的冷恢复。
- V5 解雇成员保留旧宿主 drainContinuableChildren 路径；现代宿主等待 drainChildren 完成，清理错误继续向调用者传播。
- 四套框架在各自 apply 入口分流；现代路径按需导入共享入口，旧路径保持原方法，以兼容既有宿主与变异测试的复制布局。
- [宿主环境解析器](../tests/helpers/host-environment.mjs)统一测试前置探测，支持普通 Node 包、显式环境变量和 Electron ASAR。

## 可重复验证

从开发检出根目录运行：

~~~bash
node --test tests/subagent-compat.test.mjs tests/subagent-cleanup.test.mjs tests/e2e-activation-compat.test.mjs tests/host-environment.test.mjs
node tests/run-tests.mjs --self-check --no-temp-hygiene
node tests/run-tests.mjs --json --no-temp-hygiene
node scripts/build-preset-rows.mjs --check
DSH_PROMPT_NATIVE=1 DSH_NODE_MODULES="<可由普通 Node 导入的宿主 @deepseek-ai 目录>" node --test tests/prompt-template-compat.test.mjs
node scripts/release-check.mjs --skip-pack
~~~

完整门禁包含未随包发布的开发套件，因此应在开发检出中运行。使用 --no-temp-hygiene 保留既有用户临时目录。完整打包检查应给 RELEASE_CHECK_TMP 一个专属新目录；原脚本会删除其指定的临时根。

真实宿主代理注册表测试：

~~~bash
DSH_NODE_MODULES="<DSH node_modules/@deepseek-ai>" DSH_HOST_EXECUTABLE="<Electron executable>" node tests/e2e-f1-agent-detach.test.mjs
~~~

普通 npm 安装的宿主可自动发现；ASAR 场景使用实际 Electron 可执行文件。缺少依赖时会报告具体前置条件；测试不会以环境缺失伪装为成功。

## 证据强度

- [共享入口测试](../tests/subagent-compat.test.mjs)与[清理回归](../tests/subagent-cleanup.test.mjs)：行为契约、错误、准入/释放竞态、同地址不同 epoch、精确父级清理及冷恢复。
- [四框架集成测试](../tests/e2e-activation-compat.test.mjs)：真实注册工具和持久化处理，配合明确标注的模拟现代宿主服务；包含 V5 身份逐字核对。
- [宿主注销测试](../tests/e2e-f1-agent-detach.test.mjs)：真实 Cordis Context 与 AgentRegistry，使用结构化测试 Agent；没有模型数学求解。
- 真实模型数学验收、完整门禁、构建和实际安装分别记录在本地交付报告中；以上任意单项均不自动代表全部验收通过。

## 安装与回滚

采用唯一版本的本地包，更新前保存实际安装目录和摘要。先在隔离 profile 校验包，再更新目标安装；保留现有用户配置。既有进程已缓存的模块须通过宿主实际重载或后续重启验证，磁盘内容一致不等于内存版本已切换。回滚以保存的完整目录/包及版本清单为依据。
