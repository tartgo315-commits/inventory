# inventory

TARTGO 进销存单页应用（GitHub Pages）。

## 部署与分支（重要）

- **GitHub Pages** 当前从仓库的 **`main`** 分支发布站点（根目录 `index.html`）。
- 修改代码后请 **`git push origin main`**，或在 `master` 等工作分支开发完成后 **合并进 `main` 再推送**，否则线上地址不会更新。
- 推送后可在仓库 **Actions / Environments** 或 **Deployments** 里查看 `github-pages` 是否完成新一轮部署，再等 1～2 分钟强制刷新页面（`Ctrl+F5`）。

## 1688 书签

书签脚本源文件在 `tools/bookmarklet-1688-tartgo.js`。更新逻辑后在本机执行：

```bash
node tools/pack-bookmarklet.cjs
```

用生成的 `tools/bookmarklet-1688-tartgo-oneline.txt` 里**最新一行**更新浏览器书签。
