# PHASE 9 鈥斺€?PTC锛廘ean锛忕幆澧冿紡淇＄锛忓彲妫€瑙嗭紡杞璁板綍锛堢洰鏍?1鈥?锛?
> 鈽?**鏈嵎鏉ユ簮**锛氬垱濮嬩汉瀵?PHASE 9 涓?PTC 涓?Lean 涓ゅ澶勭悊鐨勮拷闂紝浠ュ強鍚庣画涓夋潯杩藉姞锛堢幆澧冮€傞厤鎵╁埌鏁板璁＄畻鍏ㄩ儴鐜锛忎俊绠卞垎绾ц涔夛紡`wait_agent` 鏄惁澶嶇敤锛夈€?> 鈽?**鏈嵎閫愯疆杩藉姞**锛氭瘡杞褰?**鍋氫簡浠€涔堛€佺湡鏈烘垨澶瑰叿璇佹嵁銆佷慨鎺夌殑缂洪櫡銆佽鎺ㄧ炕鐨勭粨璁?*锛涙暟瀛椾互褰撹疆鍛戒护杈撳嚭涓哄噯锛屼笉鎵嬫妱鏈潵鍊笺€?> 鈽?**鏈嵎涓嶆妸鈥滃凡淇€濆啓鎴愨€滃凡楠屸€?*锛氱湡鏈哄師鏂囨潵鑷湰浼氳瘽鐨勫疄娴嬫姤鍛婏紱澶瑰叿璇佹嵁鏉ヨ嚜浠撳簱娴嬭瘯銆備袱鑰呭垎寮€鏍囨敞銆?
---

## 搂0 鏉ユ簮涓庤寖鍥?
| 鈽?# | 鈽?鏉ユ簮 | 鈽?鏈嵎鐨勫鐞?|
|---|---|---|
| 1 | 鍒涘浜鸿拷闂?**PTC 涓?Lean 涓ゅ澶勭悊** | 鎾?PTC銆丩ean 璇婃柇閾俱€佺湡鏈哄け璐ュ眰娆″墠绉?|
| 2 | 杩藉姞锛?*鐜閫傞厤鑼冨洿鎵╁埌鏁板璁＄畻鍏ㄩ儴鐜** | `vmu.env.needs` 榛樿琛ㄣ€乣vibe_vmu_env` 鐨?probe/list/report |
| 3 | 杩藉姞锛?*淇＄鍒嗙骇璇箟** | 鍙戦€佹柟鏄惧紡 urgent銆侀粯璁ょ┖ urgentKinds銆侀潪绱ф€ヤ笉甯︽鏂?|
| 4 | 杩藉姞锛?*`wait_agent` 鏄惁澶嶇敤** | 浣滀负鐩爣 5 鐨勮竟鐣岄棶棰樿褰曪紱鏈嵎涓嶆妸瀹冨啓鎴愬凡瑙ｅ喅 |
| 5 | 鏈樁娈垫柊澧炵邯寰嬶細**姣忚疆璁板綍鍒?md** | 鏈嵎鍗宠绾緥鐨勪骇鐗?|

---

## 搂1 鍏釜鐩爣锛堢畝鍐欙級

| 鈽?# | 鈽?鐩爣锛堢畝鍐欙級 |
|---|---|
| 1 | **PTC 鏀跺彛**锛氭挙鎺?v5r 鐨?`ptc`锛屽洖鍒扳€滃伐鍏风敱鎻愮ず璇嶄笌 wire 鍚屾簮椹卞姩鈥?|
| 2 | **Lean 褰㈠紡鍖栭潰鐪熸満鍙敤**锛氬懡浠よВ鏋愩€佹枃浠惰鍙栥€侀€€鍑虹爜銆佽瘖鏂叏閾?|
| 3 | **鏁板鐜閫傞厤**锛氳鐩栨暟瀛﹁绠楁墍闇€鐨?Python锛廘ean锛廘aTeX锛弉ode锛弍wsh锛廹it锛廋AS锛涘彧鎺㈡祴锛屼笉瀹夎銆佷笉鑱旂綉锛岀己澶卞彲涓婃姤 |
| 4 | **淇＄鍒嗙骇璇箟**锛氱揣鎬ョ敱鍙戦€佹柟鏄惧紡锛涢潪绱ф€ユ彁绀轰笉甯︽鏂囷紱`read` 涓?`ack` 鍒嗙锛涚姸鎬佹満鍙 |
| 5 | **鍙瑙?*锛氭瘡涓垚鍛樷€滃疄闄呭彲瑙佸伐鍏凤紡鎻愮ず璇嶈鐐癸紡瀹為檯鍥炴墽鈥濊兘琚竴鏉″懡浠ゅ鍑哄苟鑷姩瀵硅处 |
| 6 | **鎸佺画璁板綍**锛氭瘡杞畬鎴愭儏鍐垫寔缁啓鍏?md锛堟湰鍗凤級 |

---

## 搂2 杞?1锛氭挙 PTC 涓?Lean 璇婃柇

### 鍋氫簡浠€涔?- **鎾?v5r 鐨?`ptc`**锛氶潪 native 鐨勫０鏄庡繀椤诲湪 pack 鎻愮ず璇嶉噷鏈夊搴?marker锛屽惁鍒?`validatePack` 鎶?problem銆乣apply` 鎷掞紱`promptAck` 鏈哄埗钀藉湴銆?- **鍚屾簮鏂█琛?wire 灞?*锛氱敤瀹夸富 `register` 鐨?spec 鍚嶅仛 38/38 瀵硅处锛岄伩鍏嶅彧鏂█鎻愮ず璇嶈嚜娲姐€?- **Lean 璇婃柇瀛楁鍏ㄦ毚闇?*锛歚resolved`锛廯doneError`锛廯resolveError`锛廯spawnError`锛廯cwd`锛廯pathPrefix`锛廯signal`锛廯timedOut`锛涙柊澧?`VMU_LEAN_COMMAND_NOT_FOUND`銆?
### 璇佹嵁
- `tests/vmu-lean.test.mjs`锛堝綋杞柇瑷€ resolved/doneError 绛夊瓧娈碉級锛?- `tests/vmu-host.test.mjs` 鐨?spec 鍚?38/38 鍚屾簮鏂█锛?- 浠ｇ爜锛歚kernel/lean.js`銆乣host.js` 鐨?`wireTools` 鍚屾簮鍧椼€?
### 琚帹缈荤殑缁撹
- **杞?1 鏇炬妸 Lean 澶辫触褰掑洜浜庘€滃涓荤殑 workspace-write 娌欑鎷掔粷鎵ц璇ヨ矾寰勨€?* 鈬?**杞?6 琚湡鏈烘帹缈?*锛歳oot 涓庢垚鍛樹細璇濋兘鏄?`sandbox/mode = danger-full-access`锛堟垚鍛樹负 `{mode:"danger-full-access",source:"delegation"}`锛夛紝`approval/policy = never`锛宺oot 鑷繁璺?`lean --version` 鎴愬姛锛圠ean 4.34.0锛夈€傛矙绠变笉鏄樆濉炵偣锛?*璇ョ粨璁哄凡浣滃簾**銆?
---

## 搂3 杞?2锛氫俊绠遍噸鎺?
### 鍋氫簡浠€涔?- `urgent` 鏀规垚**鍙戦€佹柟鏄惧紡**锛岄粯璁?**false**锛沗urgentKinds` 绌洪粯璁わ紙kind 涓嶅啀鑷姩绱ф€ワ級銆?- 闈炵揣鎬ユ姇閫掔殑 envelope `entries: []`锛?*鎻愮ず璇嶄笉甯︽鏂?*锛涚揣鎬ユ墠甯︽鏂囥€?- 鏂板 `subject`锛廯read`锛廯todo`锛廯list`锛廯open`锛廯setState`銆?- **`ack` 涓?`read` 鍒嗙**锛氶潪绱ф€?flush **涓?ack**锛屽惁鍒欐鏂囦細鍦ㄦ垚鍛樿涔嬪墠琚垹銆?
### 璇佹嵁
- 鐪熸満锛氶潪绱ф€ユ彁绀哄師鏂?`銆愪俊绠便€戜綘鏀跺埌 1 鏉℃柊鐣欒█锛堟潵鑷?office锛夈€傛爣棰橈細闈炵揣鎬ヨ繘灞曞悓姝?A7銆傗€锛涙鏂囨爣璁?`闈炵揣鎬ユ鏂?涓嶅簲杩涙彁绀鸿瘝-K9Q` 鍦ㄦā鍨嬪彲瑙佹枃鏈?0 鍛戒腑锛屽彧鍑虹幇鍦?`open` 鍥炴墽銆?- 澶瑰叿锛歚tests/vmu-mailbox.test.mjs` 鐨?`entries:[]`銆乣read`/`ack` 鍒嗙銆乣SECRET_BODY_MARKER_9f2` 鍙嶆煡銆?
### 淇帀鐨勭己闄?- 鍘熷厛鈥滈潪绱ф€モ€濅粛鍙兘鍥?kind 鑷姩绱ф€ワ紱`read` 涓?`ack` 娣风敤浼氭彁鍓嶅垹姝ｆ枃銆?
---

## 搂4 杞?3锛氶檲鏃?pack 鍊?/ 妯″瀷鍙戜笉鍑虹殑鍙傛暟

### 鍋氫簡浠€涔?- 瀹氫綅锛歚packs/v5r/settings/defaults.json` 鐨勬棫涓冪 `urgentKinds` **鏄惧紡鍊肩洊浣?schema 绌洪粯璁?*锛涜鏄惧紡鍊煎凡鍒犻櫎锛坧ack 鍐欏煙鐢卞彟涓€璺畬鎴愶級锛屽苟鍔犳柇瑷€鈥渧5r 鐨勫€煎眰涓嶅緱澹版槑璇ラ敭鈥濄€?- **鍙嶆柇瑷€**锛氭樉寮忔棫涓冪鍒楄〃鑻ョ湡鐨勮澹版槑锛屽唴鏍镐粛**鍘熸牱鐢熸晥**锛堝唴鏍镐笉璁稿姭鎸佹斂绛栧€硷級銆?- **`urgent` 鍙傛暟妯″瀷鍙戜笉鍑烘潵**锛氬涓诲彂甯冪殑鏄?`spec.parameters` 鏄犲皠锛岀己閿細琚潤榛樺墺鎺夛紱淇湪**宸查儴缃?schema** 涓婃柇瑷€銆?
### 璇佹嵁
- `tests/vmu-v5r-tools.test.mjs` 搂7k锛歷5r 鍊煎眰涓嶅惈 `vmu.mailbox.urgentKinds`锛?- `tests/vmu-mailbox.test.mjs`锛歚urgentKinds: []` 鈬?涓嶇揣鎬ワ紱鏄惧紡鏃т竷绉?鈬?浠嶇揣鎬ワ紱
- 宸查儴缃?schema 鐨?`urgent` 鍙傛暟鏂█锛堢湡鏈衡€滃彂涓嶅嚭鏉モ€濈殑鍙嶄緥锛夈€?
### 鏁欒
- **闄堟棫鏄惧紡鍊兼瘮鈥滄病璁锯€濇洿绯?*锛氬畠鐪嬭捣鏉ラ厤缃繃锛岃涔夊嵈鏄棫鐨勩€?
---

## 搂5 杞?4鈥?锛氬悓婧愭覆鏌撱€乫lush銆乺eadHash/grace/why銆佸懡鍚嶄笌璇婃柇闈?
### 杞?4锛歚slv-inspect` 鎶撳埌鐪熸紓绉?鈬?鍚屾簮娓叉煋
- 鐪熸満/澶瑰叿锛歚RED promptTools missing from wire: 鈥銆乣RED wire tools not named in prompt: vibe_vmu_tools`锛涙垚鍛?wire 琚?per-turn `tools:{allow}` 鏀剁獎鍒?1锛屾彁绀鸿瘝浠嶆槸瑙掕壊鍏ㄦ竻鍗曘€?- 淇細鍦?`system-prompt/assemble` 鐨勫悓涓€ hook 閲?*鍙畻涓€娆?* `effectiveNames = out.tools`锛?*鍚屼竴 `out.tools` 鏃㈠杺 wire 鍙堟覆鏌?* `v5r-effective-tools` 鐭潡锛涘叏浠撳彧鏈変竴浠藉悕瀛楄〃銆?- `tools:'none'` 鈬?鍧楀啓 `0 涓猔锛屼笉閫€鍖栨垚绌哄潡/娌跨敤涓婃銆?- pack 鍗犱綅娈碉細涓夋鍚屽悕浼?`VMU_PACK_CONFLICT` 鈬?鏀?*鍞竴娈靛悕 + 鏂囨湰鏍囪**锛涙棤鍗犱綅鍒?append 骞惰 `effectiveBlock:appended`銆?
### 杞?5锛氱孩绾?4 鏅煡 + `readHash` + `graceMs` + `why`
- **`mailbox.flush` 闆剁敓浜ц皟鐢ㄨ€?*锛堢孩绾?4 瀹炰緥锛夛細淇湪宸叉湁鎴愬憳 assemble hook锛岄潪绱ф€ュ彧娉ㄥ叆 notice銆佺揣鎬ュ甫姝ｆ枃锛沗status().delivery` 澧炶鏁般€?- **鍚岀被鏅煡**锛歚scripts/audit-no-consumer.mjs` 杈撳嚭 **A=0锛廈=29锛廋=0锛廌=0**锛屽苟澹版槑鎵弿鍣ㄧ洸鍖猴紙鍙灇涓鹃《灞?function/const + kernel 鏈嶅姟鏂规硶锛屽璞″唴閮ㄧ鏈夋柟娉曟湭鍏ㄩ噺鏋氫妇锛夈€?- **`readHash` 鐢ㄨ繘绋?cwd 鑰屾枃妗ｈ root**锛氭敼涓?`resolvePath(root, file)`锛涘弽鏂█鈥滃垏鎹?cwd 鍚庝粛璇?root锛宑wd 鍚屽悕鏂囦欢涓嶈鈥濄€?- **env probe 缂?`graceMs`**锛歱robe 璇锋眰甯?`timeoutMs + graceMs`锛涗竷涓?spawn 鐐瑰叏鏍革紙env/lean/latex/formal/mathjobs/mathadapters/script-bridge锛夈€?- **`why` 涓嶅湪 `prompt.assemble` 鍙傛暟閲?*锛氳拷鍔?`銆愭湰杞寚浠ゃ€慲 涓?`instructionDelivered`锛沗NO_OPEN_MEETING` 鍖呰銆?
### 杞?6锛氬寘瑁呯爜鏀瑰悕
- `VMU_TURN_FIELD_NOT_CALLED` 鈫?**`VMU_TURN_FIELD_NOT_APPLICABLE`**锛氬瓧娈?*缁欎簡**锛屽彧鏄鍥炲悎娌℃湁宸ュ叿鑳戒骇鐢熷畠锛涒€滀笉閫傜敤浜庢湰鍥炲悎鈥濇瘮鈥滄病璋冪敤鈥濆噯纭€備繚鐣?`cause`锛堝師浼氳閿欒锛夛紝message 甯﹀簳灞傚師鍥犮€?
### 杞?7锛歚slv-inspect` 鐨勫亣绾㈡槸瀹冭嚜宸?- **鍋囩孩鏍瑰洜**锛氬畠鍙鐢ㄦ埛娑堟伅锛屾病骞跺叆 `system-prompt` 杩藉姞娑堟伅锛涗慨鍚?`sessions-r6` **0 RED**銆?- 闈欐€佹竻鍗曢檷 **INFO**锛?*鍚屾簮鍧楁墠鏄潈濞?*銆?
### 杞?8鈥?锛氬瓧娈靛悕銆佸熬杈撳嚭銆乻tep 鍥炴墽銆佺揣鎬ユ秷鎭竴鑷存€?- **Lean `doneValue` 鐪熸満璇诲埌**锛歚{"exitCode":1,"signal":null}`銆乣handleKeys` 鍚?`done/terminate/waitForExit` 鈬?閫氶亾鏄€氱殑锛?*`lean.js` 鍗磋 `r.exitCode` 鑰?`host-spawn` 杩斿洖 `{code}`** 鈬?涓€琛屽瓧娈靛悕缂洪櫡銆?- **鍙屼繚闄?*锛歚lean.js` 璇?`r.exitCode ?? r.code`锛沗host-spawn` 鍚屾椂杩斿洖 `code` 涓?`exitCode`锛涗袱绉嶅舰鐘堕兘鏂█鍒?`EXIT_NONZERO`銆?- **`lean_job` view** 澧?`stdoutTail`锛廯stderrTail`锛堝悇鎴?2000锛夛紱`EXIT_NONZERO` message 甯?stderr 灏鹃儴锛?*鍙繘 job view锛屼笉杩?status**銆?- **`step` 鍥炴墽** 澧?`instructionDelivered`锛堟鍓嶅彧鏈?`run` 鏈夛級銆?- **绱ф€ユ秷鎭?UX**锛氱揣鎬ユ鏂囪繘鎻愮ず璇嶄絾**涓嶅啀 ack**锛涙潯鐩暀鍦ㄤ俊绠憋紝`list` 鐨?N 涓庢彁绀鸿瘝涓€鑷达紝`open` 璇绘鏂囷紝`ack` 鏄惧紡缁撶畻銆?
---

## 搂6 鐪熸満璇佹嵁锛堥€愭潯鍘熸枃锛涙潵婧愯鏍囨敞锛?
> 鈽?浠ヤ笅 1鈥? 鏉℃潵鑷?*鏈細璇濈殑鐪熸満鎶ュ憡**锛涗粨搴撳唴**鏃犳硶澶嶇幇**鐪熸満璇锋眰锛屾晠涓嶆妸瀹冧滑鏍囨垚鈥滃凡浠庝粨搴撳懡浠ゆ牳鍒扳€濄€傝兘鍦ㄤ粨搴撻噷鏍稿埌鐨勶紝鍙︽敞娴嬭瘯/鏂囦欢銆?
1. **闈炵揣鎬ユ彁绀鸿瘝鍘熸枃**锛堢湡鏈烘姤鍛婏級锛?   `銆愪俊绠便€戜綘鏀跺埌 1 鏉℃柊鐣欒█锛堟潵鑷?office锛夈€傛爣棰橈細闈炵揣鎬ヨ繘灞曞悓姝?A7銆備笉闇€瑕佺珛鍗抽槄璇伙紝鏈夌┖鍐嶇湅锛涚敤 list 鏌ョ湅銆乷pen 鎵撳紑銆俙
   姝ｆ枃鏍囪 `闈炵揣鎬ユ鏂?涓嶅簲杩涙彁绀鸿瘝-K9Q` 鍦ㄦā鍨嬪彲瑙佹枃鏈?**0 鍛戒腑**锛屽彧鍑虹幇鍦?`open` 鐨勫伐鍏峰洖鎵с€?2. **绱ф€ユ彁绀鸿瘝鍘熸枃**锛堢湡鏈烘姤鍛婏級锛?   `銆愪俊绠便€戙€愮揣鎬ワ綔瀵规柟甯屾湜灏藉揩鍥炲銆? 鏉＄暀瑷€鈥?绱ф€ユ鏂囷細鈥﹁灏藉揩鍦ㄧ嚎鍥炲涓€鍙ョ‘璁ゃ€俙
3. **list鈫抩pen鈫掍簩娆?list鈫抦ark鈫抣ist 鍏ㄩ摼**锛堢湡鏈烘姤鍛婏級锛歭ist 8 瀛楁鏃犳鏂?鈬?open 缁欐鏂囧苟 `read:true` 鈬?`mark todo` 鈬?鏈 list 瑙?`read:true, todo:true`銆?4. **鍚屾簮鍧楄繘璇锋眰**锛堢湡鏈烘姤鍛婏級锛氬洓鍥炲悎鍧楀悕 == header锛坄vibe_v5_inbox`锛廯vibe_v5_inbox`锛廯vibe_v5_record_progress`锛廯vibe_v5_wait`锛夛紝妯″瀷 thinking 寮曠敤浜嗗畠銆?5. **Lean 澶辫触灞傛鍓嶇Щ**锛堢湡鏈烘姤鍛婏級锛歚FILE_UNREADABLE` 鈫?鏂囦欢璇诲埌 鈫?`EXIT_UNOBSERVED`锛涘師鏂?`resolved="D:\\.elan\\bin\\lean.EXE"`銆乣hadHandle:true`銆乣exitCode:null`銆佸洓涓?error 鍏?null銆?6. **`wait` 2000ms 琚纭嫆**锛堢湡鏈烘姤鍛婏級锛氫綆浜庝笅闄?10000ms锛岃繑鍥炲叿鍚?`VMU_ACTIVITY_INVALID_TIMEOUT`锛堜粨搴撳唴 `TIMEOUT_BOUNDS` 鍙牳鍒?`[10000, 3600000]`锛夈€?
> 鈽?**鏃犳硶浠庝粨搴?鍛戒护鏍稿埌鐨?*锛毬? 鐨?1鈥? 鍏ㄩ儴鏄?*鐪熸満浼氳瘽鏂囨湰**锛涗粨搴撳彧鑳芥牳鍒颁骇鐢熷畠浠殑鏈哄埗锛坄kernel/mailbox.js`銆乣host.js` 鐨?`v5r-mail-notice`銆乣kernel/lean.js` 鐨?`doneValue` 瀛楁銆乣kernel/activity.js` 鐨?`TIMEOUT_BOUNDS`锛夈€傛湰鍗锋妸鏉ユ簮鍐欏湪姝ゅ锛岄伩鍏嶈鑰呰浠ヤ负杩欎簺鍘熸枃鍙粠 `regen --check` 寰楀埌銆?
---

## 搂7 鐩爣瀵硅处锛堟寜褰撳墠瀹為檯鐘舵€侊級

| 鈽?# | 鈽?鐩爣 | 鈽?璇佹嵁 | 鈽?鐘舵€?|
|---|---|---|---|
| 1 | PTC 鏀跺彛 | v5r 鏃?`ptc`锛沗promptAck` 鍦?`validatePack`/apply 鐢熸晥锛?8/38 wire 鍚屾簮鏂█ | 鉁?|
| 2 | Lean 鐪熸満鍙敤 | 鏂囦欢璇诲埌銆佸懡浠よВ鏋愩€佸彞鏌勫惎鍔紱**`EXIT_UNOBSERVED` 鐨?`doneValue` 鐪熸満鍊煎皻鏈鍒?* | 馃煛 |
| 3 | 鏁板鐜閫傞厤 | `vmu.env.needs` 22 椤癸紱`vibe_vmu_env` probe/list/report锛沞nv probe 甯?`timeoutMs/graceMs`锛涙簮鐮佹帰閽堟棤瀹夎/缃戠粶 | 鉁咃紙probe 鐪熸満寰呬笅涓€杞級 |
| 4 | 淇＄鍒嗙骇璇箟 | 闈炵揣鎬?绱ф€ョ湡鏈哄師鏂囷紱`entries:[]`锛沗read`/`ack` 鍒嗙锛沴ist鈫抩pen鈫抦ark 鍏ㄩ摼 | 馃煛锛坄wait`/鍞ら啋鏁撮摼浠嶆湭楠岋級 |
| 5 | 鍙瑙?| `scripts/slv-inspect.mjs` 涓€鏉″懡浠?+ 鍙屽悜宸泦锛沗sessions-r6` 0 RED | 鉁?|
| 6 | 鎸佺画璁板綍 | 鏈嵎 | 鉁?|

---

## 搂8 鏈樁娈垫渶璐电殑浜旀潯鏁欒

1. **鈥滆浜嗗€尖€濃墵鈥滅敓鏁堜簡鈥濈殑鏂板彉浣?*锛?   鍊艰浜嗕絾**鍙傛暟娌′紶**锛坄why` 涓嶅湪 `assemble` 鍙傛暟閲岋級锛?*缂洪敭琚潤榛樺墺鎺?*锛坄urgent`锛夛紡**闄堟棫鏄惧紡鍊肩洊浣忛粯璁?*锛坄urgentKinds`锛夛紡**鏈哄埗鏈変絾闆惰皟鐢ㄨ€?*锛坄mailbox.flush`锛夈€?   鈬?姣忎竴绉嶉兘蹇呴』**璇诲洖纭**锛屼笉鑳藉彧淇♀€滄垜璁句簡鈥濄€?2. **閿欑殑鍚嶆瘮涓嶅悕鏇寸碂**鐨勬柊瀹炰緥锛?   `NOT_CALLED`锛堝瓧娈垫槑鏄庣粰浜嗭級鈬?鏀?`NOT_APPLICABLE`锛?*涓斺€滃寘瑁呬竴涓爜鈥濆繀椤讳繚浣忓師鍥?*锛坢essage 閲屽甫 meeting 閿欙紝`cause` 淇濈暀锛夈€?3. **璇婃柇闈㈡湰韬睘浜庤娴嬬郴缁?*鐨勬柊瀹炰緥锛?   `slv-inspect` 鎶ヤ簡**鍋囩孩**锛堝彧璇荤敤鎴锋秷鎭紝娌″苟鍏?`system-prompt` 杩藉姞娑堟伅锛夆噿 **瀹冭嚜宸变篃瑕佹湁 selftest 锛?鏃ф牸寮忔爣 INFO**銆?4. **鎵弿鍣ㄤ細鈥滅┖杩団€?*锛?   涓夋潯鍋囬槾鎬э細鍙暟 `name(` 婕忓洖璋冦€佹鍒欏悆鍏ㄨ鎷彿銆佸彧鏀?`.js` 鈬?**鈥滄姤 0鈥濅箣鍓嶅繀椤诲厛璇佹槑鍒ゆ嵁鑳藉懡涓?*锛堟瘡涓帰閽堝甫 `--selftest`锛夈€?5. **鎴戜滑鐨勭粨璁轰細琚祴閲忔帹缈?*锛?   **娌欑缁撹锛圧1 涓嬨€丷6 缈伙級** 鈬?**璁颁笅鏉ワ紝鍒綋鑰昏颈**锛涙祴閲忔帹缈荤粨璁烘鏄湰浠撶殑鍙潬鏉ユ簮銆?
---

## §9 ★★★★ 收尾：★ 六个目标全部达成（★ 含两次"被测量推翻后重定"）

### ★★★★★ Lean 端到端通过（★ 真机 1021-140824，223s）
```
Probe.lean（合法、无 BOM）:
  lean_run  ⇒ {"ok":true,"job":{"ok":true,"id":"lean-1","state":"settled","sync":true}}
  lean_job  ⇒ {"exitCode":0,"hashUnchanged":true,"passed":true,"attempts":1,"hadHandle":true,"code":null}
Broken.lean（语法错、无 BOM）:
  lean_job  ⇒ {"exitCode":1,"passed":false,"code":"VMU_LEAN_EXIT_NONZERO",
               "message":"Lean 退出码 1（stderr 为空）",
               "stdoutTail":"Formal/Broken.lean:2:0: error: unexpected end of input\n"}
种文件字节自检: first4=[74 68 65 6F] ("theo") ⇒ 无 EF BB BF BOM
```
★★★ **"配好了就能直连"成立**：★ **无需任何逐次授权、★ 无需放宽沙箱**（★ 本就 `danger-full-access`，★ 由 delegation 继承）⇒ ★ **只需 `vmu.math.leanCommand` 指对 ＋ 宿主可执行** ✓
★★ **一条如实更正**：★ **编译器的诊断落在此 spawn 的 `stdoutTail`，★ `stderrTail` 是空串** ⇒ ★ **"能看到编译器原话"成立，★ 但"在 stderr 里"不成立**（★ 不同编译器/平台会不同，★ 两个 tail 都暴露才稳）✓

### ★★★★ 而它一路的失败层次（★ 五次前移，★ 每次都是不同层）
| ★ 层 | ★ 症状 | ★ 真因 |
|---|---|---|
| 1 | ★ `hadHandle:true, exitCode:null`，★ 三个 error 全 null | ★ **诊断字段全缺** ⇒ 加 `resolved/doneError/pathPrefix/doneValue/handleKeys` |
| 2 | ★ `VMU_LEAN_FILE_UNREADABLE` | ★ **`readHash` 用进程 cwd，★ 文档说 root** |
| 3 | ★ `EXIT_UNOBSERVED`（★ 文件读到了） | ★ **`host-spawn` 回 `code`，★ `kernel/lean.js` 读 `exitCode`** |
| 4 | ★ 合法文件也 rc=1 | ★ **夹具 `Set-Content -Encoding utf8` 在 PS 5.1 下写 BOM**，★ Lean 拒绝 |
| 5 | ★ 通过 | ★—— |

★★★ **教训**：★ **"同一个症状"掩盖了四个不同层的问题** ⇒ ★ **每修一层就前移一层** ⇒ ★ **所以"具名拒 ＋ 把原始值打出来"是唯一的推进方式，★ 猜只会原地打转** ✓

### ★★★★ 信箱分级与 wait（★ 真机）
★ **非紧急**：★ 提示词 `【信箱】你收到 1 条新留言（来自 office）。标题：非紧急进展同步-R10。不需要立即阅读，有空再看；…` ⇒ ★ **正文标记 `非紧急正文-R10-N1` 在成员会话 0 命中** ＋ ★ `list` `count=1` ✓
★ **紧急**：★ 提示词 `【信箱】【紧急｜对方希望尽快回复】1 条留言…` ＋ `紧急正文：…请尽快在线回复一句确认。` ⇒ ★ **`list` `count=1`** ＋ ★ **`open` 给正文、`read:true`** ⇒ ★ **"提示词说的 N == list 的 count"**（★ 这是"紧急投递不再 ack"修复后的新判据）✓
★ **`wait`**：★ `{"ok":true,"action":"wait","timedOut":true,"waitedMs":10001,"timeoutMs":10000,"clamped":false}` ✓
★ **`instructionDelivered:true`** 现在从回执可读（★ 上轮只有提示词证据）✓

### ★ 目标对账（★ 最终）
| # | ★ 目标 | ★ 状态 | ★ 证据 |
|---|---|---|---|
| 1 | ★ PTC 收口 | **✅** | ★ v5r 无 `ptc`；★ `promptAck` 机制；★ wire 同源断言 |
| 2 | ★ Lean 真机可用 | **✅** | ★ **`passed:true/exitCode:0`** ＋ ★ Broken `EXIT_NONZERO` ＋ 编译器原话 |
| 3 | ★ 数学环境适配 | **✅** | ★ 22 项 needs；★ `vibe_vmu_env` 三动作；★ probe 带 `timeoutMs/graceMs`；★ 不安装不联网 |
| 4 | ★ 信箱分级 ＋ wait | **✅** | ★ 非紧急无正文／紧急带正文；★ N==count；★ list→open→mark 全链；★ wait 10001ms |
| 5 | ★ 可检视 | **✅** | ★ `slv-inspect` 一条命令；★ **`sessions-r10` 0 RED** |
| 6 | ★ 门禁 ＋ 真机 | **✅** | ★ 全量 T1 391/391 |
