#Requires -Version 5.1
<#
.SYNOPSIS
  Build game Pairfect thành file APK trên Windows chỉ với một lệnh.

.DESCRIPTION
  Script tự động:
    1. Kiểm tra Node.js, Android SDK, JDK 21 (tự chọn đúng phiên bản Java trên máy)
    2. Cài thư viện npm nếu chưa có
    3. Build code web và tạo/đồng bộ project Android (cho phép xoay dọc/ngang)
    4. Build APK (debug hoặc release đã ký)
    5. Chép APK vào thư mục apk-output\ và (tùy chọn) cài lên điện thoại qua USB

.PARAMETER Release
  Build bản phát hành đã ký. Lần đầu script sẽ đề nghị tạo keystore.

.PARAMETER Install
  Cài APK lên điện thoại đang cắm USB (cần bật Gỡ lỗi USB).

.PARAMETER KeystorePath
  Đường dẫn file keystore. Mặc định để NGOÀI thư mục project cho an toàn.

.PARAMETER KeyAlias
  Alias của khóa trong keystore.

.PARAMETER SdkPath
  Đường dẫn Android SDK, nếu script không tự tìm được.
  Xem trong Android Studio: Settings > Languages & Frameworks > Android SDK > Android SDK Location.

.PARAMETER JdkPath
  Đường dẫn JDK 21, nếu script không tự tìm được. Project cần Java 21 (chấp nhận 21-24).

.EXAMPLE
  .\build-apk.bat                    # APK debug để thử
  .\build-apk.bat -Install           # APK debug + cài lên điện thoại
  .\build-apk.bat -Release           # APK release đã ký để gửi người khác
  .\build-apk.bat -SdkPath "D:\Android\Sdk"   # chỉ định đường dẫn SDK
#>
param(
  [switch]$Release,
  [switch]$Install,
  [string]$KeystorePath = (Join-Path $env:USERPROFILE '.android-keystores\pairfect-release.jks'),
  [string]$KeyAlias = 'pairfect',
  [string]$SdkPath,
  [string]$JdkPath
)

$ErrorActionPreference = 'Stop'
try { [Console]::OutputEncoding = [Text.Encoding]::UTF8 } catch { }

$Root = $PSScriptRoot
Set-Location $Root

function Write-Step([string]$Text) { Write-Host "`n==> $Text" -ForegroundColor Cyan }
function Write-Ok([string]$Text) { Write-Host "    $Text" -ForegroundColor Green }
function Write-Warn([string]$Text) { Write-Host "    [Lưu ý] $Text" -ForegroundColor Yellow }
function Fail([string]$Text) {
  Write-Host "`n[LỖI] $Text" -ForegroundColor Red
  exit 1
}

# Chạy lệnh ngoài và dừng ngay nếu lệnh lỗi
function Invoke-Tool([string]$Exe, [string[]]$ArgList, [string]$WhatFor) {
  & $Exe @ArgList
  if ($LASTEXITCODE -ne 0) { Fail "$WhatFor thất bại (mã lỗi $LASTEXITCODE). Xem log phía trên." }
}

function First-Existing([string[]]$Paths, [string]$MustContain) {
  foreach ($p in $Paths) {
    if ($p -and (Test-Path (Join-Path $p $MustContain))) { return $p }
  }
  return $null
}

function SecureToPlain([Security.SecureString]$s) {
  $b = [Runtime.InteropServices.Marshal]::SecureStringToBSTR($s)
  try { return [Runtime.InteropServices.Marshal]::PtrToStringBSTR($b) }
  finally { [Runtime.InteropServices.Marshal]::ZeroFreeBSTR($b) }
}

$mode = if ($Release) { 'release' } else { 'debug' }
Write-Host "Build APK Pairfect - chế độ: $mode" -ForegroundColor White

# ---------------------------------------------------------------- 1. Môi trường
Write-Step 'Kiểm tra môi trường'

if (-not (Get-Command node -ErrorAction SilentlyContinue)) {
  Fail 'Chưa cài Node.js. Tải bản LTS tại https://nodejs.org rồi mở lại cửa sổ dòng lệnh.'
}
Write-Ok "Node.js $(node --version)"

# --- Android SDK: thử lần lượt nhiều nguồn, vì vị trí mặc định khác nhau giữa các phiên bản Android Studio
function Test-Sdk([string]$Dir) {
  return ($Dir -and (Test-Path (Join-Path $Dir 'platform-tools')))
}

function Get-SdkFromLocalProperties {
  $lp = Join-Path $Root 'android\local.properties'
  if (-not (Test-Path $lp)) { return $null }
  $line = Select-String -Path $lp -Pattern '^\s*sdk\.dir\s*=\s*(.+)$' | Select-Object -First 1
  if (-not $line) { return $null }
  # File này escape kiểu Java: C\:\\Users\\...
  return $line.Matches[0].Groups[1].Value.Trim().Replace('\:', ':').Replace('\\', '\')
}

function Get-SdkFromStudioConfig {
  # Android Studio ghi đường dẫn SDK đang dùng vào options\other.xml của từng phiên bản (kể cả bản Preview/Canary)
  $files = @()
  foreach ($base in @($env:APPDATA, $env:LOCALAPPDATA)) {
    if (-not $base) { continue }
    $g = Join-Path $base 'Google'
    if (-not (Test-Path $g)) { continue }
    $files += Get-ChildItem -Path $g -Directory -Filter 'AndroidStudio*' -ErrorAction SilentlyContinue |
      ForEach-Object { Join-Path $_.FullName 'options\other.xml' } |
      Where-Object { Test-Path $_ }
  }
  $files = $files | Sort-Object { (Get-Item $_).LastWriteTime } -Descending
  foreach ($f in $files) {
    $m = Select-String -Path $f -Pattern 'android\.sdk\.path"[^>]*?value="([^"]+)"' | Select-Object -First 1
    if ($m) {
      $v = $m.Matches[0].Groups[1].Value.Replace('$USER_HOME$', $env:USERPROFILE).Replace('/', '\')
      if (Test-Sdk $v) { return $v }
    }
  }
  return $null
}

function Get-StudioDirs {
  # Thư mục cài Android Studio: từ registry, rồi các vị trí cài phổ biến (gồm cả bản Preview)
  $dirs = @()
  foreach ($key in @('HKLM:\SOFTWARE\Android Studio', 'HKCU:\SOFTWARE\Android Studio')) {
    try { $p = (Get-ItemProperty -Path $key -ErrorAction Stop).Path; if ($p) { $dirs += $p } } catch { }
  }
  $bases = @()
  if ($env:ProgramFiles) { $bases += (Join-Path $env:ProgramFiles 'Android') }
  if (${env:ProgramFiles(x86)}) { $bases += (Join-Path ${env:ProgramFiles(x86)} 'Android') }
  if ($env:LOCALAPPDATA) { $bases += (Join-Path $env:LOCALAPPDATA 'Programs'); $bases += (Join-Path $env:LOCALAPPDATA 'Android') }
  foreach ($b in $bases) {
    if (Test-Path $b) {
      $dirs += Get-ChildItem -Path $b -Directory -Filter '*Android Studio*' -ErrorAction SilentlyContinue |
        Sort-Object LastWriteTime -Descending | ForEach-Object { $_.FullName }
    }
  }
  return $dirs
}

$sdkCandidates = @(
  @{ Path = $SdkPath; From = 'tham số -SdkPath' },
  @{ Path = $env:ANDROID_HOME; From = 'biến ANDROID_HOME' },
  @{ Path = $env:ANDROID_SDK_ROOT; From = 'biến ANDROID_SDK_ROOT' },
  @{ Path = (Get-SdkFromLocalProperties); From = 'android\local.properties' },
  @{ Path = (Get-SdkFromStudioConfig); From = 'cấu hình Android Studio' }
)
if ($env:LOCALAPPDATA) { $sdkCandidates += @{ Path = (Join-Path $env:LOCALAPPDATA 'Android\Sdk'); From = 'vị trí mặc định' } }
if ($env:SystemDrive) { $sdkCandidates += @{ Path = (Join-Path $env:SystemDrive 'Android\Sdk'); From = 'vị trí phổ biến' } }

if ($SdkPath -and -not (Test-Sdk $SdkPath)) {
  Fail "Thư mục '$SdkPath' không phải Android SDK (không có thư mục platform-tools bên trong)."
}

$sdk = $null
foreach ($c in $sdkCandidates) {
  if (Test-Sdk $c.Path) { $sdk = $c.Path; $sdkFrom = $c.From; break }
}
if (-not $sdk) {
  Fail @"
Không tìm thấy Android SDK.
  Cách lấy đường dẫn: mở Android Studio > Settings (ở màn hình chào: Customize > All settings)
  > Languages & Frameworks > Android SDK, copy dòng "Android SDK Location".
  Sau đó chạy:   build-apk.bat -SdkPath "<đường dẫn vừa copy>"
  Hoặc lưu cố định một lần:   setx ANDROID_HOME "<đường dẫn vừa copy>"   (rồi mở lại cửa sổ dòng lệnh)
"@
}
$env:ANDROID_HOME = $sdk
Write-Ok "Android SDK: $sdk  (tìm thấy qua $sdkFrom)"

# --- JDK: Gradle 8.14 của project chỉ chạy trên Java 21-24 (project biên dịch theo Java 21).
#     Android Studio bản mới (vd. Rabbit Canary) có thể kèm Java 25, nên phải chọn JDK theo phiên bản.
$JavaMin = 21
$JavaMax = 24

function Get-JavaMajor([string]$Dir) {
  if (-not $Dir -or -not (Test-Path (Join-Path $Dir 'bin\java.exe'))) { return $null }
  $rel = Join-Path $Dir 'release'
  if (Test-Path $rel) {
    $m = Select-String -Path $rel -Pattern 'JAVA_VERSION="(\d+)(\.(\d+))?' | Select-Object -First 1
    if ($m) {
      $major = [int]$m.Matches[0].Groups[1].Value
      if ($major -eq 1) { $major = [int]$m.Matches[0].Groups[3].Value }  # Java 8 ghi là 1.8
      return $major
    }
  }
  try {
    $out = & (Join-Path $Dir 'bin\java.exe') -version 2>&1 | Out-String
    if ($out -match 'version "(\d+)') { return [int]$Matches[1] }
  } catch { }
  return $null
}

function Get-JdkDirs {
  $dirs = @()
  if ($JdkPath) { $dirs += $JdkPath }
  $dirs += Get-StudioDirs | ForEach-Object { Join-Path $_ 'jbr' }
  if ($env:JAVA_HOME) { $dirs += $env:JAVA_HOME }
  # JDK do Android Studio tải về (Settings > Gradle > Gradle JDK > Download JDK)
  $userJdks = Join-Path $env:USERPROFILE '.jdks'
  if (Test-Path $userJdks) { $dirs += Get-ChildItem -Path $userJdks -Directory | ForEach-Object { $_.FullName } }
  # Các bản JDK cài riêng phổ biến
  $vendorRoots = @()
  if ($env:ProgramFiles) {
    foreach ($v in @('Eclipse Adoptium', 'Java', 'Microsoft', 'Zulu', 'Amazon Corretto', 'BellSoft')) {
      $vendorRoots += (Join-Path $env:ProgramFiles $v)
    }
  }
  foreach ($r in $vendorRoots) {
    if (Test-Path $r) { $dirs += Get-ChildItem -Path $r -Directory | ForEach-Object { $_.FullName } }
  }
  return $dirs | Where-Object { $_ } | Select-Object -Unique
}

$jdkFound = @()
foreach ($d in Get-JdkDirs) {
  $v = Get-JavaMajor $d
  if ($v) { $jdkFound += [pscustomobject]@{ Path = $d; Version = $v } }
}

if ($JdkPath) {
  $given = $jdkFound | Where-Object { $_.Path -eq $JdkPath } | Select-Object -First 1
  if (-not $given) { Fail "Thư mục '$JdkPath' không chứa JDK hợp lệ (thiếu bin\java.exe)." }
  if ($given.Version -lt $JavaMin -or $given.Version -gt $JavaMax) {
    Fail "JDK tại '$JdkPath' là Java $($given.Version). Project cần Java $JavaMin (chấp nhận $JavaMin-$JavaMax)."
  }
  $jdk = $given.Path; $jdkVer = $given.Version
} else {
  # Ưu tiên đúng Java 21, sau đó tới bản thấp nhất trong khoảng cho phép
  $pick = $jdkFound | Where-Object { $_.Version -ge $JavaMin -and $_.Version -le $JavaMax } |
    Sort-Object @{ Expression = { [math]::Abs($_.Version - $JavaMin) } } | Select-Object -First 1
  if ($pick) { $jdk = $pick.Path; $jdkVer = $pick.Version }
}

if (-not $jdk) {
  $list = if ($jdkFound) { ($jdkFound | ForEach-Object { "    - Java $($_.Version): $($_.Path)" }) -join "`n" } else { '    (không thấy JDK nào)' }
  Fail @"
Không tìm thấy JDK phù hợp. Project cần Java $JavaMin (chấp nhận $JavaMin-$JavaMax).
  Các JDK đang có trên máy:
$list

  Cài Java 21 bằng MỘT trong hai cách, rồi chạy lại script (script sẽ tự tìm thấy):
  1. Trong Android Studio: Settings > Build, Execution, Deployment > Build Tools > Gradle
     > Gradle JDK > Download JDK... > chọn Version 21 (vd. Eclipse Temurin).
  2. Dòng lệnh:  winget install EclipseAdoptium.Temurin.21.JDK
  Hoặc chỉ định trực tiếp:  build-apk.bat -JdkPath "<thư mục JDK 21>"
"@
}

$env:JAVA_HOME = $jdk
$env:Path = "$jdk\bin;$env:Path"
Write-Ok "JDK: Java $jdkVer  ($jdk)"
$skipped = $jdkFound | Where-Object { $_.Version -gt $JavaMax } | Select-Object -First 1
if ($skipped) { Write-Ok "(Bỏ qua Java $($skipped.Version) tại $($skipped.Path) vì Gradle của project chưa hỗ trợ)" }

# ---------------------------------------------------------------- 2. Thư viện npm
if (-not (Test-Path (Join-Path $Root 'node_modules'))) {
  Write-Step 'Cài thư viện npm (lần đầu)'
  Invoke-Tool 'npm.cmd' @('install') 'npm install'
}

$appIdLine = Select-String -Path (Join-Path $Root 'capacitor.config.ts') -Pattern "appId:\s*'([^']+)'" | Select-Object -First 1
if ($appIdLine -and $appIdLine.Matches[0].Groups[1].Value -like 'com.example.*') {
  Write-Warn "appId vẫn là '$($appIdLine.Matches[0].Groups[1].Value)'. Nên đổi trong capacitor.config.ts TRƯỚC lần build đầu tiên (xem README)."
}

# ---------------------------------------------------------------- 3. Build web + Android project
Write-Step 'Build code game (TypeScript + Vite)'
Invoke-Tool 'npm.cmd' @('run', 'build') 'Build code web'

$androidDir = Join-Path $Root 'android'
if (-not (Test-Path $androidDir)) {
  Write-Step 'Tạo project Android (lần đầu)'
  Invoke-Tool 'npx.cmd' @('cap', 'add', 'android') 'Tạo project Android'
} else {
  Write-Step 'Đồng bộ code mới sang Android'
  Invoke-Tool 'npx.cmd' @('cap', 'sync', 'android') 'Đồng bộ Capacitor'
}

# Cho phép xoay màn hình (game tự đổi bố cục dọc/ngang) nhưng vẫn theo khóa xoay của người dùng.
# Chạy mỗi lần build để cập nhật cả project Android tạo từ bản cũ (khóa dọc).
$manifest = Join-Path $androidDir 'app\src\main\AndroidManifest.xml'
$xml = [IO.File]::ReadAllText($manifest)
$orientation = 'android:screenOrientation="fullUser"'
if ($xml -match 'android:screenOrientation="[^"]*"') {
  $newXml = $xml -replace 'android:screenOrientation="[^"]*"', $orientation
} else {
  $newXml = ([regex]'<activity').Replace($xml, "<activity $orientation", 1)
}
if ($newXml -ne $xml) {
  [IO.File]::WriteAllText($manifest, $newXml, (New-Object Text.UTF8Encoding $false))
  Write-Ok 'Đã cho phép xoay màn hình (dọc/ngang) trong AndroidManifest.xml'
}

# Ghi đường dẫn SDK vào local.properties để Gradle và Android Studio dùng đúng SDK
$lpFile = Join-Path $androidDir 'local.properties'
$lpLine = 'sdk.dir=' + $sdk.Replace('\', '\\').Replace(':', '\:')
[IO.File]::WriteAllText($lpFile, "$lpLine`r`n", (New-Object Text.UTF8Encoding $false))

# Kiểm tra trước Android SDK Platform mà project cần (compileSdkVersion trong android\variables.gradle).
# Gradle có thể tự tải nhưng hay thất bại khi Android Studio mới hơn plugin Gradle (lỗi "SDK XML version 4"),
# nên script tự cài bằng sdkmanager nếu có, hoặc dừng sớm với hướng dẫn rõ ràng.
$compileSdk = $null
$varsFile = Join-Path $androidDir 'variables.gradle'
if (Test-Path $varsFile) {
  $m = Select-String -Path $varsFile -Pattern 'compileSdkVersion\s*=\s*(\d+)' | Select-Object -First 1
  if ($m) { $compileSdk = $m.Matches[0].Groups[1].Value }
}
if ($compileSdk -and -not (Test-Path (Join-Path $sdk "platforms\android-$compileSdk\android.jar"))) {
  Write-Step "Thiếu Android SDK Platform $compileSdk (API $compileSdk) - đang thử cài"
  $sdkmanager = $null
  $cmdTools = Join-Path $sdk 'cmdline-tools'
  if (Test-Path $cmdTools) {
    $sdkmanager = Get-ChildItem -Path $cmdTools -Filter 'sdkmanager.bat' -Recurse -ErrorAction SilentlyContinue |
      Sort-Object @{ Expression = { $_.FullName -notlike '*\latest\*' } }, FullName -Descending |
      Select-Object -First 1 | ForEach-Object { $_.FullName }
  }
  $installed = $false
  if ($sdkmanager) {
    Write-Ok "Dùng $sdkmanager"
    $yes = (('y' + [Environment]::NewLine) * 30)
    $yes | & $sdkmanager --licenses | Out-Null
    & $sdkmanager "platforms;android-$compileSdk"
    $installed = ($LASTEXITCODE -eq 0) -and (Test-Path (Join-Path $sdk "platforms\android-$compileSdk\android.jar"))
  }
  if (-not $installed) {
    Fail @"
Chưa cài được Android SDK Platform $compileSdk. Hãy cài bằng SDK Manager của Android Studio:
  1. Mở Android Studio > Tools > SDK Manager (ở màn hình chào: More Actions > SDK Manager).
  2. Tab "SDK Platforms": tích "Android API $compileSdk" (Android 16) > Apply > OK.
  3. (Nên làm) Tab "SDK Tools": tích "Android SDK Command-line Tools (latest)" để lần sau script tự cài được.
  Rồi chạy lại build-apk.bat.
  Nếu SDK Manager cũng báo lỗi tải: thường do mạng công ty/proxy. Thử mạng khác, hoặc khai báo proxy trong
  Android Studio > Settings > Appearance & Behavior > System Settings > HTTP Proxy.
"@
  }
  Write-Ok "Đã cài Android SDK Platform $compileSdk"
}

# ---------------------------------------------------------------- 4. Build APK
$gradle = Join-Path $androidDir 'gradlew.bat'

if ($Release) {
  if (-not (Test-Path $KeystorePath)) {
    Write-Step 'Chưa có keystore để ký bản release'
    Write-Host "    Keystore sẽ được tạo tại: $KeystorePath"
    $answer = Read-Host '    Tạo keystore mới? (y/n)'
    if ($answer -notmatch '^[yY]') { Fail 'Cần keystore để build bản release. Dùng -KeystorePath nếu bạn đã có sẵn.' }
    New-Item -ItemType Directory -Force -Path (Split-Path $KeystorePath) | Out-Null
    Write-Host '    keytool sẽ hỏi mật khẩu và vài thông tin (tên, tổ chức...). Có thể bỏ trống các thông tin đó.' -ForegroundColor Gray
    Invoke-Tool (Join-Path $jdk 'bin\keytool.exe') @(
      '-genkeypair', '-v',
      '-keystore', $KeystorePath,
      '-alias', $KeyAlias,
      '-keyalg', 'RSA', '-keysize', '2048', '-validity', '10000'
    ) 'Tạo keystore'
    Write-Warn "SAO LƯU file $KeystorePath và mật khẩu ở nơi an toàn. Mất nó là không thể cập nhật app được nữa."
  }

  $storePass = SecureToPlain (Read-Host 'Mật khẩu keystore' -AsSecureString)
  $keyPassIn = SecureToPlain (Read-Host 'Mật khẩu khóa (Enter nếu giống mật khẩu keystore)' -AsSecureString)
  $keyPass = if ($keyPassIn) { $keyPassIn } else { $storePass }

  Write-Step 'Build APK release (đã ký)'
  # Truyền tham số qua mảng để PowerShell 5.1 không tách sai các đối số có dấu chấm
  $gradleArgs = @(
    'assembleRelease',
    "-Pandroid.injected.signing.store.file=$KeystorePath",
    "-Pandroid.injected.signing.store.password=$storePass",
    "-Pandroid.injected.signing.key.alias=$KeyAlias",
    "-Pandroid.injected.signing.key.password=$keyPass"
  )
  Push-Location $androidDir
  try { Invoke-Tool $gradle $gradleArgs 'Gradle assembleRelease' } finally { Pop-Location }
  $apkSrc = Join-Path $androidDir 'app\build\outputs\apk\release\app-release.apk'
} else {
  Write-Step 'Build APK debug'
  Push-Location $androidDir
  try { Invoke-Tool $gradle @('assembleDebug') 'Gradle assembleDebug' } finally { Pop-Location }
  $apkSrc = Join-Path $androidDir 'app\build\outputs\apk\debug\app-debug.apk'
}

if (-not (Test-Path $apkSrc)) { Fail "Build xong nhưng không thấy file $apkSrc" }

# ---------------------------------------------------------------- 5. Xuất file + cài đặt
$version = (Get-Content (Join-Path $Root 'package.json') -Raw | ConvertFrom-Json).version
$outDir = Join-Path $Root 'apk-output'
New-Item -ItemType Directory -Force -Path $outDir | Out-Null
$apkOut = Join-Path $outDir "Pairfect-v$version-$mode.apk"
Copy-Item $apkSrc $apkOut -Force
$sizeMb = [math]::Round((Get-Item $apkOut).Length / 1MB, 1)

Write-Host "`nXONG! File APK ($sizeMb MB):" -ForegroundColor Green
Write-Host "  $apkOut" -ForegroundColor White

if ($Install) {
  Write-Step 'Cài lên điện thoại qua USB'
  $adb = Join-Path $sdk 'platform-tools\adb.exe'
  $devices = & $adb devices | Select-String -Pattern '\tdevice$'
  if (-not $devices) {
    Fail 'Không thấy điện thoại nào. Cắm cáp USB, bật "Gỡ lỗi USB" trong Tùy chọn nhà phát triển và chấp nhận hộp thoại trên điện thoại.'
  }
  & $adb install -r $apkOut
  if ($LASTEXITCODE -ne 0) {
    Fail 'Cài đặt thất bại. Nếu lỗi INSTALL_FAILED_UPDATE_INCOMPATIBLE: gỡ app cũ trên điện thoại (do khác chữ ký debug/release) rồi chạy lại.'
  }
  Write-Ok 'Đã cài lên điện thoại.'
}

Invoke-Item $outDir
