#!/usr/bin/env pwsh
# Mood Radio 课程设计报告编译脚本（直接调用 xelatex + biber，不依赖 perl/latexmk）
# 用法:
#   .\build.ps1            编译 main.pdf
#   .\build.ps1 -Clean     清理中间文件
#   .\build.ps1 -Full      清理 + 编译 + 打开 PDF
#   .\build.ps1 -Open      仅打开 main.pdf

param(
    [switch]$Clean,
    [switch]$Full,
    [switch]$Open
)

$ScriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
Set-Location $ScriptDir

$Thesis = 'main'
$XeOpts = @(
    '-interaction=nonstopmode',
    '-file-line-error',
    '-halt-on-error',
    '-shell-escape',
    '-synctex=1'
)

# latexmkrc 通常在这里给 TEXINPUTS/BIBINPUTS 追加子目录；直接调用 xelatex/biber 时
# 必须自己设置这些环境变量，否则会出现 "tongjithesis.cls not found"。
# kpathsea 约定：路径末尾的 "//" 表示递归搜索子目录；分隔符 Windows 用 ";".
$sep = ';'
$env:TEXINPUTS = ".$sep./style//$sep./chapters//$sep./figures//$sep$env:TEXINPUTS"
$env:BIBINPUTS = "./bib//$sep$env:BIBINPUTS"

function Test-Command($name) {
    return $null -ne (Get-Command $name -ErrorAction SilentlyContinue)
}

function Invoke-Clean {
    Write-Host '==> 清理中间文件...' -ForegroundColor Cyan
    $exts = @(
        'aux', 'bbl', 'bcf', 'blg', 'fdb_latexmk', 'fls', 'idx', 'ilg', 'ind',
        'lof', 'log', 'lol', 'lot', 'out', 'run.xml', 'synctex.gz', 'toc',
        'xdv', 'nav', 'snm', 'vrb'
    )
    foreach ($e in $exts) {
        Get-ChildItem -Filter "$Thesis.$e" -ErrorAction SilentlyContinue | Remove-Item -Force
    }
}

# 运行一个原生命令并把 stdout/stderr 都重定向到文件，
# 避免 PowerShell 5.1 把 native 命令的 stderr 包装成 ErrorRecord。
# 退出码通过 $LASTEXITCODE 检查。
function Run-Quiet($label, $logTail, [string]$exe, [string[]]$argv) {
    Write-Host "==> $label" -ForegroundColor Cyan
    $stdout = Join-Path $ScriptDir "$Thesis.build-stdout.tmp"
    $stderr = Join-Path $ScriptDir "$Thesis.build-stderr.tmp"
    $p = Start-Process -FilePath $exe -ArgumentList $argv `
        -NoNewWindow -Wait -PassThru `
        -RedirectStandardOutput $stdout -RedirectStandardError $stderr
    Remove-Item $stdout, $stderr -Force -ErrorAction SilentlyContinue
    if ($p.ExitCode -ne 0) {
        Write-Host "==> $label 失败 (exit $($p.ExitCode))，详见 $Thesis.log" -ForegroundColor Red
        exit $p.ExitCode
    }
}

function Invoke-Build {
    # biblatex + biber 工作流：xelatex → biber → xelatex → xelatex
    $xeArgs = $XeOpts + @("$Thesis.tex")
    Run-Quiet 'xelatex (pass 1)' $Thesis 'xelatex' $xeArgs
    Run-Quiet 'biber'            $Thesis 'biber'   @("$Thesis")
    Run-Quiet 'xelatex (pass 2)' $Thesis 'xelatex' $xeArgs
    Run-Quiet 'xelatex (pass 3)' $Thesis 'xelatex' $xeArgs
    Write-Host "==> 编译完成: $ScriptDir\$Thesis.pdf" -ForegroundColor Green
}

function Invoke-Open {
    if (Test-Path "$Thesis.pdf") {
        Start-Process "$Thesis.pdf"
    } else {
        Write-Host "==> $Thesis.pdf 不存在，请先编译" -ForegroundColor Yellow
    }
}

if ($Open) { Invoke-Open; return }
if ($Clean -and -not $Full) { Invoke-Clean; return }
if ($Full) { Invoke-Clean }

foreach ($cmd in 'xelatex', 'biber') {
    if (-not (Test-Command $cmd)) {
        Write-Host "==> 未找到 $cmd，请先安装 TeX Live 或 MiKTeX。" -ForegroundColor Red
        exit 1
    }
}

Invoke-Build

if ($Full) { Invoke-Open }
