// vibe-math-vmu/settings/env-needs.js — PHASE 9 / goal 3: THE ENVIRONMENT NEED TABLE (policy data, not mechanism).
//
// One row per external environment the math faces may need. Adding an environment is a DATA change to THIS table (or to
// `vmu.env.needs`), never a kernel change. `auto:false` rows are declared but NOT probed by `probeAll`/`list` defaults;
// they are probed when named explicitly (the CAS tools are the reason: most deployments do not have them).
export const ENV_NEEDS_DEFAULTS = Object.freeze({
  python: { probe: { command: 'python', args: ['-c', 'import sys;print(sys.version.split()[0])'] }, installCommand: 'https://www.python.org/downloads/', requiresUser: true, why: '数学计算/脚本（脚本桥）' },
  python3: { probe: { command: 'python3', args: ['-c', 'import sys;print(sys.version.split()[0])'] }, installCommand: 'apt install python3  # or https://www.python.org/downloads/', requiresUser: true, why: '类 Unix 下的 python 名' },
  numpy: { probe: { command: 'python', args: ['-c', 'import numpy;print(numpy.__version__)'] }, installCommand: 'python -m pip install numpy', requiresUser: true, why: '数组/数值计算' },
  scipy: { probe: { command: 'python', args: ['-c', 'import scipy;print(scipy.__version__)'] }, installCommand: 'python -m pip install scipy', requiresUser: true, why: '科学计算' },
  pandas: { probe: { command: 'python', args: ['-c', 'import pandas;print(pandas.__version__)'] }, installCommand: 'python -m pip install pandas', requiresUser: true, why: '表格/数据' },
  sympy: { probe: { command: 'python', args: ['-c', 'import sympy;print(sympy.__version__)'] }, installCommand: 'python -m pip install sympy', requiresUser: true, why: '符号计算（CAS）' },
  lean: { probe: { command: 'lean', args: ['--version'] }, installCommand: 'https://leanprover-community.github.io/get_started.html  (or elan install)', requiresUser: true, why: '形式化证明（Lean）' },
  elan: { probe: { command: 'elan', args: ['--version'] }, installCommand: 'https://github.com/leanprover/elan#installation', requiresUser: true, why: 'Lean 工具链管理器' },
  xelatex: { probe: { command: 'xelatex', args: ['--version'] }, installCommand: 'https://tug.org/texlive/  (TeX Live / MiKTeX)', requiresUser: true, why: '论文 PDF（XeLaTeX）' },
  latexmk: { probe: { command: 'latexmk', args: ['--version'] }, installCommand: 'https://tug.org/texlive/  (TeX Live / MiKTeX)', requiresUser: true, why: '论文多遍编译' },
  pdflatex: { probe: { command: 'pdflatex', args: ['--version'] }, installCommand: 'https://tug.org/texlive/  (TeX Live / MiKTeX)', requiresUser: true, why: '论文 PDF（pdfLaTeX）' },
  lualatex: { probe: { command: 'lualatex', args: ['--version'] }, installCommand: 'https://tug.org/texlive/  (TeX Live / MiKTeX)', requiresUser: true, why: '论文 PDF（LuaLaTeX）' },
  tectonic: { probe: { command: 'tectonic', args: ['--version'] }, installCommand: 'https://tectonic-typesetting.github.io/', requiresUser: true, why: '单文件 LaTeX 引擎' },
  node: { probe: { command: 'node', args: ['--version'] }, installCommand: 'https://nodejs.org/', requiresUser: true, why: '脚本桥运行时' },
  pwsh: { probe: { command: 'pwsh', args: ['--version'] }, installCommand: 'https://learn.microsoft.com/powershell/scripting/install/installing-powershell', requiresUser: true, why: '脚本桥（Windows 部署）' },
  git: { probe: { command: 'git', args: ['--version'] }, installCommand: 'https://git-scm.com/downloads', requiresUser: true, why: '仓库/引用' },
  sage: { auto: false, probe: { command: 'sage', args: ['--version'] }, installCommand: 'https://www.sagemath.org/download.html', requiresUser: true, why: 'CAS（SageMath；按需）' },
  gp: { auto: false, probe: { command: 'gp', args: ['--version'] }, installCommand: 'https://pari.math.u-bordeaux.fr/download.html', requiresUser: true, why: 'CAS（PARI/GP；按需）' },
  magma: { auto: false, probe: { command: 'magma', args: ['-v'] }, installCommand: 'https://magma.maths.usyd.edu.au/magma/  (licensed; requires user)', requiresUser: true, why: 'CAS（Magma；按需且需授权）' },
  wolframscript: { auto: false, probe: { command: 'wolframscript', args: ['-version'] }, installCommand: 'https://www.wolfram.com/engine/  (licensed; requires user)', requiresUser: true, why: 'CAS（Wolfram；按需且需授权）' },
  rscript: { auto: false, probe: { command: 'Rscript', args: ['--version'] }, installCommand: 'https://cran.r-project.org/', requiresUser: true, why: '统计/CAS（R；按需）' },
  octave: { auto: false, probe: { command: 'octave', args: ['--version'] }, installCommand: 'https://octave.org/download.html', requiresUser: true, why: '数值/CAS（GNU Octave；按需）' },
})
