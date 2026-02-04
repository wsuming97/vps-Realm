# Realm 端口转发管理工具 - 项目代码分析

## 项目概述

这是一个 **Realm 端口转发管理工具**，基于 [zhboner/realm](https://github.com/zhboner/realm) 项目，提供一键安装脚本和可视化 Web 管理面板。

---

## 项目结构

```
realm-main/
├── realm.sh              # 主脚本：Bash 一键管理脚本 (v3.1.2)
├── web/                  # Web 管理面板 (Go 语言)
│   ├── main.go           # 后端服务主程序
│   ├── config.toml       # 面板配置文件
│   ├── go.mod/go.sum     # Go 依赖管理
│   ├── static/app.js     # 前端 JavaScript
│   └── templates/        # HTML 模板
│       ├── index.html    # 主控制面板页面
│       └── login.html    # 登录页面
└── README.md             # 使用说明文档
```

---

## 核心功能模块

### 1. Bash 脚本 (`realm.sh`)

**文件位置**: `realm.sh` (431 行)

**主要功能**:
- **安装/卸载 Realm**：自动下载对应架构的 realm 二进制文件
- **转发规则管理**：添加单条/端口段转发、删除规则、查看配置
- **服务控制**：启动/停止/重启 systemd 服务
- **Web 面板管理**：安装/启动/停止面板
- **防死循环机制**：连续输错 2 次自动返回主菜单

**关键函数**:
| 函数名 | 功能描述 |
|--------|----------|
| `install_realm()` | 下载安装 Realm 并配置 systemd 服务 |
| `add_forward()` | 添加单条转发规则 |
| `add_range_forward()` | 添加端口段批量转发 |
| `delete_forward()` | 删除指定转发规则 |
| `panel_management()` | Web 面板管理子菜单 |
| `validate_port()` | 端口有效性校验 (1-65535) |
| `validate_ip()` | IP/域名格式校验 |
| `check_port_available()` | 端口占用检测 |
| `check_rule_exists()` | 规则重复检测 |

---

### 2. Go Web 后端 (`web/main.go`)

**文件位置**: `web/main.go` (371 行)

**技术框架**:
- **Web 框架**: Gin v1.10.0
- **Session 管理**: gin-contrib/sessions (cookie-based)
- **配置解析**: BurntSushi/toml

**数据结构**:
```go
// 转发规则
type ForwardingRule struct {
    Listen string `toml:"listen" json:"listen"`  // 监听地址 "0.0.0.0:端口"
    Remote string `toml:"remote" json:"remote"`  // 目标地址 "IP:端口"
}

// Realm 配置
type Config struct {
    Network struct {
        NoTCP  bool `toml:"no_tcp"`
        UseUDP bool `toml:"use_udp"`
    }
    Endpoints []ForwardingRule `toml:"endpoints"`
}

// 面板配置
type PanelConfig struct {
    Auth   struct { Password string }
    Server struct { Port int }
    HTTPS  struct { Enabled bool; CertFile, KeyFile string }
}
```

**API 接口**:
| 方法 | 路径 | 功能 |
|------|------|------|
| GET | `/login` | 登录页面 |
| POST | `/login` | 密码验证登录 |
| GET | `/get_rules?page=&size=` | 获取转发规则（分页） |
| POST | `/add_rule` | 添加转发规则 |
| DELETE | `/delete_rule?listen=` | 删除转发规则 |
| POST | `/start_service` | 启动 Realm 服务 |
| POST | `/stop_service` | 停止 Realm 服务 |
| POST | `/restart_service` | 重启 Realm 服务 |
| GET | `/check_status` | 检查服务状态 |
| POST | `/logout` | 登出 |

**安全特性**:
- Session 认证中间件 (`AuthRequired`)
- HTTPS 支持与自动重定向 (`HTTPSRedirect`)
- 2 小时 Session 过期

---

### 3. 前端界面 (`web/static/app.js`)

**文件位置**: `web/static/app.js` (370 行)

**核心功能**:
- 服务状态实时显示（运行中/已停止）
- 转发规则表格（分页、删除）
- 单条规则添加（本地端口、远程IP、远程端口）
- 批量规则添加（多行文本格式）
- 服务启停控制按钮
- 登出功能

**关键函数**:
| 函数名 | 功能描述 |
|--------|----------|
| `updateServiceStatus()` | 轮询服务状态 |
| `fetchForwardingRules()` | 获取并渲染规则列表 |
| `renderForwardingRules()` | 渲染规则表格 |
| `renderPagination()` | 渲染分页控件 |

---

## 配置文件

### Realm 转发配置

**路径**: `/root/.realm/config.toml`

```toml
[network]
no_tcp = false    # 是否关闭 TCP 转发
use_udp = true    # 是否开启 UDP 转发

# 转发规则示例
[[endpoints]]
listen = "0.0.0.0:1234"      # 本地监听端口
remote = "192.168.1.1:5678"  # 目标地址
```

### 面板配置

**路径**: `web/config.toml`

```toml
[auth]
password = "123456"   # 登录密码

[server]
port = 8081           # 面板端口

[https]
enabled = false                           # HTTPS 开关
cert_file = "./certificate/cert.pem"      # 证书文件
key_file = "./certificate/private.key"    # 私钥文件
```

---

## 技术栈

| 层级 | 技术 | 版本 |
|------|------|------|
| 脚本 | Bash + systemd | - |
| 后端 | Go + Gin + TOML | Go 1.23.4 |
| 前端 | 原生 JavaScript + CSS | ES6+ |
| 转发引擎 | Realm (Rust 高性能代理) | v2.6.0+ |

---

## 部署架构

```
┌─────────────────────────────────────────────────────┐
│                    用户访问                          │
└─────────────────────┬───────────────────────────────┘
                      │
        ┌─────────────┴─────────────┐
        │                           │
        ▼                           ▼
┌───────────────┐           ┌───────────────┐
│  realm.sh     │           │  Web 面板      │
│  (命令行管理)  │           │  (HTTP/HTTPS) │
└───────┬───────┘           └───────┬───────┘
        │                           │
        └─────────────┬─────────────┘
                      │
                      ▼
        ┌─────────────────────────┐
        │   /root/.realm/         │
        │   config.toml           │
        │   (转发规则配置)         │
        └─────────────┬───────────┘
                      │
                      ▼
        ┌─────────────────────────┐
        │   Realm 服务            │
        │   (systemd 管理)        │
        │   端口转发引擎           │
        └─────────────────────────┘
```

---

## 关键特点

1. **双模式管理**：命令行脚本 + Web 面板，满足不同使用场景
2. **多架构支持**：x86_64 / aarch64 自动识别下载
3. **防护机制**：
   - 端口格式校验 (1-65535)
   - 端口占用检测
   - 规则重复检测
   - 连续错误自动返回
4. **HTTPS 安全**：支持证书配置，推荐生产环境开启
5. **Session 管理**：2 小时自动过期，cookie-based 认证

---

## 使用方式

### 一键安装脚本
```bash
curl -L https://raw.githubusercontent.com/wsuming97/vps-Realm/refs/heads/main/realm.sh -o realm.sh && chmod +x realm.sh && ./realm.sh
```

### 脚本菜单
```
################################################
#        Realm 一键转发脚本 (v3.1.2)         #
################################################
 Realm 状态: 运行中
 面板 状态: 已安装但未启动
------------------------------------------------
  1. 安装 / 重置 Realm
  2. 卸载 Realm
------------------------------------------------
  3. 添加转发规则
  4. 添加端口段转发
  5. 删除转发规则
  6. 查看当前配置
------------------------------------------------
  7. 启动服务
  8. 停止服务
  9. 重启服务
------------------------------------------------
  10. 更新脚本
  11. 面板管理
  0. 退出脚本
################################################
```

---

## 文件依赖关系

```
realm.sh
├── 调用 → systemctl (realm.service)
├── 读写 → /root/.realm/config.toml
├── 安装 → /root/realm/realm (二进制)
└── 管理 → web/ (面板服务)

web/main.go
├── 读取 → /root/.realm/config.toml (转发规则)
├── 读取 → ./config.toml (面板配置)
├── 调用 → systemctl (realm 服务控制)
└── 提供 → HTTP/HTTPS API
```
