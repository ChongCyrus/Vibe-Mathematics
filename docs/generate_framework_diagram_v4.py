from matplotlib import pyplot as plt
from matplotlib.patches import FancyBboxPatch, FancyArrowPatch
import matplotlib
for f in ['Microsoft YaHei', 'SimHei', 'WenQuanYi Zen Hei', 'Noto Sans CJK SC', 'Arial Unicode MS']:
    try:
        matplotlib.rcParams['font.sans-serif'] = [f]; matplotlib.rcParams['axes.unicode_minus'] = False; break
    except Exception:
        continue

W = 16; H = 9
fig, ax = plt.subplots(figsize=(W, H), dpi=200)
ax.axis('off'); ax.set_xlim(0, W); ax.set_ylim(0, H)

def card(x, y, w, h, title, sub='', fc='#eef', ec='#38b', fs=9, sfs=7.5, tc='#123'):
    # title sits near the top, sub just below it, BOTH inside the box (never overflow)
    ax.add_patch(FancyBboxPatch((x, y), w, h, boxstyle='round,pad=0.06', fc=fc, ec=ec, lw=1.5))
    if sub:
        ax.text(x + w/2, y + h - 0.42, title, ha='center', va='center', fontsize=fs, weight='bold', color=tc)
        ax.text(x + w/2, y + h - 0.95, sub, ha='center', va='center', fontsize=sfs, color=tc)
    else:
        ax.text(x + w/2, y + h/2, title, ha='center', va='center', fontsize=fs, weight='bold', color=tc)

def arrow(x1, y1, x2, y2, both=True, color='#666'):
    ax.add_patch(FancyArrowPatch((x1, y1), (x2, y2), arrowstyle='<->' if both else '->', mutation_scale=11, color=color, lw=1.1))

# ---- title + subtitle (both ABOVE the resident row, so no arrow crosses them) ----
ax.text(W/2, H - 0.32, 'Vibe Math V4 —— 常驻自组织合作研究（框架=媒介，绝不指派任务）', ha='center', fontsize=14, weight='bold', color='#123')
ax.text(W/2, H - 0.78, '常驻互相留言 / 开会，自主决定一切任务分配（无中央调度）· 可互相阅读对方库（只读）', ha='center', fontsize=9.5, color='#a60', weight='bold')

# ---- residents row (top, 4 cards, centered) ----
res = [('R-1', '方向A'), ('R-2', '方向B'), ('R-3', '方向C'), ('R-4', '…')]
rw = 2.6; rgap = 0.6; rx0 = (W - (4*rw + 3*rgap))/2
ry = 6.7; rh = 1.4
res_x = []
for i,(nm,d) in enumerate(res):
    x = rx0 + i*(rw+rgap); res_x.append(x)
    card(x, ry, rw, rh, '常驻 '+nm, 'continuable · 持久上下文', fc='#fdf6d8', ec='#c90', tc='#6b3')

# ---- framework band (middle): 5 capability chips + a bottom strip ----
band_x = 0.5; band_w = W - 1.0; band_y = 3.6; band_h = 2.4   # 3.6 .. 6.0
ax.add_patch(FancyBboxPatch((band_x, band_y), band_w, band_h, boxstyle='round,pad=0.1', fc='#eaf3ff', ec='#08b', lw=1.5, alpha=0.9))
ax.text(band_x + band_w/2, band_y + band_h - 0.36, '框架 vibe-v4 —— 媒介 / 沉淀 / 共识 / 上下文', ha='center', fontsize=10.5, weight='bold', color='#045')
chips = [('消息总线·邮件箱', '常驻间互通'), ('会议 / 辩论', '协调·分工·表决'), ('任务板', '认领·只搬运'), ('共识验证', '全票才定论'), ('上下文 · /compact', '达阈值自动压缩')]
cw = band_w/5 - 0.35; cy = band_y + 0.80; chh = 1.05   # chips: 4.4 .. 5.45
for i,(t,s) in enumerate(chips):
    cx = band_x + 0.20 + i*(band_w/5)
    card(cx, cy, cw, chh, t, s, fc='#ffffff', ec='#08b', fs=9, sfs=7.5, tc='#036')
# bottom capability strip (properly inside the band, below the chips)
strip_y = band_y + 0.18; strip_h = 0.55; strip_w = band_w * 0.72
card(band_x + (band_w - strip_w)/2, strip_y, strip_w, strip_h, '产物沉淀（按常驻 id 归属） · 断点续跑 · 可人工干预', sub='', fc='#ffffff', ec='#08b', fs=8.5, tc='#036')

# ---- knowledge row (bottom, 3 groups centered) ----
kb = [('常驻专属库', 'Progress | Propos\nMethods | Subproblems\n按 <常驻id>/ 隔离'), ('共享 / 协作', 'Shared/ 会议·任务板·辩论'), ('定论 / 问题', 'Verified/（仅全票只读）\nProblems/ 原问题')]
kw = 4.4; kgap = 0.8; kx0 = (W - (3*kw + 2*kgap))/2
ky = 0.7; kh = 1.7
kb_x = []
for i,(t,s) in enumerate(kb):
    x = kx0 + i*(kw+kgap); kb_x.append(x)
    card(x, ky, kw, kh, t, s, fc='#f0f6ee', ec='#3a6', tc='#142')

# ---- arrows: residents <-> framework band, band <-> knowledge ----
for x in res_x:
    arrow(x + rw/2, ry, x + rw/2, band_y + band_h)
for x in kb_x:
    arrow(x + kw/2, band_y, x + kw/2, ky + kh)

plt.tight_layout(); plt.savefig('示例图/框架图-v4.png', bbox_inches='tight', dpi=200)
print('saved 示例图/框架图-v4.png (v3 layout)')
