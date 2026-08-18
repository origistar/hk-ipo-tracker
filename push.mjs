// push.mjs —— 把工作区变更提交并推送到 GitHub Pages 源仓库
// 运行：node push.mjs  （建议在 D:\workbuddy\新股入通 下执行）
import { spawnSync } from 'child_process';
import fs from 'fs';
import path from 'path';

const repo = 'D:/workbuddy/新股入通';

// 找 git 可执行文件：优先 PATH，其次递归扫描 PortableGit 安装目录（任意层级）
function findGit() {
  const tries = ['git'];
  const base = 'C:/Users/lxy/.workbuddy/binaries/PortableGit';
  if (fs.existsSync(base)) {
    const stack = [base];
    while (stack.length) {
      const dir = stack.pop();
      let entries;
      try { entries = fs.readdirSync(dir, { withFileTypes: true }); } catch { continue; }
      for (const e of entries) {
        const full = path.join(dir, e.name);
        if (e.isDirectory()) stack.push(full);
        else if (e.name === 'git.exe') tries.push(full);
      }
    }
  }
  for (const g of tries) {
    const r = spawnSync(g, ['--version'], { windowsHide: true });
    if (r.status === 0) return g;
  }
  return null;
}

const git = findGit();
if (!git) {
  console.error('[push] 找不到 git，无法提交');
  process.exit(1);
}
console.log('[push] 使用 git:', git);

function run(args) {
  const r = spawnSync(git, args, { cwd: repo, windowsHide: true, encoding: 'utf8' });
  const out = (r.stdout || '') + (r.stderr || '');
  console.log('[git]', args.join(' '));
  if (out.trim()) console.log(out.trim());
  return { status: r.status, out };
}

// 检查是否有变更
const st = run(['status', '--porcelain']);
if (!st.out.trim()) {
  // 工作区干净，但可能有已 commit 未 push 的提交（如之前网络失败），补推
  const ahead = run(['rev-list', '--count', 'origin/main..HEAD']);
  if ((ahead.out.trim() || '0') !== '0') {
    console.log('[push] 工作区无变更，但有未推送提交，补推');
    const p = run(['push', 'origin', 'main']);
    process.exit(p.status === 0 ? 0 : 1);
  }
  console.log('[push] 无文件变更且无未推送提交，跳过');
  process.exit(0);
}

const now = new Date();
const pad = n => String(n).padStart(2, '0');
const stamp = `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())} ${pad(now.getHours())}:${pad(now.getMinutes())}`;

run(['add', '-A']);
const c = run(['-c', 'user.name=origistar', '-c', 'user.email=origistar@users.noreply.github.com', 'commit', '-m', `每日刷新 ${stamp}`]);
if (c.status !== 0) {
  console.error('[push] commit 失败');
  process.exit(1);
}
const p = run(['push', 'origin', 'main']);
if (p.status !== 0) {
  console.error('[push] push 失败');
  process.exit(1);
}
console.log('[push] 已提交并推送到 GitHub');
