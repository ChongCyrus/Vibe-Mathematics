# Phase 2 · verify2 · Round 25 —— 逐字核你给的两处坐标 ＋ 复核"跨行引文"这条方法论

> 纪律：**只读复核**（真树只新增本报告）；探针在 `D:\_tmp\p2r25`；**每个读数绑 blob**；**"没核"与"核了"分开写**；未跑全量／git 写。
> **被测文件**：`vibe-math-vmu/vibe-math-vmu.js` —— **1200 行**、sha256[0:16] **`CDCBA5C9875C86BA`** ⇒ ★ **与我 R24 绑定的入口 blob 相同**（`6d64a74`／`56bcf37`／HEAD 三处相同）⇒ **你给的坐标落在一个没变过的输入上** ✓。

## 0. 结论速览
| 你要我核的 | 我的读数 | 判定 |
|---|---|---|
| **① 处一 `vibe-math-vmu.js:390-391`（跨行）** | `L390` ＝ `// Where each merged key CAME FROM, so the resolved view never calls a pack default "config" (the entry is the only`<br>`L391` ＝ `// layer that knows this; the kernel sees one flat object). Consumed by kernel.status().settings.resolved.` | ★★ **逐字相符**（**空白归一后** `L390===claim1`、`L391===claim2` 皆为 `true`）✓ |
| **② 处二 `vibe-math-vmu.js:527`** | `L527` ＝ `// ROUND 1 / K5 (D-02): the entry is the only layer that knows a folded pack default from a deployment value, so it` ⇒ ★ **该行就是你的前缀（整行）**；★ **句子在 `L528` 继续**：`// hands the layer map in. The named overlap report travels to the HOST face instead (`mergeReport` below), because` | ★★ **相符**（你的 `…` 截的是**下一个物理行**）✓ |
| **③ 那句在说什么（我顺手核）** | `L527-529` 说的正是 `L530` 的 **`settingsSources,`**（"hands the layer map in"）⇒ ★ **与我 R24 读到的机制一致**（入口把层图交下去，内核只收到一个扁平对象） | ✅ **自洽** |
| **④ "跨行引文" 方法论** | ★ **整句**（L390 文本＋空格＋L391 文本）**不在任何单一物理行上** ⇒ **按整句 grep 会漏**；★ **片段**命中：`the entry is the only` **2 处**（两处坐标 ✔）、`one flat object` 1 处、`folded pack default from a deployment value` 1 处；★ 而 **`L390` 那半句本身**作为单行子串**命中 1 处** | ★★ **你的诊断成立**：**跨行引文不能按整句 grep**；**要么 grep 短片段、要么把行读出来** ✓ |
| **⑤ 你的仪器错（自陈）** | ★ **我复现了**：按整句找 ⇒ **0 命中**；按片段找 ⇒ **命中** ⇒ 与"引文不存在"的错觉完全吻合 | ✅ **你的自陈属实** |
| **⑥ 你把 R24 的复现照录** | 与我的读数一致（`CONTROL 7/0`／`M-entry 5/2` 两条 FAIL 逐字／`M-kernel 7/0` 无变化／blob 三处相同） | ✅ 无异议 |

## 1. 两处坐标（原样，带缩进）
```
L390:     // Where each merged key CAME FROM, so the resolved view never calls a pack default "config" (the entry is the only
L391:     // layer that knows this; the kernel sees one flat object). Consumed by kernel.status().settings.resolved.
L527:     // ROUND 1 / K5 (D-02): the entry is the only layer that knows a folded pack default from a deployment value, so it
L528:     // hands the layer map in. The named overlap report travels to the HOST face instead (`mergeReport` below), because
L529:     // the kernel never acts on it and a kernel seam read by one file only is exactly what the seam gate forbids.
L530:     settingsSources,
```
⇒ ★ **两处都与我 R24 的读法不冲突**：我在 R24 写的是"★ **入口源码 `:393` 邻近那句注释我没有逐字取**（只在测试的新注释里看到它被引用）⇒ 保持为你的引用" ⇒ ★ **现在我逐字取到了，且它确实存在**（两处）⇒ **该条从"未核"转为"核了：相符"** ✓。
★ 附带：`L390-391` 那句与本轮结论**同向**（"the resolved view never calls a pack default **config**"）：★ 它讲的正是 **R21/R24 那条来源诚实化**（pack 默认不许被叫 `config`），而**R24 的入口变异**（把 `'pack:'+…` 改成 `'config'`）恰好就是**违反这句话**的那个变异 ⇒ ★ **注释、断言、变异三者现在指向同一件事** ✓。

## 2. ④⑤ 方法论：跨行引文（我复现了你的坑，也踩了自己的两个坑）
- ★ **整句**（两行拼接后作为**单个子串**）在文件里 **0 命中** ✓；★ **任一短片段**命中 ✓；★ 正确的做法是 **① grep 短片段**（`the entry is the only` ⇒ **2 处**，正好是你给的两处坐标）或 **② 把编号行读出来** ✓。
- ★★ **我自己的两个仪器错（具名）**：
  1. 我第一版"逐字比较"**没有归一前导缩进** ⇒ 打印出 `L390 === claim1 : false` ⇒ ★ **那是我的比较器太严，不是你的坐标错**（实际那两行只多了 4 个空格）⇒ 归一后皆 `true` ✓。
  2. 我第二版想给出"**跨行 grep 的正确正则**"，却**没有对正文做转义**就拼进了 `new RegExp` ⇒ 打印 `match = false`（**正则本身坏**）⇒ ★ 我**不把它当读数**；有效读数只有上面那两条（整句子串 0／片段命中）✓。
- ★ **与本会话同族的三次现场**（一并归档）：**你**这次的整句 grep（跨行）／**我 R24 那条"入口注释找不到"**（同一原因）／**R21 我用正则找 `prompt.sections` 却命中宿主的 `sandbox:policy`**（命中了**错误的那一份**）⇒ ★ **共同教训**：**当"引用/正则"miss 时，第一步要怀疑它命中的【形态/那一份】**（跨行、换行、同名它处），**而不是先断言"它不存在"**。★ 这与你那句"**先排除量具**"是同一条。

## 3. ⑤⑥ 你的裁定我照办，并保留限定
- ★ **内核 `packSource` 那条路的"牙"**：**接受你的裁定（不必再追）** ⇒ ★ 我把它的状态记为 **"未核，且按 Lead 裁定出范围"**（**不会**在任何地方声称它"已被断言覆盖"）；★ 我的限定照旧入册：**"变异内核不改判"是本夹具范围内的真话，不可反推成"删掉它也安全"** ✓（你已照录 ✓）。
- ★ **R24 的复现**：无异议（`7/0`／`5/2`／`7/0` 与两条 FAIL 的 detail 逐字一致）✓。

## 4. 我**主动报**的一件事（你说"若还有需要独立核的"）
★ **入口文件正卡在 1200 行**（`split('\n')` = **1200**，sha `CDCBA5C9875C86BA`）⇒ ★ `audit-code-size` 的判据是 **`lines > LIMIT`**（严格大于）⇒ **现在合法**，但 **任何 +1 行的改动都会立刻触发 `:52`**（"no framework file outside the recorded backlog exceeds 1200"），而本仓**不许往 `KNOWN` 加名字** ⇒ ★ 这是一处**常驻贴线风险**，值得在下一轮任何要动入口的改动前先知道（我 R19/R24 已各记一次，此处再报一次，**不需要你本轮做任何事**）。★ 其余我**没有**新的待核项。

## 5. 没核 / 未做（与"核了"分开写）
1. **未核**：**全量 sweep**（T0/T1 归你）—— 本轮**没有跑任何套件**（这是一个"读注释 + 量形态"的轮次）。
2. **未核**：内核 `packSource` 那条路是否另有常驻断言覆盖（**按你的裁定出范围**，见 §3）。
3. **未做**：任何仓内代码/测试改动（本轮真树只新增本报告）。
4. **未核**：`L390-391` / `L527` 这两句注释的**语义是否已在别处被断言**（我只核了"文字存在"与"与我 R24 的机制读数同向"；★ "注释与断言一一对应"这一层**没有**核）。
