# -*- coding: utf-8 -*-
"""Generate the Vibe Math V3 framework diagram (架构图) as a PNG poster.
Output: 示例图/框架图-v3.png   (run from anywhere: python docs/generate_framework_diagram_v3.py)
Layout: left = pipeline (交互/调度·规划/方向求解/交叉验证/方法沉淀/收口), right = md 知识库数据层.
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
OUT = os.path.join(ROOT, "示例图", "框架图-v3.png")

fig = plt.figure(figsize=(18, 12))
ax = fig.add_axes([0, 0, 1, 1])
ax.axis("off")
ax.set_xlim(0, 18)
ax.set_ylim(0, 12)

def box(x0, y0, w, h, fc, ec="#37474F", lw=1.6, rounding=0.16, z=3):
    ax.add_patch(FancyBboxPatch((x0, y0), w, h,
                 boxstyle=f"round,pad=0.10,rounding_size={rounding}",
                 facecolor=fc, edgecolor=ec, linewidth=lw, zorder=z))

def txt(cx, cy, s, fs=11, color="#263238", weight="normal", z=5):
    ax.text(cx, cy, s, ha="center", va="center", fontsize=fs, color=color,
            fontweight=weight, linespacing=1.45, zorder=z)

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
    ax.text(x0 + 0.35, y1 - 0.12, title, fontsize=11.5, color=tc,
            fontweight="bold", ha="left", va="top", zorder=6,
            bbox=dict(fc="white", ec="none", alpha=0.85, pad=1.2))

# ── title ────────────────────────────────────────────────────────────────
ax.text(9, 11.70, "Vibe Math V3 — 多代理数学研究与验证框架（论文式 md + 规划代理 + 方法库）", fontsize=20,
        ha="center", va="center", color="#1A237E", fontweight="bold")
ax.text(9, 11.28, "Markdown 知识库（软规范锚点 + 自由叙述）  ·  规划代理自主制定 N 步计划  ·  方法库沉淀理论/框架/工具/方法/思想",
        fontsize=10.5, ha="center", va="center", color="#555")

# ── layer bands ──────────────────────────────────────────────────────────
band(0.3, 10.20, 17.7, 11.05, "#E3F2FD", "交互层")
band(0.3, 8.45, 17.7, 9.80, "#FFF8E1", "调度层 · 插件代码 + 规划代理")
band(0.3, 6.70, 17.7, 8.00, "#E8F5E9", "子代理层 · 方向求解")
band(0.3, 5.00, 17.7, 6.30, "#E8F5E9", "子代理层 · 交叉验证")
band(0.3, 3.30, 17.7, 4.60, "#E8F5E9", "子代理层 · 方法沉淀")
band(0.3, 1.40, 17.7, 3.10, "#F3E5F5", "收口 · 回写 · 数据层（md 知识库）")

# ── left pipeline (x 1.0–8.0) ────────────────────────────────────────────
box(1.0, 10.32, 7.0, 0.72, "#BBDEFB")
txt(4.5, 10.68, "用户 · 主代理（助手 + 汇报者）\n自然语言 · 翻译需求/汇报/配置 · 不求解不调度", fs=11)
# 调度层：调度器 + 规划代理（并排，中间留通道放「状态简报 ⇄ 计划 JSON」）
box(1.0, 8.58, 3.0, 1.08, "#FFE0B2")
txt(2.5, 9.12, "调度器（插件代码）\n唯一物理写者 · 锚点索引/结构性移动\n守硬约束（并发/幂等/已验证不再调度）", fs=10.5)
box(5.9, 8.58, 2.1, 1.08, "#FFE0B2")
txt(6.95, 9.12, "规划代理 Planner\n读状态简报 → 一次安排 N 步计划", fs=10.5)
box(1.0, 6.82, 7.0, 1.06, "#C8E6C9")
txt(4.5, 7.35, "Explorer → Solver × N\n拆方向（全死路→重派生，旧方向日志归档）· 逐方向多轮迭代 · 上报 methods_used/new_inventions", fs=11)
box(1.0, 5.12, 7.0, 1.06, "#C8E6C9")
txt(4.5, 5.65, "Verifier × ≥3（严苛审稿人）\n独立审查 → 辩论（交流群）→ 近共识裁决（同侧均值≥0.85/≤0.15 取均值）", fs=11)
box(1.0, 3.42, 7.0, 1.06, "#C8E6C9")
txt(4.5, 3.95, "Method Keeper（方法整理代理）\n提炼新方法卡 · 合并碎片 · 完善体系（上级体系/子方法）· 维护可信断言", fs=11)
box(1.0, 1.52, 7.0, 1.06, "#C8E6C9")
txt(4.5, 2.05, "收口 · 可信铁律\n概率=1 → Verified/ 卡（只读绝对可信）· 仅 Verified/ 与验证判真/假可信", fs=11)

# ── right md knowledge base (x 10.4–17.0) ─────────────────────────────────
box(10.4, 8.70, 6.6, 0.86, "#E1BEE7")
txt(13.7, 9.13, "Problems/（问题清单 · 每问题一个 md）\n陈述/状态/优先级/依赖/被依赖/来源·动机/计划/解法候选", fs=10)
box(10.4, 6.94, 6.6, 0.86, "#E1BEE7")
txt(13.7, 7.37, "Progress/（研究日志 · 每问题一个 md）\n方向×轮次叙事 · 旧方向归档「已归档方向」", fs=10)
box(10.4, 5.24, 6.6, 0.86, "#E1BEE7")
txt(13.7, 5.67, "Propos/（命题库 · 每命题一个 md）\n陈述/概率/证明·证伪尝试/依赖", fs=10)
box(10.4, 3.54, 6.6, 0.86, "#E1BEE7")
txt(13.7, 3.97, "Methods/（通用理论发明库）+ 全局 VibeMath/Methods/\n理论体系·框架·工具·方法·思想 · 应用记录/改进历史/可信断言", fs=10)
box(10.4, 2.10, 3.2, 0.82, "#E1BEE7")
txt(12.0, 2.51, "Verified/\n绝对可信（只读）", fs=10)
box(13.9, 2.10, 3.1, 0.82, "#E1BEE7")
txt(15.45, 2.51, "Logs/ · State/\n辩论/计划审计 · 私有状态", fs=10)

# ── pipeline arrows ──────────────────────────────────────────────────────
# 主代理 → 调度器（斜向调度器顶部中心）
arrow(4.0, 10.32, 2.5, 9.66, "vibe_math_* 工具", ly=0.20, ls=9, rad=0.0)
# 调度器 → 方向求解（竖直，经左列中心）
arrow(4.5, 8.58, 4.5, 7.88, "① 计划校验后派 Explorer / 每方向 Solver", ly=0.22, ls=9)
arrow(4.5, 6.82, 4.5, 6.18, "② 选 r（命题 / 命题+证明·证伪 / 问题+解法）派 ≥3 验证器", ly=0.22, ls=9)
arrow(4.5, 5.12, 4.5, 4.48, "③ 裁决 → 近共识收口", ly=0.22, ls=9)
arrow(4.5, 3.42, 4.5, 2.58, "④ 概率=1 → Verified/ 卡", ly=0.22, ls=9)
# 调度器 ↔ 规划代理：通道内错开两条箭头（状态简报 →规划代理；计划 JSON →调度器），label 放箭头下方避免贴 band 顶
arrow(4.0, 9.34, 5.9, 9.34, "状态简报", ly=-0.20, ls=9)
arrow(5.9, 8.78, 4.0, 8.78, "计划 JSON", ly=-0.20, ls=9)

# ── stage↔data links ─────────────────────────────────────────────────────
arrow(8.0, 9.13, 10.4, 9.13, "⑤ 注册问题/后生问题/计划回写", ly=0.26, style="<|-|>", ls=9)
arrow(8.0, 7.37, 10.4, 7.37, "⑥ 引理/子路线/解法写入（概率<1）", ly=0.26, ls=9)
arrow(10.4, 5.42, 8.1, 5.65, "⑦ 命题/证明 → 验证", ly=0.26, ls=9, rad=-0.15)
arrow(8.0, 5.65, 10.4, 5.65, "", lw=0)
arrow(8.0, 3.95, 10.4, 3.97, "⑧ methods_used/new_inventions → 方法库", ly=0.26, ls=9)
arrow(8.0, 2.51, 10.4, 2.51, "⑨ 定论 → Verified/ 卡（只读）", ly=0.26, ls=9, style="<|-|>")

# ── feature strip ────────────────────────────────────────────────────────
feat = ["仅 Verified/ 与验证判真/假绝对可信", "软规范锚点 + 自由叙述（调度器只解析锚点）",
        "规划失败自动回退启发式调度", "断点续跑（md 即叙事断点 + 进程纪元）",
        "多会话隔离 + 项目锁"]
fx = [0.5, 4.0, 7.5, 11.0, 14.5]
for x0, s in zip(fx, feat):
    box(x0, 0.32, 3.4, 0.68, "#ECEFF1", lw=1.2, rounding=0.2)
    txt(x0 + 1.7, 0.66, s, fs=9)

plt.savefig(OUT, dpi=170, bbox_inches="tight", facecolor="white")
print("saved " + OUT)
