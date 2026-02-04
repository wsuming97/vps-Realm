#!/bin/bash

# Realm Web 面板部署脚本
# 功能：自动安装 Go 环境、编译项目、配置 systemd 服务

set -e

# 颜色定义
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m'

# 配置变量
GO_VERSION="1.21.0"
INSTALL_DIR="/root/realm/web"
SERVICE_NAME="realm_web"
GO_INSTALL_DIR="/usr/local"

print_msg() {
    echo -e "${GREEN}[INFO]${NC} $1"
}

print_warn() {
    echo -e "${YELLOW}[WARN]${NC} $1"
}

print_error() {
    echo -e "${RED}[ERROR]${NC} $1"
}

print_step() {
    echo -e "${BLUE}[STEP]${NC} $1"
}

# 检查是否为 root 用户
check_root() {
    if [[ $EUID -ne 0 ]]; then
        print_error "请使用 root 用户运行此脚本"
        exit 1
    fi
}

# 检测系统架构
detect_arch() {
    local arch=$(uname -m)
    case $arch in
        x86_64)
            echo "amd64"
            ;;
        aarch64|arm64)
            echo "arm64"
            ;;
        armv7l)
            echo "armv6l"
            ;;
        *)
            print_error "不支持的架构: $arch"
            exit 1
            ;;
    esac
}

# 检测操作系统
detect_os() {
    local os=$(uname -s | tr '[:upper:]' '[:lower:]')
    case $os in
        linux)
            echo "linux"
            ;;
        darwin)
            echo "darwin"
            ;;
        *)
            print_error "不支持的操作系统: $os"
            exit 1
            ;;
    esac
}

# 检查 Go 是否已安装
check_go() {
    if command -v go &> /dev/null; then
        local current_version=$(go version | awk '{print $3}' | sed 's/go//')
        print_msg "检测到 Go 版本: $current_version"
        return 0
    else
        return 1
    fi
}

# 安装 Go
install_go() {
    print_step "开始安装 Go ${GO_VERSION}..."
    
    local os=$(detect_os)
    local arch=$(detect_arch)
    local go_tar="go${GO_VERSION}.${os}-${arch}.tar.gz"
    local download_url="https://go.dev/dl/${go_tar}"
    
    print_msg "下载地址: $download_url"
    
    # 下载 Go
    cd /tmp
    if command -v wget &> /dev/null; then
        wget -q --show-progress "$download_url" -O "$go_tar"
    elif command -v curl &> /dev/null; then
        curl -L -o "$go_tar" "$download_url"
    else
        print_error "需要 wget 或 curl 来下载文件"
        exit 1
    fi
    
    # 移除旧版本
    if [ -d "${GO_INSTALL_DIR}/go" ]; then
        print_warn "移除旧版本 Go..."
        rm -rf "${GO_INSTALL_DIR}/go"
    fi
    
    # 解压安装
    print_msg "解压 Go 到 ${GO_INSTALL_DIR}..."
    tar -C "$GO_INSTALL_DIR" -xzf "$go_tar"
    
    # 清理下载文件
    rm -f "$go_tar"
    
    # 配置环境变量
    if ! grep -q "export PATH=.*\/go\/bin" /etc/profile; then
        echo 'export PATH=$PATH:/usr/local/go/bin' >> /etc/profile
    fi
    
    # 立即生效
    export PATH=$PATH:/usr/local/go/bin
    
    # 验证安装
    if check_go; then
        print_msg "Go 安装成功!"
    else
        print_error "Go 安装失败"
        exit 1
    fi
}

# 编译项目
build_project() {
    print_step "开始编译项目..."
    
    # 获取脚本所在目录
    local script_dir="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
    cd "$script_dir"
    
    print_msg "工作目录: $(pwd)"
    
    # 检查 go.mod 是否存在
    if [ ! -f "go.mod" ]; then
        print_error "未找到 go.mod 文件，请确保在正确的目录运行"
        exit 1
    fi
    
    # 设置 Go 代理（国内加速）
    export GOPROXY=https://goproxy.cn,direct
    
    # 下载依赖
    print_msg "下载依赖..."
    go mod download
    
    # 编译
    print_msg "编译中..."
    go build -o realm_web main.go
    
    if [ -f "realm_web" ]; then
        chmod +x realm_web
        print_msg "编译成功: $(pwd)/realm_web"
    else
        print_error "编译失败"
        exit 1
    fi
}

# 创建 systemd 服务
create_service() {
    print_step "创建 systemd 服务..."
    
    local script_dir="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
    
    cat > /etc/systemd/system/${SERVICE_NAME}.service << EOF
[Unit]
Description=Realm Web Panel
After=network.target

[Service]
Type=simple
User=root
WorkingDirectory=${script_dir}
ExecStart=${script_dir}/realm_web
Restart=always
RestartSec=5

[Install]
WantedBy=multi-user.target
EOF

    # 重新加载 systemd
    systemctl daemon-reload
    
    print_msg "服务创建成功: ${SERVICE_NAME}.service"
}

# 启动服务
start_service() {
    print_step "启动服务..."
    
    systemctl enable ${SERVICE_NAME}
    systemctl restart ${SERVICE_NAME}
    
    sleep 2
    
    if systemctl is-active --quiet ${SERVICE_NAME}; then
        print_msg "服务启动成功!"
        systemctl status ${SERVICE_NAME} --no-pager
    else
        print_error "服务启动失败"
        journalctl -u ${SERVICE_NAME} -n 20 --no-pager
        exit 1
    fi
}

# 停止服务
stop_service() {
    print_step "停止服务..."
    systemctl stop ${SERVICE_NAME} 2>/dev/null || true
    print_msg "服务已停止"
}

# 查看服务状态
status_service() {
    systemctl status ${SERVICE_NAME} --no-pager
}

# 查看日志
view_logs() {
    journalctl -u ${SERVICE_NAME} -f
}

# 卸载
uninstall() {
    print_step "开始卸载..."
    
    # 停止并禁用服务
    systemctl stop ${SERVICE_NAME} 2>/dev/null || true
    systemctl disable ${SERVICE_NAME} 2>/dev/null || true
    
    # 删除服务文件
    rm -f /etc/systemd/system/${SERVICE_NAME}.service
    systemctl daemon-reload
    
    print_msg "卸载完成"
}

# 显示帮助
show_help() {
    echo "Realm Web 面板部署脚本"
    echo ""
    echo "用法: $0 [命令]"
    echo ""
    echo "命令:"
    echo "  install     完整安装 (Go + 编译 + 服务)"
    echo "  build       仅编译项目"
    echo "  service     仅创建并启动服务"
    echo "  start       启动服务"
    echo "  stop        停止服务"
    echo "  restart     重启服务"
    echo "  status      查看服务状态"
    echo "  logs        查看服务日志"
    echo "  uninstall   卸载服务"
    echo "  help        显示此帮助"
    echo ""
    echo "示例:"
    echo "  $0 install    # 完整安装"
    echo "  $0 build      # 仅重新编译"
    echo "  $0 restart    # 重启服务"
}

# 完整安装
full_install() {
    print_msg "========== Realm Web 面板部署 =========="
    
    # 检查并安装 Go
    if ! check_go; then
        install_go
    fi
    
    # 编译项目
    build_project
    
    # 创建服务
    create_service
    
    # 启动服务
    start_service
    
    echo ""
    print_msg "========== 部署完成 =========="
    echo ""
    echo -e "访问地址: ${GREEN}http://服务器IP:8080${NC}"
    echo -e "配置文件: ${BLUE}$(pwd)/config.toml${NC}"
    echo -e "节点配置: ${BLUE}$(pwd)/nodes.toml${NC}"
    echo ""
    echo "常用命令:"
    echo "  $0 restart   # 重启服务"
    echo "  $0 logs      # 查看日志"
    echo "  $0 status    # 查看状态"
}

# 主函数
main() {
    case "${1:-install}" in
        install)
            check_root
            full_install
            ;;
        build)
            check_root
            if ! check_go; then
                install_go
            fi
            build_project
            ;;
        service)
            check_root
            create_service
            start_service
            ;;
        start)
            check_root
            start_service
            ;;
        stop)
            check_root
            stop_service
            ;;
        restart)
            check_root
            stop_service
            start_service
            ;;
        status)
            status_service
            ;;
        logs)
            view_logs
            ;;
        uninstall)
            check_root
            uninstall
            ;;
        help|--help|-h)
            show_help
            ;;
        *)
            print_error "未知命令: $1"
            show_help
            exit 1
            ;;
    esac
}

main "$@"
