// math-engines.js — P1 engine descriptors for the `math_computation` tool.
//
// CANONICAL COPY. This file must stay BYTE-IDENTICAL in:
//   vibe-math-v2/math-engines.js, vibe-math-v3/…, vibe-math-v4/…, vibe-math-v5/…
// Source of truth for the data: _oneoff/mc-P1-ready/engines.md §2.
// No repo imports — node builtins only (this file imports nothing at all).
//
// Placeholders used in the argv templates (each substitutes into ONE argv element only):
//   <script> <expr> <pkgs> <probeCode> <exe> <pkg> <cliArgv...>
// A descriptor is pure data; every template can be overridden by the user via mathEngineOverride.

export const MATH_ENGINE_ORDER = ['python', 'r', 'octave', 'julia', 'matlab', 'maple', 'wolfram', 'cli']

// Usage/option-error heuristics: when an engine exits non-zero and its output looks like one of
// these, the tool returns MATH_ENGINE_BAD_ARGV (pointing at mathEngineOverride) instead of a bare
// MATH_NONZERO_EXIT. This is what makes a version-mismatched commercial template diagnosable.
const ARG_ERROR_HINTS = ['unknown option', 'invalid option', 'unrecognized option', 'unrecognized argument', 'usage:', 'Usage:', 'illegal option']

export const MATH_ENGINES = {
  python: {
    name: 'python', phase: 'P1',
    candidates: ['python3', 'python', 'py'], winPrefix: ['-3'],
    versionArgv: ['--version'], versionRe: '(\\d+\\.\\d+\\.\\d+)',
    scriptArgv: ['<script>'], evalArgv: ['-c', '<expr>'], stdinArgv: ['-'], ext: '.py',
    probeCode: "import importlib.util,sys;print('|'.join('%s:%s'%(p,'ok' if importlib.util.find_spec(p) else 'missing') for p in sys.argv[1:]))",
    packageProbe: { argv: ['-c', '<probeCode>', '<pkgs>'], parse: 'pairs' },
    license: 'free', argErrorHints: ARG_ERROR_HINTS,
    install: {
      manager: 'pip',
      userArgv: ['<exe>', '-m', 'pip', 'install', '--user', '<pkg>'],
      systemArgv: ['<exe>', '-m', 'pip', 'install', '<pkg>'],
      uninstallArgv: ['<exe>', '-m', 'pip', 'uninstall', '-y', '<pkg>'],
      // Round-6 (B): DISPATCH by the detected interpreter environment. `pip` is the documented
      // fallback; the module picks conda/mamba/uv only when the interpreter's OWN environment says so
      // (detect, don't guess) and the plan states which manager it assumed.
      managers: {
        conda: {
          detect: 'conda-markers',
          userArgv: ['conda', 'install', '-y', '-c', 'conda-forge', '<pkg>'],
          uninstallArgv: ['conda', 'remove', '-y', '<pkg>'],
          systemUnsupportedReason: 'conda 环境是用户级的；系统级安装不在 conda 的概念里（本工具只出用户级计划）',
        },
        mamba: {
          detect: 'conda-markers',
          userArgv: ['mamba', 'install', '-y', '-c', 'conda-forge', '<pkg>'],
          uninstallArgv: ['mamba', 'remove', '-y', '<pkg>'],
          systemUnsupportedReason: 'mamba 环境是用户级的；系统级安装不在 mamba 的概念里（本工具只出用户级计划）',
        },
        uv: {
          detect: 'uv-next-to-interpreter',
          userArgv: ['uv', 'pip', 'install', '<pkg>'],
          uninstallArgv: ['uv', 'pip', 'uninstall', '<pkg>'],
          systemUnsupportedReason: 'uv 装进当前虚拟环境（用户级）；系统级需要发行版包管理器，本工具只出用户级计划',
        },
        pip: {
          detect: 'fallback',
          systemArgv: ['<exe>', '-m', 'pip', 'install', '<pkg>'],
          uninstallArgv: ['<exe>', '-m', 'pip', 'uninstall', '-y', '<pkg>'],
        },
      },
    },
    userInstall: { windows: 'winget install --id Python.Python.3.12', macos: 'brew install python', linux: 'apt install python3' },
  },
  r: {
    name: 'r', phase: 'P1',
    candidates: ['Rscript', 'R'],
    versionArgv: ['--version'], versionRe: '(\\d+\\.\\d+\\.\\d+)',
    scriptArgv: ['<script>'], evalArgv: ['-e', '<expr>'], stdinArgv: ['--no-save', '--slave'], ext: '.R',
    probeCode: "cat(paste(sapply(strsplit('__PKGS__',',')[[1]],function(p) paste0(p,':',requireNamespace(p,quietly=TRUE))),collapse='|'))",
    packageProbe: { argv: ['-e', '<probeCode>'], parse: 'pairs' },
    license: 'free', argErrorHints: ARG_ERROR_HINTS,
    install: {
      manager: 'r',
      userArgv: ['<exe>', '-e', "install.packages('__PKG__',lib=Sys.getenv('R_LIBS_USER'),repos='https://cloud.r-project.org')"],
      uninstallArgv: ['<exe>', '-e', "remove.packages('__PKG__',lib=Sys.getenv('R_LIBS_USER'))"],
      // Round-6 (C): user-only BY DESIGN, and the refusal now says why per engine.
      systemUnsupportedReason: 'R 的用户库是 R_LIBS_USER；系统级安装要写发行版的包目录（需 root 或发行版包管理器），本工具只出用户级计划',
    },
    userInstall: { windows: 'winget install --id RProject.R', macos: 'brew install r', linux: 'apt install r-base' },
  },
  octave: {
    name: 'octave', phase: 'P1',
    candidates: ['octave', 'octave-cli'],
    versionArgv: ['--version'], versionRe: '(\\d+\\.\\d+\\.\\d+)',
    scriptArgv: ['--no-gui', '--quiet', '<script>'], evalArgv: ['--no-gui', '--quiet', '--eval', '<expr>'],
    stdinArgv: ['--no-gui', '--quiet'], ext: '.m',
    probeCode: "s=pkg('list'); n={'__QPKGS__'}; for i=1:numel(n); printf('%s:%s|',n{i},merge(any(cellfun(@(x) strcmp(x.name,n{i}),s)),'ok','missing')); end",
    packageProbe: { argv: ['--no-gui', '--quiet', '--eval', '<probeCode>'], parse: 'pairs' },
    license: 'free', argErrorHints: ARG_ERROR_HINTS,
    install: {
      manager: 'octave-pkg',
      userArgv: ['<exe>', '--no-gui', '--quiet', '--eval', "pkg install -forge __PKG__"],
      uninstallArgv: ['<exe>', '--no-gui', '--quiet', '--eval', 'pkg uninstall __PKG__'],
      systemUnsupportedReason: 'Octave 的 pkg install 装进用户包目录；系统级要写 Octave 的 share/packages（需 root），本工具只出用户级计划',
    },
    userInstall: { windows: 'winget install --id GNU.Octave', macos: 'brew install octave', linux: 'apt install octave' },
  },
  julia: {
    name: 'julia', phase: 'P1',
    candidates: ['julia'],
    versionArgv: ['--version'], versionRe: '(\\d+\\.\\d+\\.\\d+)',
    scriptArgv: ['<script>'], evalArgv: ['-e', '<expr>'], stdinArgv: ['-'], ext: '.jl',
    probeCode: 'for p in [__QPKGS__]; println(p, ":", Base.find_package(p) === nothing ? "missing" : "ok"); end',
    packageProbe: { argv: ['-e', '<probeCode>'], parse: 'pairs' },
    license: 'free', argErrorHints: ARG_ERROR_HINTS,
    install: {
      manager: 'julia-pkg',
      userArgv: ['<exe>', '-e', 'using Pkg; Pkg.add("__PKG__")'],
      uninstallArgv: ['<exe>', '-e', 'using Pkg; Pkg.rm("__PKG__")'],
      systemUnsupportedReason: 'Julia 的 Pkg.add 装进当前活动环境 / 用户 depot（JULIA_DEPOT_PATH）；系统级不是 Julia 的概念，本工具只出用户级计划',
    },
    userInstall: { windows: 'winget install --id Julialang.Julia', macos: 'brew install julia', linux: 'apt install julia' },
  },
  matlab: {
    name: 'matlab', phase: 'P1',
    candidates: ['matlab'],
    versionArgv: ['-batch', 'disp(version)'], versionRe: '(\\d+\\.\\d+)',
    scriptArgv: ['-batch', "run('<script>')"], evalArgv: ['-batch', '<expr>'], stdinArgv: null, ext: '.m',
    probeCode: "t={'__QPKGS__'}; for i=1:numel(t); printf('%s:%d|',t{i},license('test',t{i})); end",
    packageProbe: { argv: ['-batch', '<probeCode>'], parse: 'pairs' },
    license: 'commercial', argErrorHints: ARG_ERROR_HINTS,
    licenseProbe: { argv: ['-batch', "disp(license('test','MATLAB'))"], okWhen: 'trim-1' },
    install: null, vendor: 'https://www.mathworks.com/install',
    userInstall: { windows: 'vendor installer + activation', macos: 'vendor installer + activation', linux: 'vendor installer + activation' },
  },
  maple: {
    name: 'maple', phase: 'P1',
    candidates: ['maple'],
    versionArgv: ['--version'], versionRe: '(\\d+\\.\\d+)',
    scriptArgv: ['-q', '<script>'], evalArgv: ['-q', '-c', '<expr>'], stdinArgv: null, ext: '.mpl',
    probeCode: 'for p in ["__PKGS__"] do try with(p) catch: printf("%s:missing|", p); next end try; printf("%s:ok|", p) end do',
    packageProbe: { argv: ['-q', '-c', '<probeCode>'], parse: 'pairs' },
    license: 'commercial', argErrorHints: ARG_ERROR_HINTS,
    licenseProbe: { argv: ['-q', '-c', 'printf("1")'], okWhen: 'exit-0' },
    install: null, vendor: 'https://www.maplesoft.com/support/installers/',
    verify: true, verifyReason: 'CLI spelling varies by Maple version - confirm on a licensed machine',
    userInstall: { windows: 'vendor installer + activation', macos: 'vendor installer + activation', linux: 'vendor installer + activation' },
  },
  wolfram: {
    name: 'wolfram', phase: 'P1',
    candidates: ['wolframscript', 'WolframKernel', 'math'],
    versionArgv: ['-code', '$Version'], versionRe: '(\\d+\\.\\d+(\\.\\d+)?)',
    scriptArgv: ['-file', '<script>'], evalArgv: ['-code', '<expr>'], stdinArgv: null, ext: '.wl',
    probeCode: 'Do[Print[p,":",If[Quiet[Check[Needs[p];True,False]],"ok","missing"]],{p,{__QPKGS__}}]',
    packageProbe: { argv: ['-code', '<probeCode>'], parse: 'pairs' },
    license: 'commercial', argErrorHints: ARG_ERROR_HINTS,
    licenseProbe: { argv: ['-code', 'Print[$LicenseType]'], okWhen: 'not-unlicensed' },
    install: null, vendor: 'https://www.wolfram.com/engine/',
    userInstall: { windows: 'vendor installer + activation', macos: 'vendor installer + activation', linux: 'vendor installer + activation' },
  },
  cli: {
    name: 'cli', phase: 'P1', defaultOn: true,
    candidates: [], resolveFrom: 'cli.command',
    versionArgv: ['--version'], versionRe: '([^\\s]+)', versionOptional: true,
    scriptArgv: ['<cliArgv...>'], evalArgv: null, stdinArgv: null, ext: '.txt',
    probeCode: null, packageProbe: null,
    license: 'user', argErrorHints: ARG_ERROR_HINTS,
    install: null, vendor: null,
    policy: { requiresMathMode: 'typed+shell', requiresEngineInList: true },
    userInstall: { windows: 'user-provided', macos: 'user-provided', linux: 'user-provided' },
  },
}

// P2 (not registered in P1 - kept here so the descriptor table stays one file).
export const MATH_P2_ENGINES = {
  sage: {
    name: 'sage', phase: 'P2', candidates: ['sage'],
    versionArgv: ['--version'], versionRe: '(\\d+\\.\\d+)',
    scriptArgv: ['<script>'], evalArgv: ['-c', '<expr>'], stdinArgv: ['-'], ext: '.sage',
    probeCode: null, packageProbe: { argv: ['-pip', 'list'], parse: 'lines' },
    license: 'free', argErrorHints: ARG_ERROR_HINTS, install: null,
  },
}

export function mathEngineCandidates(name) {
  const d = MATH_ENGINES[name]
  if (!d || name === 'cli') return null
  return d.candidates.slice()
}

export function mathEngineArgErrorHints(name) {
  const d = MATH_ENGINES[name]
  return d && Array.isArray(d.argErrorHints) ? d.argErrorHints.slice() : ARG_ERROR_HINTS.slice()
}

export function isKnownMathEngine(name) {
  return typeof name === 'string' && (Object.prototype.hasOwnProperty.call(MATH_ENGINES, name) || Object.prototype.hasOwnProperty.call(MATH_P2_ENGINES, name))
}
