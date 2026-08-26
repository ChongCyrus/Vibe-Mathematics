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
    ax.add_patch(FancyBboxPatch((x, y), w, h, boxstyle='round,pad=0.06', fc=fc, ec=ec, lw=1.5))
    ax.text(x + w/2, y + h - 0.5, title, ha='center', va='center', fontsize=fs, weight='bold', color=tc)
    if sub:
        ax.text(x + w/2, y + h/2 - 0.55, sub, ha='center', va='center', fontsize=sfs, color=tc)

def arrow(x1, y1, x2, y2, both=True, color='#666'):
    ax.add_patch(FancyArrowPatch((x1, y1), (x2, y2), arrowstyle='<->' if both else '->', mutation_scale=11, color=color, lw=1.1))

ax.text(W/2, H-0.35, 'Vibe Math V4 —— 常驻自组织合作研究（框架=媒介，绝不指派任务）', ha='center', fontsize=14, weight='bold', color='#123')

# ---- residents row (top, 4 cards, centered) ----
res = [('R-1', '方向A'), ('R-2', '方向B'), ('R-3', '方向C'), ('R-4', '…')]
rw = 2.7; rgap = 0.55; rx0 = (W - (4*rw + 3*rgap))/2
ry = 6.4; rh = 1.35
res_x = []
for i,(nm,d) in enumerate(res):
    x = rx0 + i*(rw+rgap); res_x.append(x)
    card(x, ry, rw, rh, '常驻 '+nm, 'continuable · 持久上下文', fc='#fdf6d8', ec='#c90', tc='#6b3')
ax.text(W/2, ry - 0.52, '—— 互相留言 / 开会，自主决定一切任务分配（无中央调度）——', ha='center', fontsize=9, color='#a60', weight='bold')

# ---- framework band (middle, container with 4 function chips) ----
band_y = 3.2; band_h = 2.2; band_x = 0.6; band_w = W-1.2
ax.add_patch(FancyBboxPatch((band_x, band_y), band_w, band_h, boxstyle='round,pad=0.1', fc='#eaf3ff', ec='#08b', lw=1.5, alpha=0.9))
ax.text(band_x + band_w/2, band_y + band_h - 0.42, '框架 vibe-v4 —— 媒介 / 沉淀 / 共识 / 上下文', ha='center', fontsize=10.5, weight='bold', color='#045')
chips = [('消息总线·邮件箱', '常驻间互通'), ('会议 / 辩论', '协调·分工·表决'), ('任务板', '认领·指派（只搬运）'), ('共识验证', '全票才定论 · compact')]
cw = band_w/4 - 0.4; cy = band_y + 0.34; chh = band_h - 1.25
for i,(t,s) in enumerate(chips):
    cx = band_x + 0.25 + i*(band_w/4)
    card(cx, cy, cw, chh, t, s, fc='#ffffff', ec='#08b', fs=9, sfs=7.5, tc='#036')
card(band_x + band_w/2, band_y + 0.07, band_w/2, 0.44, '产物沉淀（按常驻 id 归属）+ 断点续跑', sub='', fc='#ffffff', ec='#08b', fs=8, tc='#036')

# ---- knowledge row (bottom, 3 groups centered) ----
kb = [('常驻专属库', 'Progress | Propos\nMethods | Subproblems\n按 <常驻id>/ 隔离'), ('共享 / 协作', 'Shared/ 会议·任务板·辩论'), ('定论 / 问题', 'Verified/（仅全票只读）\nProblems/ 原问题')]
kw = 4.6; kgap = 0.7; kx0 = (W - (3*kw + 2*kgap))/2
ky = 0.8; kh = 1.7
kb_x = []
for i,(t,s) in enumerate(kb):
    x = kx0 + i*(kw+kgap); kb_x.append(x)
    card(x, ky, kw, kh, t, s, fc='#f0f6ee', ec='#3a6', tc='#142')

# ---- arrows: residents <-> framework band, band <-> knowledge ----
for x in res_x:
    arrow(x + rw/2, ry, x + rw/2, band_y + band_h)
for x in kb_x:
    arrow(x + kw/2, band_y, x + kw/2, ky + kh)

# small labels
ax.text(W/2, ry-0.62, '常驻之间互相阅读对方的库（只读）', ha='center', fontsize=8, color='#999')
plt.tight_layout(); plt.savefig('示例图/框架图-v4.png', bbox_inches='tight', dpi=200)
print('saved 示例图/框架图-v4.png (v2 layout)')
