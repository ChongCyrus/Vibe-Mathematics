> ★★★ **编码事故与处置（PHASE 6 · 轮 8 记载）** —— ★ 本卷由轮 1 的一次 PowerShell 写入事故**部分损坏**：
> 中文被按控制台代码页解码再存回 UTF-8（★ `发明上报闭环` 变成 `鍙戞槑涓婃姤闂幆`）✓
> ★ **已恢复**：★ 纯 "UTF-8 被当 GBK 读" 的行（★ 12 行，★ 用 GBK 反解还原）✓
> ★ **未恢复**：★ 含**私用区／注音／`€`** 的行 —— ★ 它们走了**另一条字节路径**，★ 反解只会产出**看似像中文的胡话** ⇒
>   ★ **不修**，★ 而以 **`⟪编码损坏⟫`** 前缀**显式标出**（★ 宁可见，★ 不可静默）✓
> ★★ **替代文档**：★ 目标 2 的施工地图以 **`docs/acceptance/phase6-v3-p0-build-checklist.md`** 为准 ✓
> ★★ **教训**：★ **中文文档一律用 `write`／`edit` 工具写，★ 绝走 PowerShell `Set-Content`／`Out-File`** ✓

# Phase 6 · 目标 2 地基：原 vibe-math-v3 的机制全盘 ＋ vmu 可表达性判定 ＋ 复刻施工图

> ★ **来源**：★ 第三批队友 `v3-inventory` 的只读审计（2026-10-18，轮 1）。
> ★ **性质**：★ **审计报告** —— ★ 不是设计定稿；★ 它自列的"没核到"清单一并保留在文末，★ **不得当结论用**。
> ★ **路径口径**：★ 未注明的 `:行` 指 `vibe-math-v3/vibe-math-v3.js`；`kernel/` 指 `vibe-math-vmu/kernel/`。
> ★ **Lead 复核**：★ 其三条关键结论（M2 目录仅 15 项／`rewriteResult` 零消费者／`control/heartbeat` 无定时器）★ **已由 Lead 回代码复核为真** ✓

---
# v3 杩愯鏈哄埗鍏ㄧ洏 + vmu 鍙〃杈炬€ч€愭潯鍒ゅ畾 + 澶嶅埢鏂藉伐鍥鹃鏋?
⟪编码损坏⟫ > 鍙瀹¤銆備粨搴?`D:\wd\vibemath寮€鍙慭Vibe-Mathematics`銆傛湭璺?git銆佹湭鏀逛换浣曟枃浠躲€?> 鍩虹嚎鍙ｅ緞锛氳鏁颁竴寰?Node `split('\n')` 娲剧敓锛涙竻鍗曚竴寰嬭剼鏈淳鐢燂紙鍛戒护瑙?搂0锛夈€?> 涓庝换鍔′功缁欑殑鍩虹嚎鏁板瓧鐨勫樊寮傚凡鍦ㄤ笅琛?娲剧敓鍊?鍒楀瀹炵粰鍑猴紙浠诲姟涔﹂噷 `瀹炵幇鏂规.md` 鍐?406 琛岋紝瀹炰负 649 琛?498 闈炵┖琛岋紱`agent.cordis.yml` 鍐?347锛屽疄涓?425 琛?364 闈炵┖琛岋紱`math-computation.js` 鍐?1403锛屽疄涓洪潪绌?1404锛忔€?1482锛沗vibe-math-v3.js` 6285 琛?鉁擄紝闈炵┖ 6199锛夈€?
⟪编码损坏⟫ ## 0. 娲剧敓鍊硷紙鍛戒护锛?
```powershell
node -e "const s=require('fs').readFileSync('vibe-math-v3/vibe-math-v3.js','utf8');const L=s.split('\n');console.log(L.length, L.filter(l=>l.trim()).length)"
```

⟪编码损坏⟫ | 瀵硅薄 | 娲剧敓鍊?| 鍛戒护瑕佺偣 |
|---|---|---|
| `vibe-math-v3/vibe-math-v3.js` | **6285** 鎬昏 / 6199 闈炵┖ | `split('\n')` |
⟪编码损坏⟫ | `vibe-math-v3/瀹炵幇鏂规.md` | **649** 鎬昏 / 498 闈炵┖ / **16 鑺?* | 鍚屼笂锛沗## ` 璁℃暟 |
| `vibe-math-v3/agent.cordis.yml` | **425** 鎬昏 / 364 闈炵┖ | 鍚屼笂 |
| `vibe-math-v3/math-computation.js` | 1482 鎬?/ **1404** 闈炵┖ | 鍚屼笂 |
| `vibe-math-v3/math-engines.js` | 198 鎬?/ 190 闈炵┖ | 鍚屼笂 |
⟪编码损坏⟫ | `vibe-math-vmu/packs/v3-core/index.js` | **145** 鎬?/ 134 闈炵┖ | 涓庝换鍔′功 134/144 宸?1锛堟湯灏炬崲琛屽彛寰勶級 |
⟪编码损坏⟫ | v3 宸ュ叿鍚?| **36** 涓紙35 涓?`vibe_math_*` 锛?`math_computation`锛?| `registerTool\('鈥?` 鍘婚噸锛涗袱澶勬敞鍐屽悇 36锛屽悕瀛楅泦鍚堢浉绛?|
⟪编码损坏⟫ | v3 鍙傛暟 | `PARAM_SCHEMA` **64** 鏉★紱`PARAM_PROPS_KEYS` **63** 鏉★紙宸?`fileLockTimeoutMs`锛?| 瑙?搂3.7 |
⟪编码损坏⟫ | v3 鑰愪箙鐘舵€佹枃浠?| `saveAll` 鍐?**14** 涓?`State/*.json`锛堬紜`directions.json` 鍗曠嫭鍐欙級 | `{ rel: 'State/鈥? }` 鍘婚噸 |
⟪编码损坏⟫ | vmu 宸插彂甯冩湇鍔?| `register('<name>'` 鍘婚噸 **80**锛歚vmu.*` **79** 锛?`math_computation` 1 | 瑙?搂4 璇佹嵁 |
| vmu 宸插０鏄庤缃敭 | `SETTING_DEFS.length` = **1232** | `import * as S from './settings/schema.js'` |
⟪编码损坏⟫ | vmu 閽╁瓙 | `HOOK_REGISTRY` **143** / `VU_HOOKS` **124** / `DSH_HOOKS` **19** / `BRIDGED_HOOKS` **14** / vmu 鍙樆鏂?**16** | `import {鈥 from './kernel/bus.js'`锛涙敞鎰?`docs/19:39-46` 浠嶅啓"20 椤?锛屽凡杩囨椂 |
| 鍏变韩 verbatim 妯″潡 | `math-computation.js` 涓?`math-engines.js` 鍦?v3/vmu/v4/v5r 鍥涗唤 **sha256 閫愬瓧鑺傜浉鍚?* | `sha256` 鍓嶇紑 `def90af767a64fcc` / `a4891a0359a4ee2f` |

⟪编码损坏⟫ ## 1. v3 鏈哄埗娓呭崟鍏ㄨ〃锛堢 1 姝ワ級

⟪编码损坏⟫ 鍒椾箟锛?*鏈哄埗 锝?鍋氫粈涔堬紙涓嶆妱鏍囬锛?锝?瀹炵幇澶?锝?鐘舵€?鏁版嵁 锝?鍙傛暟 锝?宸ュ叿/鍛戒护 锝?鎷掔粷鐮?*銆?"鏃犵爜"锛濆彧鏈?`{ok:false,message}` 鎴栭潤榛樺墧闄わ紝娌℃湁鍏峰悕 code锛坴3 鏅亶濡傛锛岃繖鏄畠鍦?vmu 涓婂鍒绘椂蹇呴』琛ラ綈鐨勪竴渚э級銆?
⟪编码损坏⟫ ### A. 椹卞姩涓庣敓鍛藉懆鏈?
⟪编码损坏⟫ | # | 鏈哄埗 | 鍋氫粈涔?| 瀹炵幇澶?| 鐘舵€?鏁版嵁 | 鍙傛暟 | 宸ュ叿/鍛戒护 | 鎷掔粷鐮?|
|---|---|---|---|---|---|---|---|
⟪编码损坏⟫ | A1 | 浼氳瘽宸ュ巶锛嬪浼氳瘽闅旂 | 姣忎釜鏍逛細璇濅竴涓?`Session`锛歱arams/agentRegistry/decisionQueue/dirState/planQueue/tasks/鏂囦欢閿佸叏鍦ㄩ棴鍖呴噷锛涘瓙浠ｇ悊璋冪敤娌?lineage 鎵惧埌鑷繁鐨勬牴浼氳瘽 | `:302-364` `:367` `:337-356` | 鍐呭瓨 Map锛沗VibeMath/current.<sessionId>.json` `:577-583` | 鈥?| 鎵€鏈夊伐鍏凤紙鎸?`exec.agent` 璺敱 `:5454-5460`锛?| 鏃?|
⟪编码损坏⟫ | A2 | 杩涚▼绾厓 | 鍚岃繘绋?pause鈫抮esume 绾厓鐩哥瓑锛堜繚鐣欏瓨娲诲瓙浠ｇ悊锛夛紱璺ㄨ繘绋嬩笉绛?鈬?init 娓?registry/tasks銆佷涪寮冭法杩涚▼璁″垝闃熷垪 | `:329` `:4902-4913` `:1383-1386` | `State/process_epoch.json` | 鈥?| 鈥?| 鏃?|
⟪编码损坏⟫ | A3 | **tick 寰幆锛堣皝鍦ㄩ┍鍔級** | 搴旂敤灞?*姣?1000ms** 鎵叏閮?running 浼氳瘽锛宍tickDue()`锛堥粯璁?2000ms锛夛紜鏃?gate锛嬫棤鍦ㄩ鎵?`tick()`锛沗tick()` 椤哄簭鍥哄畾涔濇锛氫緷璧栧悓姝モ啋姒傜巼1鏀跺彛鈫掍紭鍏堢骇鈫掍緷璧栫姸鎬佲啋鏅嬪崌鈫掗獙璇佽ˉ娲锯啋鎵ц璁″垝闃熷垪鈫掕鍒掆啋鏂规硶鏁寸悊鍏滃簳鈫掓眹鎶モ啋绱㈠紩鑺傛祦鈫掔粓姝㈠垽瀹?| `:5578-5596` `:5444` `:2018-2042` | `tickInFlight/lastTickAt` | `tickIntervalMs`(2000) | 鈥?| 鏃?|
⟪编码损坏⟫ | A4 | start/resume/pause/abort | start(鍚岀骇 init fresh)鈫掑彇椤圭洰閿佲啋running=true鈫掔珛鍗?tick锛沘bort 涓柇鍏ㄩ儴瀛愪唬鐞嗐€佹竻闃熷垪銆佹斁閿?| `:4969-4972` `:4898-4923` | `scheduler`+`State/*` | `mode` 鏃犲叧 | `vibe_math_start/resume/pause/abort` `/vibe` | `PROJECT_LOCKED` `:4958` |
⟪编码损坏⟫ | A5 | 缁堟鍒ゅ畾 | 鏃犳湭瑙ｅ喅锛嬫棤寰呴獙璇佸€欓€夛紜鏃犵湡瀹炲湪閫旓紙planner/paper 涓嶇畻锛夛紜鏃犱换鍔★紜鏃犺鍒?鈫?鍏堝啓璁烘枃鍐?`running=false`锛涘叏姝昏矾 鈫?stall 鍋滐紙涓嶆槸"鍏ㄨВ鍐?锛?| `:5025-5071` | 鈥?| `finalPaper` | 鈥?| 鏃狅紙鍐?`stop`/`stall` 娲诲姩锛?|
⟪编码损坏⟫ | A6 | 椤圭洰閿侊紙绉熺害锛?| 鍚岄」鐩悓鏃跺彧涓€涓細璇濊皟搴︼紱姣?250ms 杞锛岀绾︾敤鎺?1/4 鎵嶅啓鐩橈紱绉熺害杩囨湡鍙殣寮忔帴绠★紝鍚﹀垯闇€ `override` | `:4951-4968` `:4943-4950` `:5576` `:334` | `State/project_lock.json` | `projectLockTimeoutMs`(60000) | `vibe_math_lock_status`銆乣/vibe lock` | `PROJECT_LOCKED` |
⟪编码损坏⟫ | A7 | 鐘舵€佹彁浜ゅ崗璁?| 姣忎釜 JSON 鍏堝啓 `.tmp`鈫掑洖璇婚潪绌衡啋鎻愪氦鈫掓渶鍚庡啓 `commit.json{seq,files,missing,mode}`锛涙仮澶嶆椂鐢?marker 鍒?鎾曡鎻愪氦" | `:1316-1361` `:1401-1411` | `State/*.json`锛媊State/commit.json` | 鈥?| 鈥?| 鏃狅紙璁?`stateWriteFailures` `:1309`锛?|
⟪编码损坏⟫ | A8 | 娲诲姩鏃ュ織 | 鐜舰浜嬩欢鏃ュ織锛岃惤鐩樹笂闄?200锛岄噸鍚悎骞跺洖璇?| `:1455` `:335` `:1419` `:1368-1369` | `State/activity_log.json` | `activityLogCap`(100) | status/report 鐨?`recentActivity` | 鏃?|
⟪编码损坏⟫ | A9 | 鏂偣缁窇 | resume锛濋噸璇昏缃啋璇荤姸鎬佲啋绾厓鍒ゅ畾鈫掗噸寤虹煡璇嗙偣绱㈠紩鈫掞紙Lean 浣滀笟鎭㈠锛夛紱鍙欎簨鏂偣锛漨d 灏鹃儴 | `:4898-4923` `:1362-1399` `:4901` | 鍏ㄩ儴 State锛媘d | 鈥?| `vibe_math_resume` | 鏃?|

⟪编码损坏⟫ ### B. 搂6 瑙勫垝-璋冨害闂幆锛堟牳蹇?#1锛?
⟪编码损坏⟫ | # | 鏈哄埗 | 鍋氫粈涔?| 瀹炵幇澶?| 鐘舵€?鏁版嵁 | 鍙傛暟 | 宸ュ叿/鍛戒护 | 鎷掔粷鐮?|
|---|---|---|---|---|---|---|---|
| B1 | 鍙帹杩涘伐浣滃垽瀹?| 鏈?鏂瑰悜鍙帹/鏈夐獙璇佸€欓€?鏂规硶鏁寸悊**鍒版湡**/璁″垝闃熷垪闈炵┖"鎵嶈鍒掞紱planner 鍦ㄩ€斿垯涓嶉噸澶嶏紱鍐峰嵈瀵规瘡涓€娆¤鍒掕皟鐢ㄩ兘鐢熸晥 | `:2274-2287` `:2316-2334` | `agentRegistry/dirState/planQueue` | `plannerEnabled` `planMinIntervalMs` | 鈥?| 鏃?|
⟪编码损坏⟫ | B2 | 瑙勫垝绠€鎶?| 鍙鑱氬悎锛歨orizon/绌烘Ы/闂(鐘舵€伮蜂紭鍏堢骇路渚濊禆灏辩华路鏂瑰悜瀛樻椿鐜嚶穜unning_solver_dirs)/楠岃瘉鍊欓€?top10/娲昏穬浠ｇ悊/鏂规硶绱㈠紩/寰呮矇娣€鏁?涓婃璁″垝+outcomes/鏈€杩?8 浜嬩欢 | `:2288-2315` | 鍙 | `planningHorizon` 杩?brief | 鈥?| 鏃?|
⟪编码损坏⟫ | B3 | 璋冪敤瑙勫垝浠ｇ悊 | 姣忔鏂板缓涓€涓?`planner:<planId>` 鍙画瀛愪唬鐞嗭紝鎻愮ず璇嶏紳浜烘牸锛嬬畝鎶?JSON锛? 鍔ㄤ綔璇嶈〃锛嬬‖瑙勫垯锛涚敤 `plannerProvider/Model` | `:2336-2351` `:1888-1904` `:1555-1562` | `agentRegistry{role:planner}` | `plannerPersona/Provider/Model/planningHorizon` | `vibe_math_plan{force}` | 鏃狅紙澶辫触璁″叆 `plannerFails`锛?|
⟪编码损坏⟫ | B4 | 璁″垝鏍￠獙锛堢‖绾︽潫锛?| 鍙敹 6 鍔ㄤ綔锛坰pawn/interrupt/promote/wait/continue/stop锛夛紱鎸?`planningHorizon` 鎴柇锛涘姩浣滈敭鍘婚噸锛涢€愯鑹叉牎楠岋紙explorer 鏂瑰悜鑰楀敖涓旀湭瓒呴噸璇曘€乻olver 鏂瑰悜 active 涓旀湭鍒拌疆闄愪笖鏈湪璺戙€乿erifier 鍊欓€夊瓨鍦ㄤ笖涓嶅繖銆乸romote 闇€浠峰€奸槇鍊硷級锛泈ait/continue/stop 浠呭缓璁?| `:2395-2454` | 鈥?| `planningHorizon` `solverMaxRounds` `maxExplorerRetries` `promoteValueThreshold` | 鈥?| 鏃狅紙闈欓粯鍓旈櫎锛嬫棩蹇楋級 |
⟪编码损坏⟫ | B5 | manual 璁″垝瀹℃壒闂?| planner 杈撳嚭鍚庝笉鐩存帴鍏ラ槦锛岃€屾寕 `node:'plan'` pending decision 骞跺崰鍞竴 gate锛沢ate 瀛樺湪鏃?tick 鐩存帴鏃╅€€ | `:2385-2389` `:1940-1962` `:2021` | `decisionQueue`锛媊State/decision_queue.json` | `mode=manual` | `vibe_math_list_decisions` `vibe_math_decide` | `VIBE_MATH_DECISION_NOT_FOUND`锛廯VIBE_MATH_DECISION_ALREADY_RESOLVED` `:1996-1997` |
⟪编码损坏⟫ | B6 | 寰呮墽琛岄槦鍒楋紙璺?tick锛?| 鏍￠獙鍚庢暣鎵瑰叆 `planQueue`锛涙瘡 tick 鎸夊墿浣欏苟鍙戦€愭潯鎵ц锛涙墽琛岀粨鏋滈€愭潯璁?outcome锛堟垚鍔?澶辫触+error锛?| `:2466-2477` `:2478-2517` | `planQueue`锛媊State/plans.json{queued,epoch}` | `maxParallelThreshold` | 鈥?| 鏃?|
⟪编码损坏⟫ | B7 | 璁″垝鍥炲啓闂鍗?| 鎶婃瘡姝?`reason` 鍐欒繘闂鍗?`- 璁″垝:` 閿氱偣锛堣蒋瑙勮寖涓€绛夊瓧娈碉級 | `:2456-2465` | `Problems/<id>.md` | 鈥?| 鈥?| 鏃?|
⟪编码损坏⟫ | B8 | 瑙勫垝瀛︿範闂幆 | 姣忔璁″垝锛媟aw锛媣alidated 鍐?`Logs/Plans/<planId>.json`锛沗lastPlanSummary` 钀?`State/last_plan.json`锛屼笅娆＄畝鎶ユ惡甯?| `:2375-2376` `:2312` `:1433` `:1389` | `Logs/Plans/*.json`锛媊State/last_plan.json` | 鈥?| `vibe_math_plan`锛堟煡鐪嬶級 | 鏃?|
⟪编码损坏⟫ | B9 | 澶辫触鍥為€€ | 鏃犺緭鍑?JSON 闈炴硶/杩炵画澶辫触 鈫?鍚?tick 璧?v2 寮忓惎鍙戝紡锛堝厛鏅嬪崌涓€涓啋寤轰竴涓獙璇佷换鍔♀啋鎸変紭鍏堢骇娲?explorer/solver锛宮anual 璧?spawn 闂級锛涜繛缁?`plannerMaxFails` 娆?鈫?`plannerEnabled=false` 姘镐箙闄嶇骇锛?*绌鸿鍒?鍏ㄨ鍓斾笉绠楀け璐?* | `:2537-2591` `:2345-2351` `:2359-2383` | `plannerFails` | `plannerMaxFails`(3) | 鈥?| 鏃?|
⟪编码损坏⟫ | B10 | 纭害鏉熼泦鍚堬紙浠ｇ爜寮哄埗锛?| 骞跺彂涓婇檺锛涘箓绛夛紙registry锛嬮槦鍒楀弻閲嶅幓閲嶏級锛涘凡楠岃瘉瀵硅薄涓嶅啀鍏ュ€欓€夛紱渚濊禆鏈氨缁笉娲捐В锛涘伐鍏疯繃婊?缃戠粶/鑴氭湰/璋冪敤涓婇檺鐢变唬鐮佹敞鍏ワ紱鍗曟枃浠跺崟鍐欒€咃紱缁堟鐢变唬鐮佽瀹?| `:2318` `:2541` `:2231-2236` `:2404-2425` `:2207/2217` `:2163` `:1582-1595` `:323` `:5025` | 鈥?| 澶氾紙瑙?搂3.7锛?| 鈥?| 鏃?|
⟪编码损坏⟫ | B11 | 鍛介鏅嬪崌涓洪棶棰?| 浠峰€?鍏抽敭鎬?鈮?闃堝€间笖 0<p<1 涓旀湭鏅嬪崌 鈫?閫犮€屽垽鏂笅杩板懡棰樻槸鍚︽垚绔嬶細鈥︺€嶉棶棰橈紝鎶婅瘉鏄?璇佷吉鏉＄洰杞垚瑙ｆ硶锛?*姣?tick 鍙竴涓?* | `:2174-2201` `:2519-2534` | `Problems/`锛媊Propos/`锛坄鍦ㄩ棶棰樻竻鍗昤銆乣鍒ゆ柇鍛介`銆乣鏉ユ簮鍛介`锛?| `promoteValueThreshold`(0.7) | 鈥?| 鏃?|
⟪编码损坏⟫ | B12 | 浼樺厛绾у姩鎬佽皟鏁?| 涓夌瓥鐣ワ細姝昏矾闄嶆潈鍒?10锛涘瓨娲荤巼鏄犲皠 `10-10*maxSurvival`锛涘懡棰樿繘搴﹀垎妗?`closeness*1.2+material*0.08` | `:2132-2161` | 閿氱偣 `浼樺厛绾 | `priorityAdjust` `proposPriorityAdjust` | 鈥?| 鏃?|

⟪编码损坏⟫ ### C. 搂8 楠岃瘉 锛?搂11 Lean

⟪编码损坏⟫ | # | 鏈哄埗 | 鍋氫粈涔?| 瀹炵幇澶?| 鐘舵€?鏁版嵁 | 鍙傛暟 | 宸ュ叿/鍛戒护 | 鎷掔粷鐮?|
|---|---|---|---|---|---|---|---|
⟪编码损坏⟫ | C1 | 楠岃瘉鍊欓€?| 浠庛€岄棶棰樿В娉曘€嶃€岃８鍛介銆嶃€屽懡棰樼殑璇佹槑/璇佷吉鏉＄洰銆嶉€?`rId`锛涜烦杩囧凡楠?姒傜巼 0路1/never/绌烘枃鏈紱鎸?浼樺厛绾р啈銆佹鐜団啌 鎺掑簭 | `:2204-2230` | 鈥?| 鈥?| 鈥?| 鏃?|
⟪编码损坏⟫ | C2 | 寤洪獙璇佷换鍔?| 鎸?`rId` 骞傜瓑锛沗expectedCount=max(2,verifierCount)`锛堝揩鐓э級锛涘閲忓厑璁告椂琛ユ淳楠岃瘉鍣紱require 涓斿凡鍦ㄥ緟鍔?鈬?涓嶅啀寤轰换鍔★紙闃茬┖杞級 | `:2232-2247` `:2248-2256` `:2257-2271` | `tasks`锛媊State/tasks.json` | `verifierCount` `maxParallelThreshold` | 鈥?| 鏃?|
⟪编码损坏⟫ | C3 | 鐙珛璇勫 | 姣忎釜楠岃瘉鍣ㄨ繑鍥?`{Result鈭圼0,1],Reason,changed?}`锛汻esult 澶瑰埌 [0,1]锛涚┖ Reason 涓嶆嫆缁濅絾鎻愮ず璇嶈姹傚繀濉?| `:4173-4198` `:1859-1873` | `t.childResults` | `verifierPersona/宸ュ叿杩囨护` | 鈥?| 鏃?|
⟪编码损坏⟫ | C4 | 绁ㄦ暟涓嬮檺 | 鑷冲皯 `max(2,verifierCount)` 绁?**涓旀湰杞叏閮ㄥ洖鎶?*鎵嶆帹杩?瑁佸喅锛涘崟绁ㄧ粷涓嶅畾璁猴紱蹇収璇箟锛堜笉璇诲疄鏃跺弬鏁帮級 | `:4149-4170` `:4164` | 鈥?| `verifierCount` | 鈥?| 鏃?|
⟪编码损坏⟫ | C5 | 杈╄锛堜氦娴佺兢锛?| 鏈敹鏁涗笖 `round<debateMaxRounds` 鈫?鎶婄疮绉?transcript 鍙戠粰**姣忎釜**楠岃瘉鍣ㄧ画杞紱瀹归噺/鏈繍琛屽垯 `paused` 绛夊悗缁?tick锛涘叏 followup 澶辫触鍒欑洿鎺ヨ鍐?| `:4199-4229` `:1874-1887` `:4172` | `t.history` | `debateMaxRounds`(5) `maxParallelThreshold` | 鈥?| 鏃?|
⟪编码损坏⟫ | C6 | 瑁佸喅绠楁硶 | 鍏?1鈫?锛涘叏 0鈫?锛?*杩戝叡璇嗗厛琛?*锛堝叏鍚屼晶涓斿潎鍊尖墺0.85/鈮?.15 鈫?鍙栧潎鍊煎す [0.01,0.99]锛夛紱`forced` 鈫?绛夋潈鍧囧€煎す绔偣锛?*涓嶆寜鍘嗗彶鍑嗙‘鐜囧姞鏉?*锛夛紱`flat` 鈫?0.5 | `:4244-4268` | 鈥?| `verdictMode`(forced) | 鈥?| 鏃?|
⟪编码损坏⟫ | C7 | 瑁佸喅鍥炲啓 | 鍥涚瀵硅薄鍒嗗埆鍥炲啓锛氳８鍛介锛堟鐜?鐘舵€?璇佹槑鍒楄〃锛夈€佽瘉鏄幝疯瘉浼潯鐩紙prob/status锛屽弽鍚戣ˉ涓€鏉″渚э級銆侀棶棰樿В娉曪紙prob/status锛夛紱鑱斿姩銆屽垽鏂懡棰樸€嶄笌銆屾潵婧愬懡棰樸€嶏紱鍐?Verified 鍗★紱鍐欒京璁鸿褰曪紜`verifier_accuracy.json`锛堜粎瀹¤锛屼笉鍙備笌鍔犳潈锛?| `:4269-4368` `:4284` `:4277-4283` `:4369-4378` | Propos/Problems/Verified锛媊Logs/Verification/`锛媊State/verifier_accuracy.json` | 鈥?| 鈥?| 鏃?|
⟪编码损坏⟫ | C8 | manual 瑁佸喅闂?| 杈╄缁撴潫鎸?`node:'verdict'` pending锛沗decide` 鍙?`override` 鎴?1/0 | `:4230-4242` `:1980` | decisionQueue | `mode` | `vibe_math_decide` | 鍚?B5 |
⟪编码损坏⟫ | C9 | Lean 涓夋。 | `off` 鐪熸棤鎿嶄綔锛堟彁绀鸿瘝闆舵彁鍙娿€丼tate/formal.json 涓嶈惤锛夛紱`encourage` 娉ㄥ叆榧撳姳娈点€丩ean 閫氳繃鍚庡鏌ュ璞¤浆涓?*蹇犲疄鎬?*锛沗require` 鍔犻棬绂侊細鏃?`passed`/`blocked` 鐨勭湡/鍋囪瀹?鈫?璁?`formal-required`锛嬪緟鍔烇紜鍏憡锛?*涓嶅姩鍘熸潈閲?姒傜巼**锛岃ˉ榻愬悗鑷姩閲嶅叆 | `:2967-3004` `:2112-2131` `:3319-3337` `:2242` `:541-545` | `State/formal.json{records,todo,libRuns}` | `formalVerify`(off) | `set_params` | 闂ㄧ涓嶆姏鐮侊紙璁?`formal-required`锛?|
⟪编码损坏⟫ | C10 | Lean 鍚屾杩愯 | 瑙ｆ瀽鍙墽琛屾枃浠讹紙鏄惧紡/ PATH / 宸茬煡瀹夎浣嶏級鈫抈spawn(argv, cwd=椤圭洰鏍? stdout 64KB, grace=timeout)`鈫掕秴鏃?`terminate()`鈫掕緭鍑烘埅鏂?4KB | `:3055-3153` `:3769-3800` `:172-286` `:5881-5916` | 鈥?| `leanCommand/Args/TimeoutMs/SearchPaths` | `vibe_math_lean_run` | `NO_SUBPROCESS` `LEAN_NOT_FOUND` `LEAN_SPAWN_FAILED` `LEAN_RUN_FAILED` `LEAN_TIMEOUT` `LEAN_FAILED`锛堣〃 `:547-558`锛?|
⟪编码损坏⟫ | C11 | Lean 寮傛闃熷垪 | 鍏ラ槦鍗宠繑鍥?`async.jobId`锛涘績璺虫帹杩涢槦鍒楋紙骞跺彂涓婇檺锛夛紱钀藉湴鍐?`Formal/Jobs/<id>.json`锛屽叕鍛婅繘涓嬩竴杞彁绀猴紱宕╂簝鎭㈠**缁濅笉缃?passed**锛沝ispose 缁堟瀛ゅ効 | `:3420-3544` `:3569-3627` `:3628-3651` `:3405` `:3434-3445` | `Formal/Jobs/*.json`锛媊State/formal.json` | `leanAsync`(true) `leanJobsMaxParallel`(1) | `vibe_math_lean_job` | 鍚屼笂锛媊VMU?`锛坴3 鍐呴儴鏃犵爜锛?|
⟪编码损坏⟫ | C12 | Lean 褰掓。/澶嶇敤 | `def`/`lemma`鈫掑叏灞€ `Formal/{Lib,Proved}/<name>.lean`锛嬮噸寤虹储寮曪紱`proof`鈫抈Formal/<id>.lean`锛?*浠呮渶杩戜竴娆¤窇閫?*鎵嶅悓鏃跺啓 `Verified/Lean/<id>.lean` 骞剁疆 passed锛沗blocked` 闇€ note锛沗lean_read` 鍙鍥?Lib/Proved | `:3873-4011` `:3693-3730` `:3811-3839` `:3652-3692` | `Formal/`锛媊Verified/Lean/` | 鈥?| `lean_archive` `lean_lib` `lean_read` | `V3_INVALID_ARGUMENT` `V3_NOT_FOUND` `V3_WRITE_FAILED` |
⟪编码损坏⟫ | C13 | 蹇犲疄鎬х己闄?defect | `defect+note` 蹇呭～鈫掍笉璁烘鍓?passed/blocked 涓€寰嬮檷 `attempted`銆佹竻 proof銆?*鎾ゅ洖褰掓。璇佹槑**锛堝垹闄わ紡涓嶅彲鍒犲垯灏卞湴瑕嗙洊鎾ゅ洖澹版槑锛忛兘澶辫触鍒欏叕鍛?鏈兘鎾ゅ洖"锛屼笁鎬佸瀹炶锛夆啋require 涓嬫湰娆¤瀹氫笉鐢熸晥 | `:4037-4087` `:4013-4036` `:4088-4148` `:3281-3295` | `State/formal.json`锛媊Formal/TODO.md`锛嬪崱閿氱偣 | 鈥?| 鍥炴墽 `formal` 瀛楁锛堥《灞傛垨 `meta.formal`锛?| `V3_INVALID_ARGUMENT`锛坣ote 绌猴級`$` |
⟪编码损坏⟫ | C14 | 褰㈠紡鍖栨姇褰遍潰 | 鍗＄墖閿氱偣 `- 褰㈠紡鍖?`锛堟枃鏈骇鎻掑叆锛屼笉鏁村崱閲嶅啓锛夛紱`Formal/Index.md`锛沗Formal/TODO.md` 鎸夋。浣嶆帾杈?| `:3005-3026` `:3731-3768` `:3675-3692` | md 鍗★紜Formal/*.md | `formalVerify` | `lean_lib` | 鏃?|
⟪编码损坏⟫ | C15 | 鏈€缁堣鏂囷紙浠ｇ爜閲屽瓨鍦紝涓嶅湪 16 鑺傛鏂囷級 | 鏀跺彛鍒嗘敮閲?*鍏?*娲炬煇涓撹亴"璁烘枃鎾板啓"瀛愪唬鐞嗭紙`running=false`/鏀鹃攣涔嬪墠锛夛紝浜у嚭 `Paper/<椤圭洰>/{paper.md,paper.tex,paper.meta.json,paper.log.md}`锛堝彲缂栬瘧 PDF锛氭帰娴嬪紩鎿庘啋璺戜袱閬嶁啋淇閲嶈瘯锛夛紱婵€娲讳笂闄愨啋鎺掗槦锛嬪績璺抽噸璇曪紱paper 鍐欓攣 | `:4734-4866` `:5613-5635` `:4422-4429` `:4771-4801` | `Paper/`锛媊State/paper.json`锛媊paper.lock.json` | `finalPaper` `paperFormat` `paperLanguage` `paperCompilePdf` `paperLatexCommand` | `/vibe paper` | 鏃狅紙鍐呴儴涓夋€侊級 |

⟪编码损坏⟫ ### D. 搂7 鏂规硶搴擄紙鏍稿績 #2锛?
⟪编码损坏⟫ | # | 鏈哄埗 | 鍋氫粈涔?| 瀹炵幇澶?| 鐘舵€?鏁版嵁 | 鍙傛暟 | 宸ュ叿/鍛戒护 | 鎷掔粷鐮?|
|---|---|---|---|---|---|---|---|
⟪编码损坏⟫ | D1 | 鏂规硶鍗″舰鐘?| 閿氱偣 9 椤癸紙鏍囬/ID/绫诲瀷/鐘舵€?鍙俊鏂█/涓婄骇浣撶郴/瀛愭柟娉?鐩稿叧/閫傜敤鍦烘櫙锛夛紜`## 鏍稿績鍐呭`/`瀹氫箟涓庤鍙穈/`搴旂敤璁板綍`/`鏀硅繘鍘嗗彶`锛?*鏈鎺ョ鐨勬鏂囨鍘熸牱淇濈暀**锛堟棤鎹熷線杩旓級 | `:1018-1051` `:6241-6264` `:893-903` `:6222-6226` | `Methods/<id>.md` | 鈥?| `vibe_math_method_add` | 閲嶅悕鈫抈{ok:false,message}` `:5135` |
⟪编码损坏⟫ | D2 | 涓ょ骇搴?| 椤圭洰 `Methods/` 锛嬪伐浣滃尯鍏ㄥ眬 `<VibeMath>/Methods/`锛堝叏灞€鍙鍙锛屽啓鍙兘缁忔檵鍗囷級 | `:467-468` `:1237-1255` `:1088` `:1092` | 涓や唤鐩綍 | 鈥?| `vibe_math_method_list`锛堝甫 global 鏍囪锛?| 鏃?|
⟪编码损坏⟫ | D3 | 搴旂敤璁板綍鑷姩杩藉姞 | solver/explorer 鎶?`methods_used[{id,鏁堟灉,寤鸿}]` 鈫?杩藉姞 `### 搴旂敤 N锝滄椂闂达綔闂 X 鏂瑰悜 d`锛?*鏃犻棶棰?鏂瑰悜涓婁笅鏂囦笉璁?*锛堥槻 method-keeper 鏁寸悊姹℃煋璁℃暟锛夛紱鏈煡 id 鈫?褰?寰呮矇娣€鍙戞槑"鍏ラ槦 | `:2789-2815` `:1020-1051` | 鏂规硶鍗?`applications` | 鈥?| `vibe_math_sync_meta{kind:'solver'/'directions'}` | 鏃?|
| D4 | 鍙戞槑涓婃姤 | `new_inventions[{绫诲瀷,鏍囬,鍐呭鎻忚堪,鏄惁宸插叆搴搣]` 鈫?`methodLog.pendingInventions` | `:2816-2822` `:470` | `State/method_log.json` | 鈥?| 鍚屼笂 | 鏃?|
⟪编码损坏⟫ | D5 | 鏁寸悊璋冨害 | 鏈?pending 涓旓紙`methodKeepIntervalMs` 鍒版湡 鎴?pending鈮methodKeepEvery`锛変笖鏃犲湪椋?keeper 涓斿閲忓 鈫?娲?method-keeper | `:2824-2843` | 鈥?| `methodKeepIntervalMs`(0) `methodKeepEvery`(5) | 鈥?| 鏃?|
⟪编码损坏⟫ | D6 | 鏁寸悊浜у嚭 | `new_methods` 寤哄崱锛坄鍙俊鏂█` 鍙暀 姒傜巼鈭坽0,1} 鐨勫懡棰?ID锛夛紱`improvements`鈫抈v(n+1)`锛?*鏃犱骇鍑哄垯鎸?pending 鍏滃簳寤鸿崏绋垮崱**锛堥槻鍙戞槑婊炵暀锛夛紱鏈変骇鍑?鍏滃簳鍗虫竻 pending | `:2861-2927` `:2874-2901` `:2908-2922` | 鏂规硶鍗★紜`State/method_log.json` | 鈥?| 鈥?| 鏃?|
⟪编码损坏⟫ | D7 | 鍏ㄥ眬鏅嬪崌 | 椤圭洰鏂规硶 `applications鈮?` 涓旀湭鍏ㄥ眬锛歚methodAutoPromote=true` 鑷姩锛屽惁鍒?manual 鎸?`node:'method-promote'` 闂?| `:2928-2952` `:1986-1991` | 鍏ㄥ眬鍗?| `methodAutoPromote`(false) `mode` | `vibe_math_decide` | 鏃?|
⟪编码损坏⟫ | D8 | 鍙俊搴︾孩绾?| 鏂规硶鍗″彧鏈?`鍙俊鏂█` 閲岀殑 ID 琚涓哄彲淇★紝涓斿繀椤诲凡 Verified锛涘叾浣欏叏閮?缁忛獙"锛涙彁绀鸿瘝绂佹鎶婃湭楠岃瘉鏂规硶褰撳畾鐞?| `:2880` `:1699-1701` `:377`锛埪?.4/搂7.6锛?| 鈥?| 鈥?| 鈥?| 鏃?|

### E. 搂5 杞鑼冩暟鎹ā鍨?
⟪编码损坏⟫ | # | 鏈哄埗 | 鍋氫粈涔?| 瀹炵幇澶?| 鐘舵€?鏁版嵁 | 鍙傛暟 | 宸ュ叿/鍛戒护 | 鎷掔粷鐮?|
|---|---|---|---|---|---|---|---|
⟪编码损坏⟫ | E1 | 闂鍗?| 4~7 琛岄敋鐐癸紜闄堣堪/鏉ユ簮涓庡姩鏈?瑙ｆ硶鍊欓€夛紱鏉＄洰琛?`### 瑙ｆ硶 N锝滄爣棰橈綔姒傜巼X锝滅姸鎬乊`锛沜ompose/parse 鍙屽悜鏃犳崯锛堣浆涔?`\`銆乣锝渀銆佹崲琛岋級 | `:906-942` `:943-956` `:6159-6173` | `Problems/<id>.md` | 鈥?| `vibe_math_add_problem` | 閲嶅悕 `{ok:false}` `:5115` |
⟪编码损坏⟫ | E2 | 鍛介鍗?| 閿氱偣鍚?姒傜巼/浠峰€煎叧閿€?鏉ユ簮闂/鏉ユ簮鏂瑰悜/渚濊禆锛涜瘉鏄?璇佷吉涓や釜 `###` 鏉＄洰鍖猴紱鎸夊垎绫诲瓙鐩綍瀛?| `:959-999` `:1000-1015` `:1087` | `Propos/<鍒嗙被>/<id>.md` | 鈥?| `vibe_math_add_proposition` `list_propositions` | `PROPOSITION_ID_EXISTS` `:2711-2720` |
⟪编码损坏⟫ | E3 | 鐮旂┒鏃ュ織 | 姣忔柟鍚戜竴涓枃浠讹紙浠ｇ悊鐩村啓锛夛紜姣忛棶棰樹竴涓仛鍚堢储寮曪紙璋冨害鍣ㄧ敓鎴愶級锛嬮噸娲剧敓鏃舵棫鏂瑰悜鏁存褰掓。杩涚储寮曞ご閮?| `:1096-1165` `:1204` `:1184-1202` | `Progress/<qid>/<dir>.md`锛媊Progress/<qid>.md`锛媊State/directions.json`锛媊State/archived_journals.json` | 鈥?| 鈥?| 鏃?|
⟪编码损坏⟫ | E4 | Verified 鍗★紙缁濆鍙俊锛?| 鍙湪瀹氳鏃剁敱璋冨害鍣ㄥ啓锛涘唴瀹癸紳闄堣堪锛嬪叏閮?prob=1 鐨勮瘉鏄?璇佷吉/瑙ｆ硶鍏ㄦ枃锛嬬粨璁猴紜鏃堕棿锛嬫潵婧愶紱骞傜瓑锛堟瘮杈冩椂鍓旈櫎鏃堕棿琛岋級 | `:1060-1080` `:2089-2131` | `Verified/{鍛介,闂}/<id>.md` | 鈥?| 鈥?| 鏃?|
⟪编码损坏⟫ | E5 | 閿氱偣鎵弿绱㈠紩 | 鍚姩/鍐欑洏鍚庨噸鎵笁搴擄紙Problems/Propos/Methods锛夛紜鏂瑰悜鐘舵€侊紝閲嶅缓 `State/index.json`锛泃ick 閲岃妭娴?5s | `:1205-1214` `:1215-1259` `:2039` | `State/index.json` | `indexAutoRebuild`(true) | `vibe_math_index` | 鏃?|
⟪编码损坏⟫ | E6 | 渚濊禆璇箟 | 渚濊禆鏈弧瓒斥啋`绛夊緟渚濊禆` 涓嶆淳瑙ｏ紱婊¤冻鈫掑洖 `姹傝В涓璥锛沗琚緷璧朻 鑷姩鍙嶅～锛沗never` 瑙嗕负宸叉弧瓒筹紙闃叉閿侊級锛涙湭鐭ヤ緷璧栦繚瀹堣涓烘弧瓒?| `:1263-1280` `:2163-2172` | 鍗￠敋鐐?| 鈥?| 鈥?| 鏃?|
⟪编码损坏⟫ | E7 | 鍚庣敓瀛愰棶棰樹笁瀵硅薄 | solver 鎶?`q_sub` 鈫?娉ㄥ唽 q_sub 闂锛嬨€屽垽鏂笅杩板懡棰樸€嶉棶棰橈紜`p-tmp` 涓存椂鍋囪锛堟鐜?0.5锛夛紝骞跺啓鍏ㄦ潵婧愪笌鍔ㄦ満/鍥炲～璁″垝锛涘悓闄堣堪鍘婚噸 | `:2741-2776` `:5312-5318` | Problems锛婸ropos | 鈥?| `sync_meta.sub_questions` | 鏃?|

⟪编码损坏⟫ ### F. 搂9 浜哄伐骞查锛忔眹鎶?
⟪编码损坏⟫ | # | 鏈哄埗 | 鍋氫粈涔?| 瀹炵幇澶?| 鐘舵€?鏁版嵁 | 鍙傛暟 | 宸ュ叿/鍛戒护 | 鎷掔粷鐮?|
|---|---|---|---|---|---|---|---|
⟪编码损坏⟫ | F1 | 鍐崇瓥闃熷垪 | pending 闃熷垪锛?*鍗曟Ы gate**锛涙柊闂ㄨ鐩栨椂鎶婃棫鍐崇瓥缁撴竻涓?`superseded`锛堥槻骞界伒寰呭喅锛夛紱tick 寮€澶存牎楠?gate 鏈夋晥鎬э紙鑷剤锛夛紱宸茶В鍐充繚鐣?50 鏉?| `:1926-1963` `:2009-2017` | `State/decision_queue.json` | `mode` | `list_decisions` | 涓や釜 `VIBE_MATH_DECISION_*` |
⟪编码损坏⟫ | F2 | 鍐崇瓥鎵ц鍣?| 鍥涚被鍓綔锛歴pawn锛堟嫆鍒欐妸 explorer/solver 鐩爣鏂瑰悜鏍囨璺苟鐣欏師鍥狅級銆乿erdict锛堝彲 override 1/0锛夈€乸lan锛坅pprove 鍏ラ槦/鎷掔粷娓呯┖锛夈€乵ethod-promote | `:1964-1993` | 鈥?| 鈥?| `vibe_math_decide` | 鍚屼笂 |
⟪编码损坏⟫ | F3 | 妯″紡鍒囧洖鑷姩鏀捐 | `set_mode auto` 鈫?閫愭潯鎵ц鎵€鏈?pending锛堝惈 plan/verdict/spawn/method-promote锛夛紱鍗曟潯鍓綔鐢ㄥけ璐ヤ篃钀界粓鎬佸苟璁版棩蹇楋紙闃叉案涔呭崱姝伙級 | `:4973-4992` `:5110` | 鈥?| `mode` | `vibe_math_set_mode` `/vibe mode` | 鏃?|
⟪编码损坏⟫ | F4 | 杩涘害姹囨姤 | 涓夎矾锛歚Progress_Logs/report.json`銆佷汉璇?`Logs/鎶ュ憡.md`锛堣鏂囧紡锛屽惈闂琛?褰㈠紡鍖栨/鏈€杩戞椿鍔級銆乸ush 鍒版牴浼氳瘽锛坄rootAgent.followup`锛夛紱浜嬩欢椹卞姩锛媊reportIntervalMs` | `:1456-1544` `:1486-1522` `:1523-1544` | 涓や釜鎶ュ憡鏂囦欢 | `reportIntervalMs`(0) `reportMode`(file) | `vibe_math_report` | 鏃?|
⟪编码损坏⟫ | F5 | 鐘舵€侀潰 | status锛濊繍琛?椤圭洰/璁℃暟/鍦ㄥ唽/闃熷垪/planner 澶辫触鏁?褰㈠紡鍖栨憳瑕?鏈€杩戞椿鍔?params/fieldScopes锛堝尯鍒?durable vs session锛?| `:4996-5024` | 鈥?| 鈥?| `vibe_math_status` | 鏃?|

⟪编码损坏⟫ ### G. 搂10 鍙傛暟锛徛?2 鎻愮ず璇嶏紡搂13 骞跺彂锛忓伐鍏烽潰

⟪编码损坏⟫ | # | 鏈哄埗 | 鍋氫粈涔?| 瀹炵幇澶?| 鐘舵€?鏁版嵁 | 鍙傛暟 | 宸ュ叿/鍛戒护 | 鎷掔粷鐮?|
|---|---|---|---|---|---|---|---|
⟪编码损坏⟫ | G1 | 鍙傛暟浣撶郴 | 64 鏉?`PARAM_SCHEMA`锛堝悕瀛?绫诲瀷/鏋氫妇/鎻忚堪锛夐┍鍔ㄥ伐鍏?schema锛沗DEFAULT_PARAMS` 涓洪粯璁わ紱`sanitizeParams` 閫愰敭鍒ゅ瀷銆侀潪娉曞€?*闈欓粯鍥為€€榛樿**锛汮SONC 璁剧疆鏂囦欢椤圭洰绾р啋鍏ㄥ眬鍥為€€锛涘洓涓伐鍏风淮鎶?| `:12-78` `:81` `:84-113` `:369-439` `:787-832` `:833-875` | `vibe_math_setting.json` | 鍏?63 閿?| `set_params/setup/save_settings/template` | 鏃狅紙鍥為€€鑰岄潪鎷掔粷锛?|
⟪编码损坏⟫ | G2 | 鐭ヨ瘑涓婁笅鏂囷紙6 娈碉級 | 鎸夎鑹茬粍鍚堬細鈶犲彲淇″垎灞?鈶″璞℃ā鍨?鈶㈢洰褰曡亴璐?鈶ｈ緭鍑鸿川閲?寮曠敤/JSON 杈撳嚭濂戠害 鈶ゆ柟娉曞簱浣跨敤瑙勫垯 鈶ュ啓 md 宸ヤ綔娴侊紙claim/release/sync_meta/鍒嗙被涓€鑷存€?__writes 鍥為€€锛夛紜瑙掕壊褰掑睘鏂囦欢 | `:1680-1742` | 鈥?| `knowledgeContext` 闈炵┖鍒欐暣浣撹鐩?| 鈥?| 鏃?|
⟪编码损坏⟫ | G3 | 鑳藉姏涓庡伐鍏疯繃婊?| 鏉冮檺澹版槑鏂囨湰锛嬬湡瀹?`toolFilter`锛坅llow/deny/缃戠粶/鑴氭湰锛夛紱瀹夸富鎷掔粷鏈敞鍐屽悕瀛楁椂**鍙繚鐣欏凡娉ㄥ唽鍚嶉噸璇曚竴娆?*锛岃嫢 deny 鍏ㄥけ鏁堝垯**鎷掓淳**锛坒ail-closed锛?| `:1743-1768` `:1582-1595` `:6267-6284` `:1615-1634` | child `toolFilter` | `solverToolAllow/Deny` `verifierToolAllow/Deny` `*AllowNetwork` `*AllowScripts` `*MaxToolCalls` | 鈥?| 瀹夸富閿欒鍘熸牱鎶涘嚭 |
⟪编码损坏⟫ | G4 | 瑙掕壊鎻愮ず璇?| 7 绫伙細explorer/rederive/solver/verifierReview/verifierDebate/planner/methodKeeper锛涘姩鎬佹锛坢ath 鍙敤鎬с€乫ormal 妗ｄ綅涓庡璞＄姸鎬侊級**鍦ㄦ瀯閫犳彁绀鸿瘝閭ｄ竴鍒荤幇绠?*锛涙柟娉曠储寮曞彧娉ㄥ叆鍓?20 鏉?| `:1777-1919` `:3168-3280` `:780-786` `:1769-1776` | 鈥?| 5 涓?persona | 鈥?| 鏃?|
⟪编码损坏⟫ | G5 | 瀛愪唬鐞嗘淳鍙戯紡缁疆锛忎腑鏂?| `startContinuable`锛堝甫 toolFilter锛夆啋鐧昏 registry锛涚画杞敤 `sendMessage`锛涗腑鏂け璐ョ粰 code+next锛沜hildOwner 寮曠敤+5min 瀹介檺鍥炴敹 | `:1596-1676` `:303-334` `:4867-4895` | `agentRegistry` `childOwner` | `provider/model` | `list_agents` `message_agent` `interrupt_agent` | `VIBE_MATH_CHILD_NOT_FOUND` `VIBE_MATH_INTERRUPT_FAILED` `VIBE_MATH_INVALID_ARGUMENT` |
⟪编码损坏⟫ | G6 | 鏂囦欢鍐欓攣锛堝崗璁粏鑺傦級 | 閿紳椤圭洰鍐呯浉瀵硅矾寰勶紙璺ㄤ細璇濆叡浜級锛沜laim锛氱┖鐩爣鎷掋€佷粬浜烘寔閿佷笖鍦ㄧ绾﹀唴鈫抈{ok:false,busy}`銆佸惁鍒欑櫥璁板苟纭繚鐖剁洰褰曘€佽繑鍥炴樉绀鸿矾寰?hint锛況elease锛氶潪鏈汉涓嶈兘閲婃斁锛汿TL 榛樿 60s锛屾寔鏈夎€呮椿鐫€姣?250ms 缁锛堢敤鎺?1/4 鍗崇画锛夛紝鎸佹湁鑰呮秷澶卞垯鑷劧杩囨湡锛涘瓙浠ｇ悊缁撴潫**鑷姩閲婃斁**鍏跺叏閮ㄩ攣 | `:5181-5230` `:323` `:415` `:4868-4870` `:5196-5204` | `fileOwner`锛?*杩涚▼绾у唴瀛?*锛屼笉钀界洏锛?| `fileLockTimeoutMs`(60000锛屼絾**涓嶅湪 set_params 閿泦**閲岋紝鍙兘鏀硅缃枃浠? | `claim_write` `release_write` `lock_status` | 鏃?code锛坄busy`锛嬩腑鏂?message锛?|
⟪编码损坏⟫ | G7 | 杞婚噺鍏冩暟鎹悓姝?| 涓夌 kind锛歚directions`锛堟柟鍚戦泦/瀛樻椿鐜囷紝閲嶇疆 explorerRetries锛屽綊妗ｆ棫 journal锛夈€乣solver`锛堝瓨娲荤巼/鐘舵€?姝昏矾鍘熷洜/杞锛涜揪 `solverMaxRounds` 寮哄埗姝昏矾锛涘紩鐞嗗缓鍗★紱瑙ｆ硶鐧昏锛涘瓙闂涓夊璞★級銆乣methods`锛坲sed/created/improvements锛?| `:5232-5354` `:2601-2631` `:2864-2871` | 绱㈠紩/鐘舵€?鏂规硶鍗?| `solverMaxRounds` | `sync_meta` | `{ok:false,message:'unknown meta kind'}` |
⟪编码损坏⟫ | G8 | 宸ュ叿闈?| 36 涓伐鍏峰悕锛?*涓ゅ眰娉ㄥ唽**锛氫細璇濆眰 `handlers[name]=fn`锛嬪簲鐢ㄥ眰 `tools.register` 鎸?handlerName 璺敱鍥炰細璇濓紱鎻忚堪鍞竴鏉ユ簮 `TOOL_DESC`锛沗math_computation` 鐢卞叡浜ā鍧楁敞鍐?| `:5094-5167` `:5449-5507` `:5996-6035` | 鈥?| 鈥?| 36 涓?| 瑙佸悇宸ュ叿 |
⟪编码损坏⟫ | G9 | `/vibe` 鍛戒护 | 鍗曞懡浠?30 瀛愬懡浠わ紙start/resume/pause/abort/status/report/mode/setup/save/template/add/add-proposition/list-propositions/methods/index/plan/lock/project/decisions/agents/paper鈥︼級 | `:5372-5399` `:5510-5528` | 鈥?| 鈥?| `/vibe` | 鏈煡瀛愬懡浠も啋usage |
⟪编码损坏⟫ | G10 | math_computation | 鍏变韩 verbatim 妯″潡锛? 鍙傛暟鍐荤粨锛涙帰娴嬬紦瀛?15min TTL锛屾彁绀鸿瘝鍙缂撳瓨锛涘洖鎵ц惤 `Computation/<id>/` | `:5100-5103` `:5507` `:658-786` | `Computation/` | `mathComputation/Mode/Engines/TimeoutMs/Packages/InstallScope` | `math_computation` | 妯″潡鍐?`MATH_*`锛廯REFUSED{reason:policy}` |
⟪编码损坏⟫ | G11 | 绱㈠紩/鍐欑洏瀹归敊 | 宸插瓨鍦ㄤ絾涓嶅彲瑙ｆ瀽鐨?JSON鈫?*鎷掔粷瑕嗗啓**骞跺憡璀︼紙闃查潤榛樻竻绌猴級锛沵d 閫愭枃浠?try/catch锛屽潖鍗¤烦杩囦笉褰卞搷鍏朵綑 | `:559-571` `:1224/1234/1243` | `suspectFiles` | 鈥?| 鈥?| 鏃?|
⟪编码损坏⟫ | G12 | 鏃ュ織杞浆锛埪?3 澹扮О锛?| "鏂囦欢杩囧ぇ鈫掔爺绌舵棩蹇楄疆杞?`*.1.md`锛嬬画鍐欎綅缃寚閽? | **鏈牳鍒板疄鐜?*锛坓rep `杞浆`/`rotate`/`\.1\.md` 鏃犲懡涓級 | 鈥?| 鈥?| 鈥?| 鈥?|

⟪编码损坏⟫ ## 2. 閫愭潯"vmu 鑳藉惁琛ㄨ揪"鍒ゅ畾锛堢 2 姝ワ級

⟪编码损坏⟫ 鍒ゅ畾鐮侊細**鈶犵函鏁版嵁 pack** 锝?**鈶2 浠ｇ爜妯″潡** 锝?**鈶3 鑴氭湰** 锝?**鈶4 鎻掍欢/鎵╁睍** 锝?**鈶よ閰嶅眰娉ㄥ叆** 锝?**鈶ュ唴鏍搁渶鍔犲叿鍚嶈兘鍔?*銆?"瀛橀噺"锛濇鏋跺凡鏈夎鏈哄埗锛屽彧闇€澹版槑/瑁呴厤锛屼笉闇€鏂颁唬鐮併€?
### 2.1 先给 vmu 侧已核实的扩展面（含与任务书基线的差异）

| 闈?| 浜嬪疄 | 璇佹嵁 |
|---|---|---|
⟪编码损坏⟫ | pack manifest 鑳藉０鏄庝粈涔?| `id/version/packContractVersion/description/requires/codes/slots/tracks/rules/middleware/prompts/promptPolicies/aliases/settings`锛?*娌℃湁 tools銆佹病鏈?services**锛夛紱apply 鍘熷瓙銆佸彲 unload 鍥炴粴 | `kernel/pack.js:97-146` `:345-352` `:479-583` `:596-603`锛沗packs/v3-core/index.js:20-142` |
⟪编码损坏⟫ | M2 妯″潡鑳芥嬁鍒颁粈涔?| 鍐荤粨 api锛漙log/setting/kernel/dryRun/traceId/hook/services`锛沗services.get` 闇€ **`trigger-workflow` 鑳藉姏**锛涜兘鍔涙竻鍗?12 椤癸紱閽╁瓙蹇呴』宸叉敞鍐岋紱澶辫触绛栫暐 open/closed/abort锛嬬啍鏂?| `kernel/loader.js:32-35` `:120-146`锛沗kernel/bus.js:24-27` |
⟪编码损坏⟫ | **M2 鑳?reach 鐨勬湇鍔＄洰褰曪紙鍏抽敭绾︽潫锛?* | **鍥哄畾 15 椤?*锛歚tasks/meetings/chat/mailbox/panel/minutes/ballotbox/members/commitlog/library/records/human/budget/activity/metrics`銆?*涓嶅惈** `store`銆乣scheduler`銆乣turn`銆乣control`銆乣work`銆乣idempotency`銆乣lean` | `kernel/index.js:1416-1428` |
⟪编码损坏⟫ | `control/heartbeat` | 鍐呮牳纭疄 emit锛岃繑鍥炲€间緵涓棿浠惰鏁帮紙`middleware: decisions.length`锛夛紱**浣?beat 娌℃湁瀹氭椂鍣?*锛屽敮涓€璋冪敤鑰呮槸 `vibe_vmu_control{action:'beat'}`锛涗笖 `beat()` 鍙湪鏈変簨浠舵椂琚皟 | `kernel/index.js:2061-2078` `:2062-2067`锛沗tools/control.js:36` |
⟪编码损坏⟫ | `turn/reply-parsed` | blockable鉁?**rewritable 澹版槑浜嗕絾璇ョ偣鍙 `ok===false`锛屼笉娑堣垂 rewrite**锛沺ayload锛漙{turn,member,phase,fields,reply}`锛沗rewriteResult` 鍏ㄤ粨**闆舵秷璐圭偣** | `kernel/bus.js:81`锛沗kernel/turn/index.js:882-887`锛沢rep `rewriteResult` 鈬?浠?bus/rules 澹版槑 |
⟪编码损坏⟫ | 鍥炲瀛楁鐩綍 | 25 涓瓧娈电殑 **owner 琛ㄦ槸甯搁噺**锛宍resolveOwners` 鍙兘缁欏凡鏈夊瓧娈垫崲 face/op锛?*涓嶈兘鏂板瀛楁**锛沗vmu.turn.replyCatalogue` 鏄缃?| `kernel/turn/index.js:30-57` `:130` `:453-464` |
⟪编码损坏⟫ | 璋冨害鍣?| `every()/once()/tick()/arm()`锛沗maxRecurrences`/`minIntervalMs`/`timeSource`/`triggerVia`/`triggers` 绉嶅瓙锛?*timer 鏄敞鍏ユ帴缂濓紝鏃犳帴缂濓紳tick-only**锛?*鍐呮牳涓嶈嚜鍔?arm** | `kernel/scheduler.js:9-11` `:52-71` `:330-398` `:465-475`锛沗docs/10:156-175`锛?澹版槑鈮犱細璺?锛?|
⟪编码损坏⟫ | **鍏抽敭锛氳閰嶅眰娌℃湁娉ㄥ叆 timer** | `createKernel({...})` 鏃?`timer` 閫夐」锛涘叏瑁呴厤鏂囦欢鏃?`setInterval`锛沗kernel.report.tick` 鍙寕鍦?`agent/turn-stopping` 涓?鈬?**vmu 浠婂ぉ娌℃湁浠讳綍澧欓挓鍛ㄦ湡婧?* | `vibe-math-vmu.js:486-525` `:732`锛沗host-spawn.js` 鍙湁瀛愯繘绋嬮绠楀畾鏃跺櫒 |
⟪编码损坏⟫ | `store.patch(key,fn)` | 瀛樺湪锛屾姌椤靛唴鍑芥暟寮忓彉鏇达紜涓茶鍐欙紜version | `kernel/store.js:118` `:236` `:256-270` |
⟪编码损坏⟫ | **浣嗘ā鍧楁嬁涓嶅埌 store** | `vmu.store` 涓嶅湪鏈嶅姟鐩綍锛沗kernel.read()` 鍙 | `kernel/index.js:1434` `:1416-1428`锛沗kernel/store.js:32-60`锛圥UBLIC_KEYS 鍥哄畾锛屾湭澹版槑閿?`patch` 鍏峰悕鎷掞級 |
⟪编码损坏⟫ | library 淇 | `<id>@<rev>.md`锛屾鏁存暟銆佸崟璋冦€佷笉澶嶇敤锛沗storeMode` `full/diff`锛涢珮姘翠綅鏂囦欢锛沗commitRevision/revision/revisions` | `kernel/library.js:270-290` `:613-704` `:104` |
⟪编码损坏⟫ | library 璁板綍 | 澶?7 瀛楁鍥哄畾锛坄id/kind/title/fingerprint/status/owner/updatedAt`锛夛紱姝ｆ枃鑷敱锛沗append/record(member,track,text)/list/expand/search`锛?2KB 姝ｆ枃涓婇檺锛泃rash/permanent/retention | `kernel/library.js:26` `:29-32` `:242-257` `:412-435` `:438-454` `:462` |
⟪编码损坏⟫ | ballot tally 娉ㄥ叆 | `createBallot({tally})` 娉ㄥ叆锛沗instantRunoffTally` 宸插瓨鍦紱**涓棿浠跺彲鍦?`ballot/tally` 杩斿洖 `{tally}` 瑕嗙洊** | `kernel/ballot.js:67` `:99` `:203-211` `:475-483` |
⟪编码损坏⟫ | `turn/reply-parsed` 鐨勭敤澶?| 鍙湪**娲惧彂鍓?*鐪嬪埌 `reply` 鍘熸枃瀵硅薄锛坴3 鐨?`meta.kind` 濂戠害鍙互鍦ㄨ繖閲岃瑙ｆ瀽涓庤惤搴擄級锛屽彲 deny锛堝叿鍚嶏級 | 鍚屼笂 |
⟪编码损坏⟫ | 浜哄伐闂?| `vmu.human.gatedActions`锛堥檺瀹?鏈嶅姟鐨勶拷锟芥柟娉?鍚嶏級缁?`withOffice` 鍖呰９锛歡ated 鍔ㄤ綔**鎺掗槦鑰岄潪鎵ц**锛沘pproval 鏈?`approvalTimeoutMs/onTimeout=hold`锛沗human/gate-pending` 鍙樆鏂?| `kernel/human.js:60-84` `:126` `:206-266` `:293-330` |
⟪编码损坏⟫ | 骞傜瓑 | 璇锋眰绾ф寚绾硅处鏈紙scope+key銆佺被鍨嬫爣娉ㄧ紪鐮併€佹寔涔呮姇褰憋級锛涙柟娉?`begin/commit/abort/lookup/list` | `kernel/idempotency.js:1-36` `:623-779`锛?*涓嶅湪妯″潡鏈嶅姟鐩綍** |
⟪编码损坏⟫ | 鍦ㄩ璐︽湰 | `work.start/settle/interrupt/recover/list`锛屽啓缁?`store.patch`锛涢噸鍚妸娈嬬暀鏍?interrupted | `kernel/work.js:1-16` `:67-155` |
⟪编码损坏⟫ | Lean | 瀹屾暣闈細`vmu.math.formalVerify/lean*` 閿紱浣滀笟鐘舵€佹満 queued/running/settled/failed/timeout/interrupted锛沗Formal/Jobs` 闀滃儚锛涘綊妗?kinds `def/lemma/theorem/assumption`锛涙仮澶?鍙栨秷/dispose锛沗lean/job-*` 閽╁瓙 | `kernel/lean.js:52-92` `:119` `:534-560` `:655-758` `:846` |
| 蹇犲疄鎬?C-45 | defect 鐧昏 + 寮哄埗寮冩潈 0.5 + `Formal/Defects/<target>.json` 鑰愪箙鏍囪 | `kernel/fidelity.js:30-32` `:44` `:79-119` |
⟪编码损坏⟫ | 璁烘枃 | `start/contribute/revise/finalize/consult`锛沠ormat/language/finalizer/consult 闂紱`vmu.paper.maxRounds` | `kernel/paper.js:31-94` `:333-570` |
⟪编码损坏⟫ | 鎻愮ず璇?| 娈靛尯闂达紙facts 0-199 鍐呮牳鐙崰 / charter 200-399 / contract 400-599 / **pack 600-899** / override 900-9999锛夛紱`prompt/section-assembled` 鍙樆鏂?鏀瑰啓涓?*鐪熺殑娑堣垂 `appendPrompt`**锛沺ack `promptPolicies` 鏈夋秷璐硅€咃紱pack 杩樺彲鐢?*绾暟鎹?* `prompts/sections.json` 鍦ㄥ缓鍐呮牳鍓嶈础鐚/缁?| `kernel/prompt/index.js:24-30` `:50` `:308-395` `:568`锛沗kernel/pack.js:552-566`锛沗vibe-math-vmu.js:477` `:464-476` `:996-1010`锛沗packs/example-data/` |
⟪编码损坏⟫ | 鍒悕 | `registry.alias(from,to)`锛氱洰鏍囧繀椤绘槸**宸插彂甯冩湇鍔?*锛涗笉浜х敓宸ュ叿闈紱鍏ㄤ粨鍙湁 `registry.get()` 娑堣垂鍒悕 | `kernel/registry.js:29` `:93-104` `:130`锛沢rep `registry.resolve` 鈬?0 澶勫伐鍏锋秷璐?|
⟪编码损坏⟫ | M3 鑴氭湰 | 闇€鍦?*瑁呴厤閰嶇疆** `config.scripts[]` 澹版槑锛坕d/file/timeoutMs/cwd/env锛夛紱宸ュ叿 `vibe_vmu_script{action:list|run,id,args}`锛涚湡瀛愯繘绋嬶紱缁撴灉鍙洖璋冪敤鏂广€佺粷涓嶈繘鎻愮ず璇嶏紱鑴氭湰蹇呴』鎵撳嵃鍚?`ok` 鐨?JSON | `host.js:181-183` `:736-790`锛沗kernel/script-bridge.js:33-52` `:73-88` |
⟪编码损坏⟫ | 鎵嬫湳绾у涓婚挬 | 妗ユ帴 14 涓紱`tools/pre-execute` 鏀寔 deny/cancel/ask锛?*rewriteArgs 鍏峰悕鎷?*锛夛紱`tools/post-execute` 鏀寔 `replaceResult`/block锛涘叾浣欐ˉ鎺ラ挬瀛?*鍙瀵?*锛坧rompt/assemble 鏃犳硶鏀癸級 | `host-hooks.js:48-74` `:82-202`锛沗kernel/bus.js:267-285` |

### 2.2 判定总表

⟪编码损坏⟫ | # | 鏈哄埗 | 鍒ゅ畾 | vmu 鍏蜂綋鎵╁睍闈紙璇佹嵁锛?| 缂哄彛锛忔€庝箞琛?|
|---|---|---|---|---|
⟪编码损坏⟫ | A1 | 浼氳瘽闅旂 | **鈶ゅ瓨閲?* | 姣忎釜鎻掍欢 apply 寤轰竴涓?kernel锛坄vibe-math-vmu.js:136,486`锛夛紝鐘舵€佸叏鍦ㄩ棴鍖咃紱瀹夸富鎸変細璇濇寕 preset | 鏃?|
⟪编码损坏⟫ | A2 | 杩涚▼绾厓 | **鈶?鈶?* | `vmu.work.recover()` 鎶婇噸鍚畫鐣欐爣 interrupted锛坄work.js:135`锛夛紱`vmu.resume` 闈㈠仛鎭㈠锛?epoch 鐩哥瓑"鏃犲搴旀蹇?| "鏈繘绋嬪啓鐨勭姸鎬?鍒ゆ嵁闇€涓€涓?durable key 鎴?records 瀛楁锛涒懃 鎴栬惤杩?tracks |
⟪编码损坏⟫ | A3 | **tick 寰幆锛堝懆鏈熼┍鍔級** | **鈶ワ紙涓伙級锛嬧憽锛堜綋锛?* | 浣擄細閽╁瓙椹卞姩妯″潡锛坄agent/turn-stopping`銆乣subagent/end`銆乣tools/*`锛夛紱椹卞姩锛歚scheduler` 鏈?`every/tick/arm`锛坄scheduler.js:330-398,465`锛変絾**瑁呴厤娌℃敞鍏?timer**锛宍beat` 鏃犲畾鏃跺櫒 | 缂?*鍏峰悕鍛ㄦ湡椹卞姩**锛氣懁 瑁呴厤 `createKernel({timer})`锛嬩竴琛?`arm()`锛坄docs/10:160` 宸插啓鏀瑰垽鏉′欢锛夛紝鎴?鈶?鍐呮牳 `autoArm/startClock` 骞惰嚜鏇?|
⟪编码损坏⟫ | A4 | start/resume/pause/abort | **鈶?鈶?* | `vmu.control` 鏈?pause/resume/stop锛坄index.js:2036-2060`锛変絾**涓嶅湪妯″潡鏈嶅姟鐩綍**锛涘伐鍏峰悕瑕佹柊寤?| 鈶?鍔?4 涓伐鍏峰悕锛涙垨 鈶?鎶?`vmu.control` 寮€缁欐ā鍧?|
⟪编码损坏⟫ | A5 | 缁堟鍒ゅ畾 | **鈶?* | 鏉′欢鍙粠 `tasks.list/records.list/metrics` 绠楀嚭锛堥兘鍦ㄧ洰褰曗湏锛夛紝浣?*"鍋滄満"瑕?`control.pause`锛屾ā鍧椾笉鍙揪** | 鈶?鏈嶅姟鐩綍鍔?`vmu.control`锛堟垨缁欎竴涓?`stop-institute` 鑳藉姏锛?|
⟪编码损坏⟫ | A6 | 椤圭洰閿?| **鈶?* | `vmu.store.lock`锛坄vmu.store.lock.timeoutMs/retries`锛夋槸**鎶橀〉**閿侊紝涓嶆槸"椤圭洰鏍?閿侊紱vmu 鍙湁**涓€涓?root**锛屾棤 `Projects/<slug>` 澶氱鎴?| 鈶?"澶氶」鐩?瀛愬伐浣滃尯"鍏峰悕鑳藉姏锛堟垨 鈶?鎻掍欢鐢?fs 鑷锛夈€傝繖鏄粨鏋勬€у樊寮傦紝涓嶆槸閰嶇疆闂 |
⟪编码损坏⟫ | A7 | 鐘舵€佹彁浜ゅ崗璁?| **鈶犲瓨閲?* | store 鑷甫 tmp+rename 鍘熷瓙鍐欎笌 version/migrator锛坄store.js:146,197-218,236-248`锛?| 鏃?|
⟪编码损坏⟫ | A8 | 娲诲姩鏃ュ織 | **鈶犲瓨閲?* | `vmu.panel.historyCap`/`vmu.metrics`/`vmu.audit`/`vmu.chat.historyCap` | 鏃?|
⟪编码损坏⟫ | A9 | 鏂偣缁窇 | **鈶?鈶″瓨閲?* | `vmu.resume`锛?0 闈㈡姇褰憋級锛媊work.recover`锛婰ean `recover` | 鏃狅紙鎶曞奖娓呭崟闇€閮ㄧ讲澹版槑锛?|
⟪编码损坏⟫ | B1 | 鍙帹杩涘伐浣?| **鈶?* | 妯″潡璇?`tasks.list`锛媊records.list`锛堚湏鐩綍锛夌畻锛涗絾**娌℃湁椹卞姩瀹冪殑鏃堕挓** | 渚濊禆 A3 |
⟪编码损坏⟫ | B2 | 瑙勫垝绠€鎶?| **鈶?* | 妯″潡缁勮鏂囨湰 鈫?`prompt/section-assembled` 涓?`appendPrompt`锛?*鐪熻娑堣垂** `prompt/index.js:568`锛?| 鏃狅紙`append-prompt` 鑳藉姏锛?|
⟪编码损坏⟫ | B3 | **璋冪敤瑙勫垝浠ｇ悊** | **鈶ワ紙鎴栤懁锛?* | 瑕?璺戜竴娆℃垚鍛樺洖鍚?锛歚vmu.turn` 涓嶅湪妯″潡鐩綍锛沗vmu.members.wake` 鍦ㄧ洰褰曚絾闇€瑕佽閰嶇粰 `deliver`锛坄vibe-math-vmu.js:511`锛夛紱`turn.run` 鐢ㄧ殑 `deliverTurn` 鏄閰嶆帴缂濓紙`:412`锛?| 鈶?鐩綍鍔?`vmu.turn`锛堝苟缁?娲惧彂"鑳藉姏锛夛紱鎴?鈶?閮ㄧ讲鎻愪緵 `config.deliver` 骞跺彧璧?`members.wake` |
⟪编码损坏⟫ | B4 | 璁″垝鏍￠獙 | **鈶?* | 浠?`turn/reply-parsed` 鐨?`payload.reply` 鍙栬鍒掞紱闈炴硶鈫抈deny{code}`锛堝彲闃绘柇鉁擄級 | 鏃狅紙`read-args`锛媊deny`锛?|
⟪编码损坏⟫ | B5 | manual 璁″垝瀹℃壒闂?| **鈶?* | `vmu.human.openApproval/approvalState`锛堚湏鐩綍锛夛紜`human/gate-pending` 鍙樆鏂紱闃熷垪涓婇檺閿瓨鍦?| 璺ㄩ噸鍚殑"寰呮壒璁″垝"瑕?durable锛氣懃 鎴栬惤 tasks.brief锛堚湏鐩綍锛?|
⟪编码损坏⟫ | B6 | 寰呮墽琛岄槦鍒?| **鈶★紜鈶?* | 闃熷垪鍙惤 tasks/records锛?*璺?tick 娑堣垂闇€瑕?tick** | 渚濊禆 A3 |
⟪编码损坏⟫ | B7 | 璁″垝鍥炲啓鍗￠敋鐐?| **鈶?* | `vmu.records.put/list/expand`锛堚湏鐩綍锛夛紜library 璁板綍姝ｆ枃鑷敱锛泇3 寮忛敋鐐瑰彲鐢辨ā鍧?*鑷繁瑙ｆ瀽姝ｆ枃** | 鑻ヨ鐢ㄥご瀛楁鎺掑簭/杩囨护 鈬?鈶?澶村瓧娈靛彲澹版槑 |
⟪编码损坏⟫ | B8 | 瑙勫垝瀛︿範闂幆 | **鈶?鈶?* | `Logs/Plans/*` 鈫?library 璁板綍锛坄append`+`commitRevision`锛宍storeMode` 鍐冲畾 full/diff锛?| 鏃?|
⟪编码损坏⟫ | B9 | 澶辫触鍥為€€ | **鈶?* | 鍚屼竴妯″潡鍐?fallback 鍒嗘敮锛沗plannerFails` 璁℃暟钀?records | 鏃?|
⟪编码损坏⟫ | B10 | 纭害鏉?| **鈶★紜鈶?* | 骞跺彂锛歚members` 妲戒綅 capacity锛媊vmu.limits.maxLiveMembers`锛坄members.js:141-165`锛宍VMU_RESOURCE_BUDGET`锛夛紱渚濊禆锛歚tasks.deps/setDependencies`锛坄tasks.js:245`锛夛紱宸查獙璇佷笉鍐嶈皟搴︼細鈶★紱骞傜瓑锛歚vmu.idempotency` **涓嶅湪鐩綍**锛涙瘡瑙掕壊宸ュ叿榛戠櫧鍚嶅崟锛?*鏃犲０鏄庨潰**锛堝彧鏈?`vmu.limits.toolCallsPerTurnCap`锛宍host-hooks.js:137`锛?| 鈶?涓変欢锛歩dempotency/work 鍏ョ洰褰曘€乸er-slot tool policy 閿紜娑堣垂鐐?|
⟪编码损坏⟫ | B11 | 鍛介鏅嬪崌 | **鈶★紜鈶?* | 妯″潡 `records.put` 寤洪棶棰橈紜`tasks.create`锛涢槇鍊奸渶瑕?*鏂拌缃敭** | 鈶?鏂伴敭锛堟垨 pack 绉佹湁閿繀椤诲厛杩?schema锛宍docs/10:137-154` 鍏堜緥锛?|
⟪编码损坏⟫ | B12 | 浼樺厛绾ц皟鏁?| **鈶?* | 妯″潡閲嶇畻鍐欏洖 records 姝ｆ枃/澶?| 澶村瓧娈靛浐瀹?鈬?浼樺厛绾ц涔堣繘姝ｆ枃瑕佷箞 鈶?|
⟪编码损坏⟫ | C1 | 楠岃瘉鍊欓€?| **鈶?* | `records.list(filter kind/status)`锛嬫鏂囪В鏋?| 鏃?|
⟪编码损坏⟫ | C2 | 寤洪獙璇佷换鍔?| **鈶?* | `tasks.create`锛堚湏鐩綍锛夊幓閲嶏紱绁ㄦ暟涓嬮檺鐢?`vmu.ballot.minVotes`(鈶? | 鏃?|
⟪编码损坏⟫ | C3 | 鐙珛璇勫 | **鈶?鈶犲瓨閲?* | 璇勫鍊煎彲鐩存帴璧?`vmu.ballotbox.cast` 鐨?`estimate` 绁ㄧ锛坄ballot.js:38`锛夛紱`vmu.meetings` 鐨?`verdictMaxRounds` 浣滆疆闄?| 鏃?|
⟪编码损坏⟫ | C4 | 绁ㄦ暟涓嬮檺 | **鈶犲瓨閲?* | `vmu.ballot.minVotes`/`minVotesRatio`锛坰chema锛夛紱`v3-core` 宸茬敤 `ballot/tally` deny 瀹炵幇 quorum锛坄packs/v3-core/index.js:87-110`锛?| 鏃?|
⟪编码损坏⟫ | C5 | 杈╄ | **鈶?鈶?* | `vmu.meetings.verdictMaxRounds`(5)锛媊meeting/round-start` 鍙樆鏂紱璺ㄨ疆鍙戣█鐢?`vmu.turn` 椹卞姩锛堚懃锛?| 鈶?turn 鐩綍锛堝悓 B3锛?|
⟪编码损坏⟫ | C6 | 瑁佸喅绠楁硶 | **鈶犲瓨閲忥紜鈶?* | 鈶?`vmu.ballot.method/tieRule`锛涒憽 涓棿浠跺湪 `ballot/tally` 杩斿洖 `{tally}` 瑕嗙洊锛坄ballot.js:475-483`锛夛紝鎴栬閰嶆敞鍏?`instantRunoffTally`锛坄:99`锛?| 鏃狅紙v3 鐨?near-consensus/forced 鍧囧€煎啓鎴愭ā鍧楀嵆鍙級 |
⟪编码损坏⟫ | C7 | 瑁佸喅鍥炲啓 | **鈶?* | `records/library` 鍐欏懡棰?闂/Verified 杞紱`tasks.transition` 缁撶畻锛涜仈鍔ㄩ潬妯″潡閫昏緫 | Verified 鍙鎬?鈬?瑙?E4 |
⟪编码损坏⟫ | C8 | manual 瑁佸喅闂?| **鈶?* | `vmu.human` approvals锛媊human/gate-pending`锛涙垨 `ballotbox` 鑷韩鐨?quorum 鎷?| 鏃?|
⟪编码损坏⟫ | C9 | Lean 涓夋。 | **鈶犲瓨閲忥紜鈶?* | `vmu.math.formalVerify`锛坄lean.js:166`锛夋帶鍒舵彁绀轰笌涓诲姩鎬э紱`vmu.formal.requireArtifacts` 绛夛紙`formal.js:19`锛?| "鏃?passed/blocked 涓嶅緱瀹氳"杩欓亾**瑁佸畾闂?*娌℃湁鍐呮牳鐐?鈬?鈶?妯″潡鎸?`ballot/tally` 鎴?`settle/before`锛堝彲闃绘柇锛?|
⟪编码损坏⟫ | C10 | Lean 鍚屾杩愯 | **鈶犲瓨閲?* | 鍏ㄥ湪 `kernel/lean.js`锛堝懡浠?鍙傛暟/瓒呮椂/鎼滅储璺緞/杈撳嚭涓婇檺/浣滀笟鎸佷箙鍖栵級锛涘伐鍏烽潰鍦?`vibe_vmu_mathtools`/`vibe_vmu_mathjobs` | 鑻ュ繀椤诲彨 `vibe_math_lean_run` 鈬?鈶?鍔犲埆鍚嶅伐鍏峰悕 |
⟪编码损坏⟫ | C11 | Lean 寮傛闃熷垪 | **鈶犲瓨閲?* | `leanAsync`/`leanJobsMaxParallel`/`Formal/Jobs`/`recover`/`dispose`/`lean/job-*` 閽╁瓙 | 鏃?|
⟪编码损坏⟫ | C12 | Lean 褰掓。/澶嶇敤 | **鈶犲瓨閲忥紜鈶?* | `ARCHIVE_KINDS`锛媋rchive锛坄lean.js:88,846`锛夛紱"proof 閫氳繃鎵嶅啓 Verified/Lean 骞剁疆 passed"鏄?*绛栫暐** 鈬?鈶?妯″潡锛堜絾鍐?`.lean` 闇€瑕?fs锛屾ā鍧楁棤 fs锛?| 鈶?妯″潡鐢?fs 鎺ョ紳锛屾垨 鈶?鎻掍欢鍋氬綊妗ｇ瓥鐣?|
⟪编码损坏⟫ | C13 | defect 蹇犲疄鎬?| **鈶犲瓨閲忥紙鐧昏/寮冩潈锛夛紜鈶?鈶ｏ紙鎾よ瘉鏄庯級** | `kernel/fidelity.js` 鐧昏锛嬪己鍒跺純鏉?0.5锛?鍒犻櫎/瑕嗙洊褰掓。璇佹槑"瑕?fs锛?*M2 鏃?fs** | 鈶?鍙楁帶 fs 鎺ョ紳缁欐ā鍧楋紝鎴?鈶?鎻掍欢瀹炵幇鎾ゅ洖 |
⟪编码损坏⟫ | C14 | 褰㈠紡鍖栨姇褰?| **鈶★紙鍗＄墖/寰呭姙锛夛紜鈶ワ紙Index/Lean 鏂囦欢锛?* | 鍗＄墖杞?寰呭姙鍙敤 records锛沗Formal/Index.md` 閲嶅缓涓?`.lean` 鍐欏叆鏃犳ā鍧楁帴鍙?| 鈶?鎴?鈶?|
⟪编码损坏⟫ | C15 | 鏈€缁堣鏂?| **鈶犲瓨閲忥紜鈶?鈶?* | `kernel/paper.js` 鍏ㄦ祦绋嬶紱"娲炬挵鍐欏瓙浠ｇ悊"浠嶈 turn 鈬?鍚?B3锛汸DF 缂栬瘧瑕佸瓙杩涚▼ 鈬?鈶?鈶?| 鈶?turn 鐩綍锛涚紪璇戣蛋 鈶?鈶?|
⟪编码损坏⟫ | D1 | 鏂规硶鍗?| **鈶犲瓨閲?* | `KINDS.method`鈫抈Methods/`锛嬩换鎰?front-matter锛嬫鏂囷紱32KB 涓婇檺锛坴3 鏃犱笂闄愶紝闇€鐭ュ樊寮傦級 | 鏃?|
⟪编码损坏⟫ | D2 | 涓ょ骇搴?| **鈶?* | `createLibrary({root})` 涓€涓?root锛坄library.js:49-52`锛夛紱"椤圭洰鈫掑叏灞€"= 绗簩涓?root | 鈶?"绗簩搴撴牴/promote"鑳藉姏锛屾垨 鈶?鎻掍欢鑷缓 library |
⟪编码损坏⟫ | D3 | 搴旂敤璁板綍 | **鈶?* | 鍦?`turn/reply-parsed` 瑙ｆ瀽 `reply.methods_used` 鈫?`library.record(member,track,text)`锛堚湏鐩綍锛夋垨 `put` | 鏃?|
⟪编码损坏⟫ | D4 | 鍙戞槑涓婃姤 | **鈶?* | 鍚屼竴閽╁瓙锛沺ending 闃熷垪钀?records 杞紙閬垮厤 store 涓嶅湪鐩綍锛?| 鏃?|
⟪编码损坏⟫ | D5 | 鏁寸悊璋冨害 | **鈶★紜鈶?* | 璁℃暟鍙畻锛?鍒版湡"闇€瑕佹椂閽燂紙鎴栨寜 turn 璁℃暟锛?| 渚濊禆 A3锛坕nterval 璇箟锛夛紱浜嬩欢椹卞姩鍙厛鍋?|
⟪编码损坏⟫ | D6 | 鏁寸悊浜у嚭 | **鈶?* | `library.append`锛媊commitRevision`锛堚湏鐩綍锛?| 鏃?|
⟪编码损坏⟫ | D7 | 鍏ㄥ眬鏅嬪崌 | **鈶?* | 鍚?D2锛沗applications鈮?` 闃堝€奸渶鏂伴敭 | 鈶?涓や欢锛堢浜?root銆侀槇鍊奸敭锛?|
⟪编码损坏⟫ | D8 | 鍙俊搴︾孩绾?| **鈶?* | 妯″潡鏌ュ懡棰樼姸鎬佸悗杩囨护 `鍙俊鏂█` | 鏃?|
⟪编码损坏⟫ | E1 | 闂鍗?| **鈶犲瓨閲忥紜鈶?* | pack 澹版槑 track `problems`锛涙鏂囪嚜鐢憋紱v3 閿氱偣鐢辨ā鍧楄嚜瑙ｆ瀽 | 澶村瓧娈靛浐瀹?鈬?闇€瑕?鎸変紭鍏堢骇/鐘舵€佹帓搴?鏃?鈶?|
⟪编码损坏⟫ | E2 | 鍛介鍗?| **鈶犲瓨閲忥紜鈶?* | 鍚屼笂 track `propos`锛嬪垎绫伙紙`vmu.records.naming.slugPolicy`/`conflictSuffix`锛?| 鍚屼笂 |
⟪编码损坏⟫ | E3 | 鐮旂┒鏃ュ織 | **鈶犲瓨閲?* | `library.record(member,track,text)` 灏辨槸"鎸夛紙鎴愬憳,杞級杩藉姞涓€琛?锛坄library.js:421-435`锛夛紱鑱氬悎绱㈠紩鐢?鈶?鍐?| v3 鐨?姣忔柟鍚戜竴涓枃浠?鍙兘鏄犲皠鎴?姣忔柟鍚戜竴涓?track 鎴栦竴鏉¤褰?锛堢矑搴﹀樊寮傞渶璁帮級 |
⟪编码损坏⟫ | E4 | Verified 鍙鍓湰 | **鈶★紜鈶?鈶?* | 鍙缓 `verified` track锛涘簱鏈?`permanent` 鏍囪锛?*鍙槻鍒犻櫎**锛屼笉闃叉敼鍐欙紝`library.js:265`锛?| 鈶?"璁板綍涓嶅彲鍙?鏍囧織锛堟垨 鈶?guard 璺緞鎷掑啓锛岄渶鏍?`vmu.paths`/guard 绛栫暐锛?|
⟪编码损坏⟫ | E5 | 閿氱偣绱㈠紩 | **鈶犲瓨閲?* | `library.rebuildIndex/list`锛媊headListAt` 鎴柇璁℃暟锛坄library.js:438-453`锛?| 鏃?|
⟪编码损坏⟫ | E6 | 渚濊禆璇箟 | **鈶犲瓨閲?* | `tasks.create({deps})/setDependencies/transition`锛坄tasks.js:211,245,335`锛?| 鏃?|
⟪编码损坏⟫ | E7 | 瀛愰棶棰樹笁瀵硅薄 | **鈶?* | 妯″潡寤?3 鏉?`tasks`/`records`锛屽幓閲嶉潬 `list` | 鏃?|
⟪编码损坏⟫ | F1 | 鍐崇瓥闃熷垪 | **鈶犲瓨閲忥紜鈶?* | `vmu.human` approvals锛坬ueueCap/approvalTimeoutMs/onTimeout=hold锛夛紜鎶曞奖锛坄vmu.resume.projections`锛夛紱鍗曟Ы gate 璇箟锛濇ā鍧楅€昏緫 | 鏃?|
⟪编码损坏⟫ | F2 | 鍐崇瓥鎵ц鍣?| **鈶?* | 鍥涚被鎵ц钀藉埌鍚勯潰锛坱asks/library/human/ballotbox锛?| 娲惧彂绫讳緷璧?B3 |
⟪编码损坏⟫ | F3 | 鑷姩鏀捐 | **鈶?* | 妯″潡閬嶅巻 pending 鎵ц | 鏃?|
⟪编码损坏⟫ | F4 | 杩涘害姹囨姤 | **鈶犲瓨閲忥紜鈶?* | `vmu.report`锛坋nabled/reports/channels/recipients/minIntervalMs 澶归挸锛宍report.js:81-244`锛夛紱**鏃犲唴閮ㄥ畾鏃跺櫒**锛岃閰嶅彧鍦?turn-end 鎺ㄨ繘锛坄vibe-math-vmu.js:732`锛?| 澧欓挓鍛ㄦ湡 鈬?A3锛涘啓鏂囦欢鎶ュ憡鍙敤 library 璁板綍锛堚憽锛?|
⟪编码损坏⟫ | F5 | 鐘舵€侀潰 | **鈶犲瓨閲?* | `vibe_vmu_status`锛坄host.js:428-460`锛夛紜kernel.status | 鏃?|
⟪编码损坏⟫ | G1 | 鍙傛暟浣撶郴 | **鈶犲瓨閲忥紜鈶ワ紙鏂伴敭锛?* | 1232 鏉″０鏄庨敭锛婬OT 鍒嗙骇锛嬪埆鍚嶏紜`vibe_vmu_set`锛堟湭澹版槑閿叿鍚嶆嫆锛夛紱pack 绉佹湁閿繀椤昏繘 schema锛堝厛渚?`vmu.v3.*`锛宍docs/10:141-146`锛?| 鈶?鎶?v3 闇€瑕佷絾 vmu 娌℃湁鐨勯敭鐧昏杩?schema锛堢害 8鈥?2 涓紝瑙?搂3.7锛夛紱**涓嶅厑璁?*鍙０鏄庝笉璇?|
⟪编码损坏⟫ | G2 | 鐭ヨ瘑涓婁笅鏂?| **鈶?* | pack 鏂囨湰娈碉紙`prompts/*.js`锛媊sections.json`锛媊vmu.prompts.bindings`锛夛紝鍖洪棿 600-899 | 鏃?|
⟪编码损坏⟫ | G3 | 宸ュ叿杩囨护 | **鈶ｇ幇鍦紡鈶ュ０鏄庡紡** | v3 鐨?allow/deny/缃戠粶/鑴氭湰鍦?vmu **鏃犲０鏄庨潰**锛涘彧鏈?per-turn 璋冪敤涓婇檺锛坄host-hooks.js:137`锛夛紱`tools/pre-execute` 鍙?deny 浣嗛渶鎻掍欢鑷繁瀹炵幇绛栫暐 | 鈶?per-slot tool policy 閿紜娑堣垂鐐癸紙鎴?鈶?鎻掍欢鎸傚湪 pre-execute 涓婂疄鐜帮級 |
⟪编码损坏⟫ | G4 | 瑙掕壊鎻愮ず璇?| **鈶狅紜鈶?* | 闈欐€佹 鈶狅紱鎸夋。浣嶅垎鏀敤 pack `promptPolicies`锛坢anifest鈫抈onPromptPolicy`锛夋垨 `vmu.prompts.*`锛沗setting:` 鍙橀噺鍙敞鍏ユ椿鍊硷紙`prompt/index.js:50`锛?| 鏃狅紙娉ㄦ剰 pack 娈典笉寰楀崰 facts 鍖洪棿锛?|
⟪编码损坏⟫ | G5 | 瀛愪唬鐞嗘淳鍙?| **鈶ワ紡鈶?* | `members.wake` 闇€瑁呴厤 `deliver`锛沗turn.run` 涓嶅湪妯″潡鐩綍 | 鍚?B3 |
⟪编码损坏⟫ | G6 | 鏂囦欢鍐欓攣 | **鈶ｇ幇鍦紡鈶ュ０鏄庡紡** | 鏃?璺緞绉熺害"鍐呮牳鑳藉姏锛沗vmu.store.lock` 鍙鎶橀〉锛涙ā鍧楁棤 fs銆佹棤 store | 鈶?鍏峰悕"璺緞绉熺害"锛坈laim/release/status锛嬬绾︾画鏈燂紜鎸佹湁鑰呭瓨娲诲垽鎹級锛涙垨 鈶?鎻掍欢鐢?host fs 瀹炵幇 |
⟪编码损坏⟫ | G7 | sync_meta | **鈶?* | `turn/reply-parsed` 鍙?`reply.meta` 鈫?鍐?records/tasks锛堚湏鐩綍锛夛紱鍙?deny 浣嗕笉鑳?rewrite | 鏃?|
⟪编码损坏⟫ | G8 | 36 涓伐鍏峰悕 | **鈶わ紙姣忎釜鍚嶅瓧锛夛紡鈶ワ紙pack 鍙０鏄庡伐鍏烽潰锛?* | `host.js:84-138 TOOL_NAMES`锛媊toolSpecs` 鏄父閲忥紱pack manifest 鏃?tools 瀛楁锛涘埆鍚?*涓嶄骇鐢熷伐鍏烽潰**锛坄registry.js:130` 鏄敮涓€娑堣垂鑰咃級 | 鈶?璁?pack 澹版槑宸ュ叿闈紙鍚?schema/杞彂鍒版湇鍔★級锛屽惁鍒?鈶?鎵嬫敼 36 娆?|
⟪编码损坏⟫ | G9 | `/vibe` 鍛戒护 | **鈶?* | `commands.register` 鍦ㄨ閰?瀹夸富灞傦紱鍐呮牳鏃犲懡浠ゆ敞鍐岄潰 | 鈶?鎴?鈶?|
⟪编码损坏⟫ | G10 | math_computation | **鈶犲瓨閲?* | 鍏变韩妯″潡閫愬瓧鑺傜浉鍚岋紱`vmu.math.*` 閿紱`kernel/mathtools/mathjobs`锛媊vibe_vmu_mathtools/mathjobs`锛況egistry 鍚嶅瓧淇濈暀 `math_computation`锛坄index.js:1540`锛?| 鏃?|
⟪编码损坏⟫ | G11 | 瀹归敊瀹堝崼 | **鈶犲瓨閲?* | store 鐨?corrupt 鎷掑啓锛媗ibrary 閫愭枃浠跺閿欙紜`vmu.records.truncateMode` | 鏃?|
| G12 | 鏃ュ織杞浆 | **鏈牳鍒?v3 瀹炵幇** | 鈥?| v3 鏈疄鐜?鈬?澶嶅埢鏃舵寜"鏇翠紭浣嗕笉蹇呴』"澶勭悊 |

## 3. 澶嶅埢鏂藉伐鍥鹃鏋讹紙绗?3 姝ワ級

⟪编码损坏⟫ > 褰㈡€佹爮鐢?鈶犫€撯懃锛?钀界偣"锛濇枃浠讹紱"鏂█"锛濆彲鍐欐垚闂ㄧ鐨勫垽鎹紙涓嶆槸"鐪嬬潃瀵?锛夈€?
⟪编码损坏⟫ ### P0锛堢己浜嗗氨涓嶆槸 v3锛?
| # | 鏉＄洰 | 褰㈡€?| 钀界偣 | 璁剧疆閿?| 鏂█ |
|---|---|---|---|---|---|
⟪编码损坏⟫ | P0-1 | **鍛ㄦ湡椹卞姩锛坱ick锛?* | 鈶わ紙棣栭€夛級锛嬧懃锛堝閫夛級 | 瑁呴厤 `vibe-math-vmu.js`锛堟敞鍏?`timer`锛屽苟鍦?pack 瑁呰浇鍚庤皟涓€娆?`scheduler.arm()`锛夛紱pack 鍐?`middleware/tick.js` 鎻愪緵 tick 浣?| 澶嶇敤 `vmu.schedule.triggers`锛媊triggerVia:'middleware'`锛廯coalesceMissed`锛廯minIntervalMs`锛廯maxRecurrences`锛涙柊澧?`vmu.v3.tickIntervalMs`(2000) | `status().scheduler.armed===true`锛沗timerShape!==null`锛泃ick 浜嬩欢鏁伴殢娉ㄥ叆 timer 澧炲姞锛?*鏃犳敞鍏ユ椂 `status()` 鑷洕 tick-only**锛堢幇鐘跺凡绗﹀悎锛?|
⟪编码损坏⟫ | P0-2 | **瑙勫垝-璋冨害闂幆** | 鈶★紙浣擄級锛嬧懃锛坱urn 娲惧彂锛?| `packs/v3/middleware/planner.js` | 鏂伴敭锛歚vmu.v3.planningHorizon`(3)銆乣.planMinIntervalMs`(30000)銆乣.plannerMaxFails`(3)銆乣.plannerEnabled`(true) | 绠€鎶?JSON 鍚?9 娈碉紱璁″垝瓒呰繃 horizon 琚埅鏂紱闈炴硶鍔ㄤ綔琚墧闄や笖**鐣欒鏁?*锛涜繛缁?N 娆′笉鍙В鏋?鈬?`plannerEnabled=false` 涓?*鍏峰悕浜嬩欢**锛汱ogs/Plans 璁板綍鏉℃暟锛濊鍒掓鏁?|
⟪编码损坏⟫ | P0-3 | **瑙勫垝瀛︿範闂幆** | 鈶?鈶?| 涓婅堪妯″潡锛媊records` 杞?`plans` | 澶嶇敤 `vmu.records.history.storeMode` | 绗?n 娆＄畝鎶ョ殑 `last_plan.outcomes` 闀垮害锛濈 n-1 娆℃墽琛屽姩浣滄暟 |
⟪编码损坏⟫ | P0-4 | **鏂规硶搴擄紙鍗?搴旂敤/鏀硅繘/涓ょ骇锛?* | 鈶?鈶★紙涓ょ骇瑕?鈶ワ級 | `packs/v3/middleware/methods.js`锛沗PACK.tracks` 鍔?`methods`锛廯methods-global`锛沗PACK.settings` 澹版槑 | 鏂伴敭锛歚vmu.v3.methodKeepEvery`(5)銆乣.methodKeepIntervalMs`(0)銆乣.methodAutoPromote`(false) | 搴旂敤璁板綍鍙甫闂/鏂瑰悜涓婁笅鏂囨墠杩藉姞锛涙湭鐭?method id 鈫?杩?pending 涓?*涓嶉潤榛樹涪**锛涙敼杩涘巻鍙?v 鍙峰崟璋冿紱`鍙俊鏂█` 鍙惈姒傜巼鈭坽0,1} 鐨?ID锛涙柟娉曞崱 `<id>@<n>.md` 淇瀛樺湪 |
⟪编码损坏⟫ | P0-5 | **鍙戞槑涓婃姤闂幆** | 鈶?| 鍚屼笂锛堟寕鍦?`turn/reply-parsed`锛?| 鈥?| 鎶?`new_inventions` 鈬?pending+1锛沰eeper 鏈変骇鍑?鈬?pending 娓呴浂锛沰eeper 鏃犱骇鍑?鈬?鍏滃簳寤哄崱涓?pending 娓呴浂锛堥槻婊炵暀锛?|
⟪编码损坏⟫ | P0-6 | **杞鑼冧笁鍗★紜Verified 鍒嗚** | 鈶狅紜鈶★紙Verified 涓嶅彲鍙樿 鈶ワ級 | `PACK.tracks: ['problems','propos','methods','directions','journal','verified']`锛涙ā鍧楄礋璐ｈВ鏋?鍐欏叆 | 澶嶇敤 `vmu.records.bodyCapBytes`锛廯naming.*`锛廯retention.*` | 姝ｆ枃閲屽嚭鐜颁换鎰?`## ` 娈靛湪鍥炲啓鍚?*閫愬瓧淇濈暀**锛涘彧鏈?Verified 杞ㄧ殑瀹氳鍗¤褰撲綔浜嬪疄娉ㄥ叆锛涢潪 Verified 鍐呭鍦ㄦ彁绀鸿瘝閲岃鏄庣‘鏍?缁忛獙" |
⟪编码损坏⟫ | P0-7 | **楠岃瘉闂幆锛堚墺2 绁ㄣ€佽京璁恒€佽鍐炽€佸洖鍐欙級** | 鈶?鈶?| `packs/v3/middleware/verify.js`锛媊PACK.slots.verifier.capacity:3` | 澶嶇敤 `vmu.ballot.minVotes`(3)銆乣vmu.meetings.verdictMaxRounds`(5)銆乣vmu.ballot.method`/`tieRule`锛涙柊閿?`vmu.v3.verifierCount`(3)銆乣.debateMaxRounds`(5)銆乣.verdictMode`(forced) | 鍗曠エ/鏈噾榻?鈬?**鏃犺瀹?*锛坉eny 鍏峰悕锛夛紱鍏?1鈫?銆佸叏 0鈫?锛涘悓渚у潎鍊?0.85 杈圭晫鍙栧潎鍊硷紱forced 鍧囧€煎す [0.01,0.99]锛涜鍐冲悗鍛介鐘舵€侊紜Verified 鍗★紜杈╄璁板綍涓夊鍚屾椂瀛樺湪 |
⟪编码损坏⟫ | P0-8 | **manual 浜哄伐闂?* | 鈶?| `packs/v3/middleware/gates.js` | 鏂伴敭 `vmu.v3.mode`(auto/manual)锛堝凡鏈夊厛渚嬶級 | manual 涓嬭鍒?瑁佸喅/鏅嬪崌涓夊**鎺掗槦涓嶆墽琛?*锛沗list` 鍙 pending锛沘pprove 鍚庢墠鐢熸晥锛涘垏鍥?auto 鑷姩鏀捐涓斿け璐ヤ篃钀界粓鎬?|
⟪编码损坏⟫ | P0-9 | **鏁版嵁灞傜洰褰曚笌绱㈠紩** | 鈶?| pack settings锛嬫ā鍧?| 澶嶇敤 `vmu.records.tracks/headListAt/truncateMode` | 绱㈠紩閲嶅缓鍚庢潯鐩暟锛濈鐩樺崱鏁帮紱鎴柇鏈?`dropped` 璁℃暟锛涘潖鍗′笉浣跨储寮曟暣浣撳け璐?|
⟪编码损坏⟫ | P0-10 | **v3 宸ュ叿鍚嶅吋瀹归潰** | 鈶わ紙36 涓級 | 瑁呴厤 `host.js TOOL_NAMES`锛媊toolSpecs`锛堟垨 鈶?璁?pack 澹版槑锛?| 鈥?| 姣忎釜 v3 宸ュ叿鍚嶅彲璋冪敤涓旀湁 schema锛沗vibe_math_status` 绛?5 涓珮棰戝悕鐨勫洖鎵у瓧娈典笌 v3 鍚屽悕閿竴鑷?|

⟪编码损坏⟫ ### P1锛堣涓虹瓑浠烽渶瑕侊級

| # | 鏉＄洰 | 褰㈡€?| 钀界偣 | 璁剧疆閿?| 鏂█ |
|---|---|---|---|---|---|
⟪编码损坏⟫ | P1-1 | 纭害鏉燂細骞傜瓑/宸查獙璇佷笉鍐嶈皟搴?渚濊禆/瀹归噺 | 鈶★紙瀹归噺 鈶犲瓨閲忥級 | 妯″潡锛媊tasks.deps`锛媊members` 妲戒綅 | 澶嶇敤 `vmu.limits.maxLiveMembers`/`vmu.limits.maxParallel` | 鍚?rId 涓嶉噸澶嶅缓浠诲姟锛涘凡楠岃瘉瀵硅薄涓嶈繘鍊欓€夛紱`绛夊緟渚濊禆` 涓嶆淳瑙ｏ紱瓒?capacity 鐨勮鍔ㄨ繘闃熷垪涓嶄涪 |
⟪编码损坏⟫ | P1-2 | 鏂囦欢鍐欓攣锛坈laim/release/status锛?| 鈶ワ紙寤鸿锛夛紡鈶?| 鍐呮牳鍏峰悕"璺緞绉熺害"鎴栨彃浠讹紱pack 渚?`middleware/locks.js` 璋冪敤 | 鏂伴敭 `vmu.v3.fileLockTimeoutMs`(60000) | 鍚岃矾寰勭浜屽啓鑰呰鎷掍笖**鍏峰悕**锛涙寔鏈夎€呯粨鏉熻嚜鍔ㄩ噴鏀撅紱闀垮啓锛?TTL锛夋湡闂翠粬浜轰笉鑳芥姠锛堢画绉熸湁鏁堬級锛沗lock_status` 涓庣湡瀹炴寔鏈夎€呬竴鑷?|
⟪编码损坏⟫ | P1-3 | 浼樺厛绾ц皟鏁达紡鏅嬪崌闃堝€?| 鈶★紜鈶ワ紙閿級 | 妯″潡 | `vmu.v3.promoteValueThreshold`(0.7)銆乣.priorityAdjust`(none)銆乣.proposPriorityAdjust`(none) | 闃堝€艰竟鐣岋紙0.7锛夎Е鍙戜竴娆℃檵鍗囷紱姣?tick 鑷冲涓€涓紱鏅嬪崌闂涓庡師鍛介鍙屽悜鍙拷 |
⟪编码损坏⟫ | P1-4 | 瀛愰棶棰樹笁瀵硅薄 | 鈶?| 妯″潡 | 鈥?| 涓€娆?q_sub 鎭颁骇鐢?3 涓璞★紱閲嶅 q_sub 琚幓閲嶏紱鏉ユ簮涓庡姩鏈哄瓧娈甸潪绌?|
⟪编码损坏⟫ | P1-5 | 姹囨姤涓夎矾锛嬬姸鎬侀潰 | 鈶犲瓨閲忥紜鈶?| 妯″潡锛媊vmu.report` | 澶嶇敤 `vmu.report.*`锛涙柊閿?`vmu.v3.reportIntervalMs`(0)銆乣.reportMode`(file) | file 鎶ュ憡钀界洏锛沺ush 鍙湪 mode 鍏佽鏃讹紱鎶ュ憡璁℃暟涓?status 涓€鑷?|
⟪编码损坏⟫ | P1-6 | 鎻愮ず璇?6 娈碉紜瑙掕壊褰掑睘 | 鈶?| `packs/v3/prompts/*.js` | `vmu.prompts.sections/bindings` | 姣忔潯鎹曡幏鐨勬彁绀鸿瘝鍚?6 娈典笖椤哄簭鍥哄畾锛涜鑹蹭笓灞炴鍙嚭鐜板湪瀵瑰簲瑙掕壊锛涙柟娉曠储寮曟渶澶?20 鏉?|
⟪编码损坏⟫ | P1-7 | 宸ュ叿杩囨护锛坅llow/deny/缃戠粶/鑴氭湰/涓婇檺锛?| 鈶ワ紙澹版槑寮忥級锛忊懀锛堟彃浠讹級 | 鍐呮牳 per-slot policy锛媊host-hooks.js` 娑堣垂 | 鏂伴敭 `vmu.v3.solverToolAllow/Deny鈥 绛?| deny 鍏ㄥけ鏁?鈬?鎷掓淳锛坒ail-closed锛夛紝涓嶅厑璁?鏃犺繃婊ら噸璇? |
⟪编码损坏⟫ | P1-8 | Lean 涓夋。锛嬭瀹氶棬 | 鈶犲瓨閲忥紜鈶?| 妯″潡鎸?`ballot/tally` 鎴?`settle/before` | 澶嶇敤 `vmu.math.formalVerify/lean*`銆乣vmu.formal.*` | off 妗ｆ彁绀鸿瘝闆?Lean 瀛楁牱涓?State 涓嶈惤 formal 鎶曞奖锛況equire 妗ｆ棤 passed/blocked 鈬?瑁佸畾涓嶇敓鏁堜笖瀵硅薄鐣欏湪鍘熷簱銆佷笉閲嶅琛ㄥ喅 |
⟪编码损坏⟫ | P1-9 | defect 鎾ゅ洖褰掓。璇佹槑 | 鈶ｏ紡鈶?| 鎻掍欢鎴栨ā鍧?fs 鎺ョ紳 | 鈥?| note 绌?鈬?鎷掔粷璁板綍涓旇瘉鏄庝笉鍙橈紱defect 鍚庡綊妗ｈ瘉鏄?*涓嶅彲鍐嶈璇绘垚閫氳繃**锛堝垹闄?瑕嗙洊/鍏憡涓夋€佷箣涓€锛?|
⟪编码损坏⟫ | P1-10 | 璁烘枃鏀跺彛 | 鈶犲瓨閲忥紜鈶?| 妯″潡锛堟淳鎾板啓鍥炲悎闇€ turn锛?| 澶嶇敤 `vmu.paper.*` | 鏀跺彛鏃跺厛浜ц鏂囧啀鍋滄満锛涗骇鐗╁洓浠堕綈锛涚己涓€涓嶅绉板畬鎴?|

### P2（更优但不必须）

| # | 鏉＄洰 | 褰㈡€?| 璇存槑 |
|---|---|---|---|
⟪编码损坏⟫ | P2-1 | 澶氶」鐩紙`Projects/<slug>`锛変笌椤圭洰閿?| 鈶?鈶?| vmu 鍗?root锛涜嫢纭渶澶氶」鐩紝寤鸿涓婂眰"涓€涓儴缃蹭竴涓?root"鑰屼笉鏄唴鏍稿姞澶氱鎴?|
⟪编码损坏⟫ | P2-2 | 鏃ュ織杞浆 | 鈶★紙v3 鏈韩娌″仛锛?| 鐢?library retention锛坄vmu.records.retention.*`锛夋浛浠?v3 鐨勮鎯?|
⟪编码损坏⟫ | P2-3 | 褰㈠紡鍖?Index/Lean 绱㈠紩鏂囦欢 | 鈶?| v3 鐨?`Formal/Index.md` 鐢辨彃浠剁敓鎴愭洿鑷劧 |
⟪编码损坏⟫ | P2-4 | 绱㈠紩 5s 鑺傛祦 | 鈶?| 搴撴湰韬?list 鏃堕噸寤猴紱鑺傛祦鍙槸浼樺寲 |
⟪编码损坏⟫ | P2-5 | 瑙勫垝鍣ㄥ涔狅紙璇嗗埆鏃犳晥绛栫暐锛?| 鈶?| 绠€鎶ラ噷甯?outcomes 鍗冲凡鍏峰锛涜繘涓€姝ュ彲鍋氱瓥鐣ユ墦琛?|

## 4. 浣犺涓?妗嗘灦鑳藉姏涓嶈冻銆侀渶瑕佺粰鍐呮牳鍔犲叿鍚嶈兘鍔?鐨勬潯鐩紙绗?4 姝ワ級

⟪编码损坏⟫ 閫愭潯锛?*缂轰粈涔?锝?涓轰粈涔堢幇鏈夋墿灞曢潰涓嶅 锝?鍔犲湪鍝竴灞?*銆?
| # | 缂虹殑鑳藉姏 | 涓轰粈涔堢幇鏈夐潰涓嶅 | 鍔犲湪鍝竴灞?|
|---|---|---|---|
⟪编码损坏⟫ | K1 | **鍛ㄦ湡/鑷┍鏃堕挓** | `scheduler` 鏈?`every/tick/arm` 浣?*瑁呴厤娌℃敞鍏?timer**锛坄vibe-math-vmu.js:486-525`锛夛紱`beat()` 鏃犲畾鏃跺櫒锛坄kernel/index.js:2062-2067`锛夛紱M2 妯″潡鎷夸笉鍒?`vmu.scheduler`锛坄index.js:1416-1428`锛夛紱妯″潡涔熸棤娉曡嚜寤?timer锛坅pi 鍐荤粨锛屾棤 timer锛?| 鍐呮牳 `kernel/scheduler.js`锛嬭閰嶏細鈶燻vmu.schedule.autoArm`锛堥粯璁?false锛岄浂鏈哄埗锛夛紜鍐呮牳鍦?`start()` 閲?arm/tick 骞?*鑷洕** `status().scheduler.armed`锛涙垨 瑁呴厤鍏堟敞鍏?timer锛嬩竴琛?arm锛坄docs/10:160` 宸茬粰鏀瑰垽鏉′欢锛?|
⟪编码损坏⟫ | K2 | **娲惧彂涓€娆℃垚鍛樺洖鍚?*锛坧lanner/writer/verifier 鐨?spawn"锛?| `vmu.turn` 涓嶅湪 M2 鏈嶅姟鐩綍锛沗members.wake` 鍦ㄧ洰褰曚絾瑕佽閰嶇粰 `deliver`锛坄vibe-math-vmu.js:511`锛夛紱`turn.run` 鐨?`deliverTurn` 鏄閰嶆帴缂濓紙`:412`锛?| 鍐呮牳 `kernel/index.js:1416-1428` 鐩綍鍔?`vmu.turn`锛堬紜鏂拌兘鍔涘悕濡?`dispatch-work`锛屾垨澶嶇敤 `trigger-workflow`锛夛紱`kernel/loader.js` 鑳藉姏琛ㄥ悓姝?|
⟪编码损坏⟫ | K3 | **pack 鍙０鏄庣殑 durable key 鍛藉悕绌洪棿** | `store.PUBLIC_KEYS` 鍥哄畾锛屾湭澹版槑閿?`patch` 鍏峰悕鎷掞紙`kernel/store.js:32-60,256-262`锛夛紱pack 鏃犳硶鐧昏鑷繁鐨勭姸鎬侀敭锛涙浛浠ｅ彧鑳藉 records锛堝彈 32KB/澶村瓧娈甸檺鍒讹級 | 鍐呮牳 `kernel/store.js`锛媊kernel/pack.js`锛氬厑璁?`patch('pack.<id>.鈥?)` 鍦?apply 鏃剁櫥璁般€乽nload 鏃舵竻鐞嗭紙涓?`declareTracks` 鍚屽瀷锛?|
⟪编码损坏⟫ | K4 | **records 澶村瓧娈靛彲澹版槑** | v3 鐨勬満鍣ㄥ彲璇婚敋鐐癸紙渚濊禆/鏉ユ簮/璁″垝/姒傜巼/浼樺厛绾?浠峰€?鍙俊鏂█/涓婄骇浣撶郴/瀛愭柟娉曪級鏃犳硶钀借繘鍥哄畾 7 瀛楁锛坄kernel/library.js:26`锛夛紱鍙兘濉炴鏂囷紝浜庢槸 `list` 鏃犳硶鎸夊畠浠繃婊?鎺掑簭 | 鍐呮牳 `kernel/library.js`锛媊kernel/pack.js`锛歱ack 澹版槑 `headFields`锛堝湪淇濈暀瀛楁涔嬪悗杩藉姞锛屽懡鍚嶇┖闂村彈闄愶級锛宍list(filter)` 鏀寔 |
⟪编码损坏⟫ | K5 | **M2 鍙楁帶 fs / 褰掓。璇佹槑鎾ゅ洖** | 妯″潡鏃?fs銆佹棤 store锛泇3 鐨?"鍒?瑕嗙洊 `Verified/Lean/<id>.lean`" 涓?`Formal/Index.md` 鐢熸垚閮藉仛涓嶅埌 | 鍐呮牳 `kernel/loader.js` 澧炲姞 capability锛堝 `write-artifact`锛夛紜鍙?guard 鐨?fs 鎺ョ紳锛涙垨鏄庣‘鍒掔粰 鈶?鎻掍欢锛堟帹鑽愬悗鑰咃紝鍏堜笉鎵╁唴鏍革級 |
⟪编码损坏⟫ | K6 | **姣忚鑹插伐鍏?allow/deny** | v3 鎸夎鑹叉敞鍏?toolFilter锛泇mu 鍙湁 per-turn 璋冪敤涓婇檺锛坄host-hooks.js:137`锛夛紝娌℃湁 per-slot 宸ュ叿绛栫暐閿笌娑堣垂鐐?| 鍐呮牳 `kernel/index.js`锛堟Ы浣嶇瓥鐣ワ級锛媊host-hooks.js` pre-execute 娑堣垂锛涢敭杩?`settings/schema.js` |
⟪编码损坏⟫ | K7 | **璺緞绉熺害閿?* | `vmu.store.lock` 鍙鎶橀〉锛沗fileOwner` 閭ｇ被"璺緞绉熺害"鍦?vmu 涓嶅瓨鍦紱妯″潡鏃?fs | 鍐呮牳鏂版ā鍧楋紙濡?`kernel/lease.js`锛歝laim/release/status/renew锛屾寔鏈夎€呭瓨娲诲垽鎹敞鍏ワ級锛嬮挬瀛愬湪鎴愬憳缁撴潫鏃堕噴鏀?|
⟪编码损坏⟫ | K8 | **椤圭洰/绗簩搴撴牴** | `createLibrary({root})` 鍗曟牴锛泇3 瑕?椤圭洰搴撯啋鍏ㄥ眬搴?锛泇3-core 鐨?`tracks` 鍙喅瀹氳建鍚嶄笉鍐冲畾鏍?| 鍐呮牳 `kernel/pack.js`锛媊kernel/library.js`锛氬厑璁?pack 澹版槑 `libraryRoots: {project, global}` 涓?`promote(track,id)`锛汳2 妯″潡缁忕洰褰曡闂?|
⟪编码损坏⟫ | K9 | **涓嶅彲鍙樿褰曪紙Verified 璇箟锛?* | `permanent` 鍙槻鍒犻櫎锛坄library.js:265`锛夛紝涓嶉槻鏀瑰啓锛沗record/append-before` 鍙樆鏂絾瀵?*鐩存帴鏀?md** 鏃犳晥锛坴3 鐨?浠ｇ悊鐩村啓"鏄悓涓€椋庨櫓闈級 | 鍐呮牳 `kernel/library.js` 澧炲姞 `immutable` 澶村瓧娈碉紜鍐欏叆鍓嶆牎楠岋紱鎴?`kernel/guard.js` 璺緞绛栫暐 |
⟪编码损坏⟫ | K10 | **`turn/reply-parsed` 鐨?rewritable 鍚嶄笉鍓疄** | 娉ㄥ唽琛ㄥ０鏄?`rewritable:true`锛坄kernel/bus.js:81`锛夎€岃鐐瑰彧璇?`ok===false`锛坄kernel/turn/index.js:882-887`锛夛紱`rewriteResult` 鍏ㄤ粨鏃犳秷璐圭偣 鈬?鍐欏洖鏄?*闈欓粯 no-op** | 浜岄€変竴锛氬唴鏍?`kernel/turn/index.js` 鐪熺殑娑堣垂 `rewriteResult`锛堢瓑浠?v3 鐨?鍥炴墽淇"锛夛紝鎴栨妸娉ㄥ唽琛ㄨ瀛楁鏀瑰洖 false 骞跺湪鏂囨。鍐欐槑銆?*杩欐槸"瀹ｇО vs 瀹炵幇"缂洪櫡锛屽缓璁厛淇枃妗?娉ㄥ唽琛?* |
⟪编码损坏⟫ | K11 | **pack 鍙０鏄庡伐鍏烽潰 / 鍛戒护** | pack manifest 鏃?`tools`锛沗TOOL_NAMES` 鏄父閲忥紱鍒悕涓嶄骇鐢熷伐鍏烽潰锛坄registry.js:130` 鏄敮涓€娑堣垂鑰咃級锛涘懡浠ゆ敞鍐屽彧鍦ㄨ閰?| 鍐呮牳 `kernel/pack.js`锛媊host.js`锛歱ack `tools: [{name, schema, service, op}]` 鐢辫閰嶈浆鎴?toolSpec锛涘懡浠ゅ悓鐞嗐€傚惁鍒欏彧鑳?鈶?鎵嬫敼 |

## 5. 我没核到的部分（诚实边界＋补法）

| # | 鏈牳鍒?| 褰卞搷 | 琛ユ硶 |
|---|---|---|---|
⟪编码损坏⟫ | U1 | **v3 搂13 鐨?鐮旂┒鏃ュ織杞浆锛坄*.1.md`锛嬬画鍐欐寚閽堬級"** | v3 鍙兘鍙槸璁捐椤癸紱澶嶅埢鏃朵笉瑕佺収鎶?| `grep -n "杞浆\|rotate\|\.1\.md" vibe-math-v3/vibe-math-v3.js`锛堝凡璺戯細0 鍛戒腑锛夛紱瑕佺‘璁ゅ氨鏌?README/docs 鏄惁鏈夊疄鐜拌鏄?|
⟪编码损坏⟫ | U2 | v3 `math-computation.js`锛?482 琛岋級鍐呴儴鏈哄埗 | 鎴戠敤"涓?vmu 閫愬瓧鑺傜浉鍚?缁曡繃浜嗗畠锛坰ha256 鐩稿悓锛夆噿 鍏跺唴閮ㄦ満鍒跺湪 vmu 宸叉湁绛変环锛屼笉蹇呴€愭潯鐩?| 濡傞渶閫愭潯锛氳鍏变韩妯″潡 `MATH_PARAM_DEFAULTS`锛媊registerMathComputation` 濂戠害锛坄vibe-math-v3.js:5100` 鎺ョ嚎锛?|
⟪编码损坏⟫ | U3 | v3 棰勮瑁呴厤锛坄agent.cordis.yml`锛夊宸ュ叿寮€鍏崇殑閫愯閰嶇疆 | 鍙奖鍝?澶嶅埢鏃跺摢浜涘涓诲伐鍏疯寮€"锛屼笉褰卞搷鏈哄埗娓呭崟 | 璇?`vibe-math-v3/agent.cordis.yml` 鍏ㄦ枃锛?25 琛岋紝閲嶇偣 275-425 鐨?tool 琛岋級 |
| U4 | vmu `kernel/resume.js` 鐨?10 闈㈡姇褰辨竻鍗曠粏鑺?| 褰卞搷"浜哄伐闂?鍐崇瓥闃熷垪鑳藉惁璺ㄩ噸鍚?鐨?P1 缁撹 | 璇?`kernel/resume.js` 鐨?`PROJECTIONS`/`ACTIVITY_KEYS` |
⟪编码损坏⟫ | U5 | vmu `kernel/records.js` 涓?`kernel/library.js` 鐨勫垎宸ワ紙涓や釜闈㈤兘鍙?records锛?| 褰卞搷"鍗?杞ㄨ抗"钀界偣閫夋嫨 | 璇?`kernel/records.js` 澶?80 琛岋紙`vmu.records.put/list/expand` 涓?library.append 鐨勫叧绯伙級 |
⟪编码损坏⟫ | U6 | `vmu.ballotbox` 鐨?quorum 鎷掔爜涓?`vmu.ballot.minVotes` 鐨勭湡瀹炴秷璐圭偣 | 褰卞搷 P0-7 鐨勬柇瑷€鍐欐硶 | 璇?`kernel/ballotbox.js`锛?1KB锛夌殑 `open/cast/close` 涓庣爜琛?|
| U7 | `vibe_vmu_formal` / `vibe_vmu_mathtools` / `vibe_vmu_mathjobs` 鐨?action 琛?| 褰卞搷"v3 Lean 宸ュ叿 鈫?vmu 闈?鐨勬槧灏勯绮掑害 | 璇?`tools/formal.js`銆乣tools/mathtools.js`銆乣tools/mathjobs.js` |
⟪编码损坏⟫ | U8 | 鏈疄闄呰杞?`v3-core` pack 璺戞祴璇?| 鎴戝彧璇讳簡瑁呰浇璺緞涓庨棬绂侊紝鏈墽琛岋紙鍙瀹¤锛嬩笉璺戞祴璇曪級 | `node tests/run-tests.mjs` 鎴栫洿鎺ユ瀯閫?inline manifest 璧?`plan()`锛堟湰浼氳瘽涓嶅仛锛岄伩鍏嶅啓鐩?璺戞祴璇曪級 |
⟪编码损坏⟫ | U9 | vmu `guard`/`vmu.paths` 鏄惁鑳借〃杈?Verified 璺緞绂佸啓" | 鍐冲畾 P0-6/E4 璧?鈶?杩樻槸 鈶?| 璇?`kernel/guard.js`锛?5KB锛変笌 `settings/schema.js` 鐨?`vmu.paths.*` |
⟪编码损坏⟫ | U10 | v3 鐨?`State/directions.json` 鏈垪鍦?`瀹炵幇鏂规.md 搂4` 娓呭崟閲?| 鏂囨。涓庝唬鐮佹湁鍑哄叆锛堜唬鐮佹洿鍏級 | 浠?`saveAll`锛媊saveDirState`锛坄:1204`锛変负鍑?|

### 涓€椤电粨璁?
⟪编码损坏⟫ 1. **v3 鐨勪袱澶ф牳蹇冨湪 vmu 渚х‘瀹炴槸绌虹殑**锛氳鍒?璋冨害闂幆锛坱ick/planner/璁″垝闃熷垪/瀛︿範闂幆锛変笌鏂规硶搴擄紙搴旂敤/鏀硅繘/keeper/鏅嬪崌锛?*娌℃湁浠讳綍绛変环瀹炵幇**锛沗packs/v3-core` 鍙粰浜嗘満鏋勶紙妲戒綅/杞?涓や釜 quorum+manual 妯″潡锛夊苟璇氬疄鏍囨敞锛坄packs/v3-core/index.js:15-17`锛夈€?2. **v3 鐨?tick"鏄?vmu 鏈€纭殑涓€澶勭己鍙?*锛歚control/heartbeat` 涓嶆槸鍛ㄦ湡婧愶紙鏃犲畾鏃跺櫒锛夛紱`scheduler` 鏈?`every/arm/tick` 浣嗚閰?*娌℃敞鍏?timer**銆佸唴鏍?*涓嶈嚜鍔?arm**锛汳2 妯″潡鏃㈡嬁涓嶅埌 scheduler 涔熶笉鑳借嚜寤?timer 鈬?P0-1 蹇呴』钀藉埌 鈶?鈶ャ€?3. **"娲惧彂涓€涓洖鍚?鍚屾牱涓嶉€?*锛歚vmu.turn` 涓嶅湪 M2 鏈嶅姟鐩綍锛宍members.wake` 闇€瑕佽閰嶆敞鍏?`deliver` 鈬?planner/solver/verifier/writer 鐨?spawn"瑕?鈶?鈶ゃ€?4. **鑳界函闈?鈶?鈶?澶嶅埢鐨勯儴鍒嗘瘮棰勬湡澶?*锛氳蒋瑙勮寖 md 鍗★紙library 璁板綍锛嬫鏂囪嚜鐢憋級銆侀獙璇佹姇绁紙ballot `estimate` 绁紜`ballot/tally` 娉ㄥ叆 tally锛夈€佽京璁鸿疆闄愶紙`meetings.verdictMaxRounds`锛夈€佷汉宸ラ棬锛坄human` approvals锛夈€佹眹鎶ワ紙`report`锛媊library`锛夈€丩ean锛坄lean.js` 鍏ㄥ + `fidelity.js`锛夈€佽鏂囷紙`paper.js` 鍏ㄥ锛夆€斺€旇繖浜涢兘鏄?*瀛橀噺鏈哄埗**锛屽彧宸?pack 鐨勭瓥鐣ヤ唬鐮佷笌澹版槑銆?5. **涓ゆ潯鍩虹嚎闇€瑕佷慨姝?*锛堜笉鏄簨瀹為敊璇紝鏄彛寰勮绮剧‘锛夛細鈶?`store.patch` 瀛樺湪锛屼絾 **M2 妯″潡鎷夸笉鍒?`vmu.store`**锛堟湇鍔＄洰褰曞浐瀹?15 椤癸級锛屾墍浠?鐢ㄦ姌椤靛啓閿?鐘舵€?瑕佸厛鍔犵洰褰曢」锛涒憽 `turn/reply-parsed` 鐨?**rewritable 娌℃湁娑堣垂鑰?*锛岃鐐瑰彧鑳芥嫆涓嶈兘鏀癸紙鍐欏洖鏄潤榛?no-op锛夈€?6. **v3 鐨勬嫆缁濈爜鏅亶缂哄け**锛歵ick/璁″垝/楠岃瘉/鏂规硶搴撶粷澶у鏁拌矾寰勫彧杩斿洖 `{ok:false,message}` 鎴栭潤榛樺墧闄わ紱澶嶅埢鏃惰嫢鐓ф妱浼氳繚鍙?vmu 鐨?鎷掔粷瑕佸叿鍚?绾㈢嚎 鈬?杩欐槸澶嶅埢鐨?*琛屼负宸紓**锛屽繀椤诲湪 P0/P1 鏂█閲屽啓鎴?`code`銆?
