# dsh-vibe-math 2.3.6 — v2 的 id 解析歧义：一句 `defect` 会撤回**另一个对象**的证明

> 上一版：2.3.5。本版修的是 2.3.2 审计里记录为"存疑、需契约决策"的那条 —— round 7 把它做成可复现的
> 用例后确认：**不是理论问题，是真实可达的数据破坏**。无破坏性变更，默认仍为 `formalVerify: 'off'`。

---

## 1. 缺陷：`formalObjectIdOf` 无条件剥离 `-sN` / `-pfN` / `-rfN` 后缀

v2 有两套 id：归档/索引/卡片用**对象 id**（`pAmb`），验证记录以 **rId**（`r-pAmb`、`r-q1-s0`、
`r-pAmb-pf1`）为键。二者靠**唯一一处**映射 `formalObjectIdOf` 互相转换：

```js
const m = /^r-(.+?)(?:-(?:s\d+|pf\d+|rf\d+))?$/.exec(t)   // ← 无条件剥离后缀
```

问题在于**对象 id 本身就可能以 `-s1` 结尾**：命题 `pAmb-s1` 的验证 id 是 `r-pAmb-s1`，映射结果是
`pAmb` —— **另一个对象**。后果不是"少一条记录"，而是**张冠李戴**。先用断言复现（修前 6 条红）：

| 现象（修前） | 说明 |
|---|---|
| 忠实性提示词打印 `Verified/Lean/pAmb.lean` | 把**邻居的证明路径**给表决者看，而那证明属于另一个命题 |
| `formal:{target:'r-pAmb-s1', decision:'defect'}` 把 `pAmb` 降级为 `attempted` | 缺陷记到了邻居头上 |
| **`Verified/Lean/pAmb.lean` 被撤回** | 一句关于 A 的回执**删掉了 B 的归档证明**（不可逆） |
| `pAmb-s1` 仍然是 `passed`，TODO 里没有它 | 真正有问题的对象毫发无损 |

## 2. 修复：按**权威度**取来源，而不是猜后缀

新的 `formalObjectIdOf` 依次尝试：

1. **验证任务自己的所有者** —— `tasks['verify:'+rId].r.pId | r.qid`：框架生成 rId 时就知道对象是谁；
2. **记录里的 `objectId`** —— 由 `syncVerificationTarget` 与 `putFormalBothIds` 在**手里确实有对象 id**
   时写入（这两个函数本来就是被"对象 id"调用的），因此**跨 resume**、任务表尚未重建时也正确；
3. 只有两者都不可用时，才回退到字符串后缀解析（保留对历史/野生 rId 的兼容）。

v3/v4/v5 **不受影响**：它们没有第二套 id 空间，验证直接以对象 id 为键（已核对：`formalId` / `formalOf`
只做 `idSafe`，不做后缀解析）。

## 3. 新增断言（`formal-verify-v2.test.mjs` 第 14c 节，+14 条）

- 两个对象 `pAmb`（无后缀）与 `pAmb-s1`（id 本身以 `-s1` 结尾）各有自己的通过证明；
- 对 `r-pAmb-s1` 的**忠实性提示词必须指向 `pAmb-s1` 自己的证明**（不是邻居的）；
- 一句 `defect` 必须降级 `pAmb-s1`、撤回**它自己**的证明、TODO 里写它；
- 邻居 `pAmb` 必须仍是 `passed`、**它的归档证明文件必须分毫未动**；
- 验证记录里必须写着权威所有者 `objectId: 'pAmb-s1'`，邻居记录不得有伪造的所有者标记。

修前实测：**6 条断言变红**（含"邻居的证明被撤回"）；修后 348/0 全绿。

## 4. 验收（实测）

| 项 | 2.3.5 | 2.3.6 |
|---|---|---|
| `formal-verify-v2.test.mjs` | 334 | **348** |
| 全量并行回归 | 23/23 | 23/23 |
| 49 条 formal 探针 | 全红 | 全红 |
| 四套语料确定性 | 字节稳定 | 字节稳定 |
| closing verification | 18/18 | 18/18 |

## 5. 升级

```
npm i dsh-vibe-math@latest
```

无迁移。本版只改 v2 的 id 解析（多两级权威来源）与 v2 规格/断言；`off` 档行为不变，
其余三套预设与上一版逐字节相同。
