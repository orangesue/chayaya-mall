# GitHub 安全加固操作单（照着点就行）

> 背景：为了让工具帮你创建 GitHub 仓库，本机 Windows 凭据管理器里存过一个
> 带 `repo` 权限的 GitHub Token。现在**本机已彻底删除**，但有两件事必须你去 GitHub 网站做。

---

## 第 0 步（最重要）：去 GitHub 撤销那个旧 Token

**⚠️ 关键认知：本机删掉 ≠ 网上失效。**

本机删除只是"这台电脑不再保存它"，但那个 Token 在 GitHub 服务器上**仍然是有效的**——
只要有人手里有这个字符串，依然能用它操作你的仓库。所以必须在 GitHub 上把它作废。

1. 打开 <https://github.com/settings/tokens>
2. 你会看到一个 **Tokens (classic)** 列表
3. 找到当前有效的那一个（就是权限里带 `repo`、`workflow`、`write:public_key` 的那条）
4. 点它右边的 **Delete**（删除）
5. 确认删除

**删除后**：所有还在用这个 Token 的地方都会立刻失效。你本机已经不再用它了，所以不会有任何影响。

> 如果你以后还想用 Token（比如某些工具必须用），**新建一个 Fine-grained Token**：
> - 打开 <https://github.com/settings/tokens?type=beta>
> - `Generate new token` → `Repository access` 选 **Only select repositories** → 只勾 `chayaya-mall`
> - `Permissions` → `Repository permissions` → **Contents: Read and write**（其他都不给）
> - 这样即使这个 Token 泄露，损失也只有这一个仓库

---

## 第 1 步：开启两步验证（2FA）

1. 打开 <https://github.com/settings/security>
2. 找到 **Two-factor authentication** → 点 **Enable two-factor authentication**
3. 选择方式，推荐 **Authenticator app**（手机上装个 App 收验证码，比短信安全）

### 具体流程

| 步骤 | 你要做什么 |
|---|---|
| 1 | 手机装一个验证器 App：**Microsoft Authenticator**、**Google Authenticator** 或 **1Password**（任选） |
| 2 | GitHub 页面会显示一个二维码 → 用 App 扫它 |
| 3 | App 里会出现一个**6 位数字**，每分钟变一次 → 把这 6 位数填回 GitHub 页面 |
| 4 | **保存恢复码（Recovery Codes）** ← **这一步千万别跳过** |
| 5 | 点确认，2FA 就开好了 |

### 关于恢复码（第 4 步，非常重要）

GitHub 会给你 **10 个一次性恢复码**。手机丢了、App 删了、换手机了——**只有这 10 个码能救你**。

**怎么存**（选一个）：
- 写在纸上，放钱包或抽屉（最稳）
- 存进密码管理器（1Password / Bitwarden 等）
- 存进一个加密的笔记文件

**千万不要**：只截图放在手机相册里（手机丢了就一起没了）、或者发到微信收藏。

### 开了 2FA 之后，用命令行推代码会怎样？

**不影响**——因为你已经改用 SSH 了。这也是我们前面换 SSH 的另一个好处。

但如果你以后要用 **HTTPS** 方式推送，GitHub 不再接受账号密码，必须用：
- **Personal Access Token** 当密码（推荐 Fine-grained，只给必要权限），或
- 直接继续用 SSH（最省事）

---

## 第 2 步：检查一下 SSH 密钥

你本机有一把已授权的 SSH 密钥（我用它推送成功了）。去确认一下它是不是你认识的：

1. 打开 <https://github.com/settings/keys>
2. 看列表里有没有一条叫 `suorange` 的（密钥注释是 `suorange`）
3. **是你自己的、最近设的 → 保留**
4. **不认识的、不知道什么时候加的 → 立刻 Delete**（这是安全习惯，每次改密码都该看一眼）

---

## 第 3 步：确认个人网站仓库没被动过

你有一个 `sueorange.shop`（描述写着"我的第一個網站！"）和 `orangesue` 两个仓库。
进入仓库 → 点 **Commits**，看最近的提交是不是都是你自己做的。**如果发现不认识的提交，立刻告诉我。**

---

## 第 4 步：日常习惯（3 条就够）

| 习惯 | 原因 |
|---|---|
| 不在聊天工具/文档里粘贴 Token | 一旦发出就收不回来，等于把钥匙给别人 |
| 不同用途用不同 Token，能设过期时间就设 | 泄露一个不至于全线崩 |
| 每半年去 <https://github.com/settings/tokens> 看一眼 | 清理不再用的 Token |

---

## 补充说明：本机做的改动（可随时回退）

为了让 git 不再弹登录窗口，我改了两条全局配置：

```
credential.helper = （空）      # 不再调用 Windows 凭据管理器
credential.interactive = false   # 禁止弹出凭据输入窗口
```

**影响**：以后用 **HTTPS** 方式 `git clone / push` GitHub 时不会弹窗，会直接报认证失败。

**如果你想恢复弹窗**（比如要用 HTTPS 克隆别人的私有仓库）：

```powershell
git config --global credential.helper manager
git config --global credential.interactive true
```

**但我不建议恢复**——用 SSH 就好。克隆别人的仓库改用 SSH 地址：
`git@github.com:用户名/仓库名.git`，或者用网页的 "Download ZIP"。

---

## 检查清单

- [ ] 旧 Token 已在 GitHub 网站删除（第 0 步，**最重要**）
- [ ] 2FA 已开启，恢复码已妥善保存
- [ ] SSH 密钥列表里没有不认识的密钥
- [ ] `sueorange.shop` 和 `orangesue` 仓库的提交记录都是自己的
- [ ] 知道怎么回退 git 凭据配置（上面那段命令）

做完第 0 步和第 1 步，安全层面就没有遗留问题了。
