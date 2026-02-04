# Realm 项目代码修复任务

## 📋 任务概述

对 Realm 端口转发管理工具进行代码修复和优化。

---

## ✅ 需要修复的问题

### 1. 端口检测逻辑错误 [高优先级]

**文件**: `realm.sh`
**行号**: 78
**问题**: 管道中 `grep -q` 不输出内容，后面的 `grep -v` 无效

```bash
# 当前代码 (错误)
if ss -tulpn | grep -q ":${port} " | grep -v "realm"; then

# 修复为
if ss -tulpn 2>/dev/null | grep ":${port} " | grep -qv "realm"; then
```

---

### 2. 前端分页序号计算错误 [中优先级]

**文件**: `web/static/app.js`
**行号**: 96
**问题**: 分页后序号始终从 1 开始，应显示全局序号

```javascript
// 当前代码 (错误)
<td>${index + 1}</td>

// 修复为
<td>${(currentPage - 1) * pageSize + index + 1}</td>
```

---

### 3. 使用废弃的 ioutil API [低优先级]

**文件**: `web/main.go`
**行号**: 6, 54, 67, 104
**问题**: `ioutil` 包在 Go 1.16+ 已废弃

```go
// 当前代码 (废弃)
import "io/ioutil"
data, err := ioutil.ReadFile("/root/.realm/config.toml")
ioutil.WriteFile("/root/.realm/config.toml", buf.Bytes(), 0644)

// 修复为
import "os"
data, err := os.ReadFile("/root/.realm/config.toml")
os.WriteFile("/root/.realm/config.toml", buf.Bytes(), 0644)
```

---

## 📁 涉及的文件

| 文件 | 修改内容 |
|------|----------|
| `realm.sh` | 修复第 78 行端口检测逻辑 |
| `web/static/app.js` | 修复第 96 行序号计算 |
| `web/main.go` | 替换 ioutil 为 os 包 (第 6, 54, 67, 104 行) |

---

## 🔧 修复步骤

### Step 1: 修复 realm.sh

找到第 78 行：
```bash
if ss -tulpn | grep -q ":${port} " | grep -v "realm"; then
```

替换为：
```bash
if ss -tulpn 2>/dev/null | grep ":${port} " | grep -qv "realm"; then
```

### Step 2: 修复 web/static/app.js

找到第 96 行：
```javascript
<td>${index + 1}</td>
```

替换为：
```javascript
<td>${(currentPage - 1) * pageSize + index + 1}</td>
```

### Step 3: 修复 web/main.go

1. 第 6 行：删除 `"io/ioutil"` 导入
2. 第 54 行：`ioutil.ReadFile` → `os.ReadFile`
3. 第 67 行：`ioutil.ReadFile` → `os.ReadFile`
4. 第 104 行：`ioutil.WriteFile` → `os.WriteFile`

---

## ⚠️ 不需要修复的问题

以下问题因个人使用场景可忽略：

- Session 密钥硬编码 (个人使用无需更改)
- CSRF 防护 (个人使用无需)
- 默认密码 (用户可自行修改)
- 路径硬编码 (标准 Linux 服务器路径)

---

## 验证方式

修复完成后：

1. **realm.sh**: 运行脚本，测试添加转发规则时的端口占用检测
2. **app.js**: 添加多条规则后翻页，检查序号是否正确（第二页应从 11 开始）
3. **main.go**: 重新编译 `go build -o realm_web main.go`，确认无编译错误
