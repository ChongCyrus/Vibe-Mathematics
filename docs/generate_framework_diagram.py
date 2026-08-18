# -*- coding: utf-8 -*-
"""Generate the Vibe Math framework diagram (架构图) as a PNG poster.
Output: 示例图/框架图.png   (run from anywhere: python docs/generate_framework_diagram.py)
Layout: left = 4-stage pipeline (交互/调度/子代理·求解/子代理·验证/沉淀回写),
        right = 数据层 boxes aligned by stage, all arrows vertical/horizontal/diagonal-in-gap.
"""
import matplotlib
matplotlib.use("Agg")
import os
import matplotlib.pyplot as plt
from matplotlib.patches import FancyBboxPatch, Rectangle, FancyArrowPatch

plt.rcParams["font.sans-serif"] = ["Microsoft YaHei", "SimHei"]
plt.rcParams["axes.unicode_minus"] = False

BASE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.dirname(BASE)
OUT = os.path.join(ROOT, "示例图", "框架图.png")

fig = plt.figure(figsize=(18, 11.5))
ax = fig.add_axes([0, 0, 1, 1])
ax.axis("off")
ax.set_xlim(0, 18)
ax.set_ylim(0, 11.5)

def box(x0, y0, w, h, fc, ec="#37474F", lw=1.6, rounding=0.16, z=3):
    ax.add_patch(FancyBboxPatch((x0, y0), w, h,
                 boxstyle=f"round,pad=0.10,rounding_size={rounding}",
                 facecolor=fc, edgecolor=ec, linewidth=lw, zorder=z))

def txt(cx, cy, s, fs=11, color="#263238", weight="normal", z=5, rot=0):
    ax.text(cx, cy, s, ha="center", va="center", fontsize=fs, color=color,
            fontweight=weight, linespacing=1.45, zorder=z, rotation=rot)

def arrow(x1, y1, x2, y2, label=None, lx=0, ly=0.24, ls=9.5, rad=0.0,
          style="->", lw=1.8, color="#455A64", dashed=False, z=4):
    ax.add_patch(FancyArrowPatch((x1, y1), (x2, y2), arrowstyle=style,
                 mutation_scale=17, linewidth=lw, color=color, zorder=z,
                 connectionstyle=f"arc3,rad={rad}",
                 linestyle="--" if dashed else "-"))
    if label:
        ax.text((x1 + x2) / 2 + lx, (y1 + y2) / 2 + ly, label, fontsize=ls,
                ha="center", va="center", color="#333",
                bbox=dict(fc="white", ec="none", alpha=0.85, pad=1.0), zorder=6)

def band(x0, y0, x1, y1, fc, title, tc="#607D8B"):
    ax.add_patch(Rectangle((x0, y0), x1 - x0, y1 - y0, facecolor=fc,
                           edgecolor="none", alpha=0.5, zorder=1))
    # title pinned to the band's top-left corner, drawn ABOVE the boxes, with a
    # white backing so it is never obscured by the rectangles
    ax.text(x0 + 0.35, y1 - 0.12, title, fontsize=11.5, color=tc,
            fontweight="bold", ha="left", va="top", zorder=6,
            bbox=dict(fc="white", ec="none", alpha=0.85, pad=1.2))

# ── title ────────────────────────────────────────────────────────────────
ax.text(9, 11.12, "Vibe Math — 多代理数学问题求解与验证框架", fontsize=22,
        ha="center", va="center", color="#1A237E", fontweight="bold")
ax.text(9, 10.66, "广度探索 → 深度迭代 → 交叉验证 → 知识沉淀   ·   一个主代理 + 一个代码调度器 + 五类子代理",
        fontsize=11, ha="center", va="center", color="#555")

# ── layer bands ──────────────────────────────────────────────────────────
band(0.3, 9.45, 17.7, 10.45, "#E3F2FD", "交互层")
band(0.3, 7.70, 17.7, 8.95, "#FFF8E1", "调度层")
band(0.3, 5.95, 17.7, 7.20, "#E8F5E9", "子代理层 · 方向求解")
band(0.3, 4.20, 17.7, 5.45, "#E8F5E9", "子代理层 · 交叉验证")
band(0.3, 1.50, 17.7, 3.70, "#F3E5F5", "沉淀与回写层")

# ── left pipeline (x 1.0–8.0) ────────────────────────────────────────────
box(1.0, 9.60, 7.0, 0.75, "#BBDEFB")
txt(4.5, 9.98, "用户 · 主代理（助手 + 汇报者）\n自然语言 · 翻译需求/汇报/配置 · 不求解不调度", fs=11)
box(1.0, 7.85, 7.0, 0.95, "#FFE0B2")
txt(4.5, 8.33, "调度器 Scheduler（插件代码）\n唯一文件写者 · 读 qs.csv · 派发子代理 · 推进状态机", fs=11)
box(1.0, 6.10, 7.0, 0.95, "#C8E6C9")
txt(4.5, 6.58, "Brainstorm → Solver × N\n拆多个方向 · 逐方向多轮迭代 · 卡死→Derive 派生新方向", fs=11)
box(1.0, 4.35, 7.0, 0.95, "#C8E6C9")
txt(4.5, 4.83, "Verifier × ≥3（独立严苛审稿人）\n独立审查 → 辩论 → 裁决（一票否决 / 加权投票）", fs=11)
box(1.0, 2.60, 7.0, 0.95, "#C8E6C9")
txt(4.5, 3.08, "Verified 晋升 → Decider\n可信知识库 · 判定是否解决 → 回写 qs.csv(solved)", fs=11)

# ── right data boxes (x 10.2–17.0) ───────────────────────────────────────
box(10.2, 7.85, 6.8, 0.95, "#E1BEE7")
txt(13.6, 8.33, "VibeMath_State/ · Progress_Logs/\n断点落盘 · resume 续跑", fs=10.5)
box(10.2, 6.10, 6.8, 0.95, "#E1BEE7")
txt(13.6, 6.58, "Pending_Verification/\nSolver 原始输出（待验证）", fs=10.5)
box(10.2, 4.35, 6.8, 0.95, "#E1BEE7")
txt(13.6, 4.83, "Under_Verification/\n拆解后的最小验证单元", fs=10.5)
box(10.2, 2.90, 6.8, 0.70, "#E1BEE7")
txt(13.6, 3.25, "Temp_Validated/\n裁决通过 · 待晋升", fs=10)
box(10.2, 1.60, 6.8, 0.70, "#E1BEE7")
txt(13.6, 1.95, "qs.csv\n问题清单 + 状态（solved 回写）", fs=10)

# ── pipeline arrows ──────────────────────────────────────────────────────
arrow(4.5, 9.60, 4.5, 8.80, "vibe_math_* 工具", ly=0.26)
arrow(4.5, 7.85, 4.5, 7.05, "① 派发 · ② 每方向一个", ly=0.24)
arrow(4.5, 6.10, 4.5, 5.30, "④ 拆单元 · ⑤ 派发 ≥3 验证器", ly=0.24)
arrow(4.5, 4.35, 4.5, 3.55, "⑥ 通过 → ⑦ 晋升 → ⑧ 判定", ly=0.24)
arrow(0.55, 3.08, 0.55, 8.33, "读取 / 回写 qs.csv", lx=0.85, ly=0)

# ── horizontal stage↔data links ──────────────────────────────────────────
arrow(8.0, 8.33, 10.2, 8.33, "状态落盘 / 恢复", ly=0.28, style="<|-|>")
arrow(8.0, 6.58, 10.2, 6.58, "③ 写盘（唯一写者）", ly=0.28)
arrow(13.6, 6.10, 13.6, 5.30, "④ 拆解为最小验证单元", lx=0.0, ly=-0.24)
arrow(10.2, 4.83, 8.0, 4.83, "⑤ 派发验证", ly=0.28)

# ── 沉淀回写 links ───────────────────────────────────────────────────────
arrow(7.9, 4.60, 10.3, 3.25, "⑥ 裁决通过", ly=0.24, rad=-0.1)
arrow(10.2, 3.25, 8.1, 3.08, "⑦ 晋升 Verified", ly=0.26)
arrow(7.6, 2.60, 10.4, 2.30, "⑨ 已解决 → 回写", ly=0.24, rad=-0.1)

# ── feature strip ────────────────────────────────────────────────────────
feat = ["断点续跑（vibe_math_resume）", "中途人工干预（auto / manual 随时切换）",
        "唯一写者 · 临时原子交换", "按项目隔离（Projects/<项目>/）"]
fx = [0.8, 5.0, 9.2, 13.4]
for x0, s in zip(fx, feat):
    box(x0, 0.40, 3.8, 0.72, "#ECEFF1", lw=1.2, rounding=0.2)
    txt(x0 + 1.9, 0.76, s, fs=9.5)

plt.savefig(OUT, dpi=170, bbox_inches="tight", facecolor="white")
print("saved " + OUT)
