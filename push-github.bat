@echo off
chcp 65001 >nul
cd /d "%~dp0"

echo [1/3] 清除本窗口内常见代理变量（梯子若仍全局接管系统代理，请见下方说明）...
set HTTP_PROXY=
set HTTPS_PROXY=
set ALL_PROXY=
set http_proxy=
set https_proxy=
set all_proxy=
set NO_PROXY=github.com,.github.com,*.github.com,api.github.com,raw.githubusercontent.com
set no_proxy=github.com,.github.com,*.github.com,api.github.com,raw.githubusercontent.com

echo [2/3] 推送到 GitHub（对 github.com 使用直连，避免走 SOCKS5）...
git -c "http.https://github.com/.proxy=" push origin HEAD:main

echo.
if errorlevel 1 (
  echo ----------
  echo 若仍出现 socks5 / ServicePointManager 报错：
  echo   1^) 暂时完全退出梯子/VPN 软件，再双击本脚本；或
  echo   2^) Win设置 → 网络和 Internet → 代理 → 关闭「使用代理服务器」
  echo.
  echo 若提示用户名密码：不要用网页登录密码。请用 Token：
  echo   GitHub → Settings → Developer settings → Personal access tokens
  echo   生成 classic，勾选 repo，复制 ghp_ 开头令牌；
  echo   Username 填 GitHub 用户名，Password 粘贴该令牌。
  echo ----------
) else (
  echo 完成。稍等 1~3 分钟 GitHub Pages 会更新，网页用 Ctrl+F5 强刷。
)
pause
