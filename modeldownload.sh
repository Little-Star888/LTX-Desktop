#!/bin/bash

BASE_URL="http://localhost:8000"

echo "=============================================="
echo "  LTX-Desktop 模型下载脚本"
echo "=============================================="

echo -e "\n=== 检查服务状态 ==="
HEALTH=$(curl -s $BASE_URL/health)
if [ -z "$HEALTH" ]; then
    echo "❌ 服务未启动，请先启动 LTX-Desktop"
    exit 1
fi
echo "✅ 服务正常运行"

echo -e "\n=== 当前模型状态 ==="
curl -s $BASE_URL/api/models/status | jq '{
  total_size_gb: .total_size_gb,
  downloaded_size_gb: .downloaded_size_gb,
  all_downloaded: .all_downloaded,
  models: [.models[] | {id, name, downloaded}]
}'

echo -e "\n=== 开始下载所有模型 ==="
echo "包含: checkpoint, upsampler, zit, text_encoder, distilled_lora, ic_lora, depth_processor, person_detector, pose_processor"
echo ""

RESPONSE=$(curl -s -X POST $BASE_URL/api/models/download \
  -H "Content-Type: application/json" \
  -d '{"modelTypes": ["checkpoint", "upsampler", "zit", "text_encoder", "distilled_lora"]}')

echo "$RESPONSE" | jq .

SESSION_ID=$(echo "$RESPONSE" | jq -r '.sessionId')

if [ "$SESSION_ID" == "null" ] || [ -z "$SESSION_ID" ]; then
    echo -e "\n❌ 下载启动失败"
    echo "可能原因: 已有下载任务在运行"
    exit 1
fi

echo -e "\n=============================================="
echo "  下载已开始"
echo "  Session ID: $SESSION_ID"
echo "=============================================="

echo -e "\n=== 实时监控下载进度 (按 Ctrl+C 退出) ==="
echo ""

format_size() {
    local bytes=$1
    local gb=$(awk "BEGIN {printf \"%.2f\", $bytes / 1073741824}")
    local mb=$(awk "BEGIN {printf \"%.2f\", $bytes / 1048576}")
    local kb=$(awk "BEGIN {printf \"%.2f\", $bytes / 1024}")
    if [ $(awk "BEGIN {print ($bytes >= 1073741824) ? 1 : 0}") -eq 1 ]; then
        echo "$gb GB"
    elif [ $(awk "BEGIN {print ($bytes >= 1048576) ? 1 : 0}") -eq 1 ]; then
        echo "$mb MB"
    else
        echo "$kb KB"
    fi
}

format_speed() {
    local bytes=$1
    local mbps=$(awk "BEGIN {printf \"%.1f\", $bytes / 1048576}")
    local kbps=$(awk "BEGIN {printf \"%.1f\", $bytes / 1024}")
    if [ $(awk "BEGIN {print ($bytes >= 1048576) ? 1 : 0}") -eq 1 ]; then
        echo "$mbps MB/s"
    else
        echo "$kbps KB/s"
    fi
}

while true; do
    PROGRESS=$(curl -s "$BASE_URL/api/models/download/progress?sessionId=$SESSION_ID" 2>/dev/null)
    
    if [ -z "$PROGRESS" ] || [ "$PROGRESS" == "null" ]; then
        sleep 2
        continue
    fi
    
    STATUS=$(echo "$PROGRESS" | jq -r '.status' 2>/dev/null)
    CURRENT_FILE=$(echo "$PROGRESS" | jq -r '.current_downloading_file' 2>/dev/null)
    FILE_PROGRESS=$(echo "$PROGRESS" | jq -r '.current_file_progress' 2>/dev/null)
    TOTAL_PROGRESS=$(echo "$PROGRESS" | jq -r '.total_progress' 2>/dev/null)
    DOWNLOADED=$(echo "$PROGRESS" | jq -r '.total_downloaded_bytes' 2>/dev/null)
    TOTAL=$(echo "$PROGRESS" | jq -r '.expected_total_bytes' 2>/dev/null)
    SPEED=$(echo "$PROGRESS" | jq -r '.speed_bytes_per_sec' 2>/dev/null)
    COMPLETED=$(echo "$PROGRESS" | jq -r '.completed_files | length' 2>/dev/null)
    TOTAL_FILES=$(echo "$PROGRESS" | jq -r '.all_files | length' 2>/dev/null)
    ERROR=$(echo "$PROGRESS" | jq -r '.error' 2>/dev/null)
    
    FILE_PROGRESS=$(awk "BEGIN {printf \"%.1f\", $FILE_PROGRESS}")
    TOTAL_PROGRESS=$(awk "BEGIN {printf \"%.1f\", $TOTAL_PROGRESS}")
    
    echo "=============================================="
    echo "  LTX-Desktop 模型下载进度"
    echo "=============================================="
    echo ""
    echo "状态: $STATUS"
    echo "当前文件: $CURRENT_FILE"
    echo "文件进度: ${FILE_PROGRESS}%"
    echo "总进度: ${TOTAL_PROGRESS}%"
    echo "已下载: $(format_size $DOWNLOADED) / $(format_size $TOTAL)"
    echo "下载速度: $(format_speed $SPEED)"
    echo "完成文件: $COMPLETED / $TOTAL_FILES"
    echo ""
    
    if [ "$STATUS" == "complete" ]; then
        echo "✅ 所有模型下载完成!"
        break
    fi
    
    if [ "$STATUS" == "error" ] || [ "$ERROR" != "null" ] && [ "$ERROR" != "" ]; then
        echo "❌ 下载出错: $ERROR"
        break
    fi
    
    if [ "$STATUS" == "cancelled" ]; then
        echo "⚠️ 下载已取消"
        break
    fi
    
    sleep 3
done

echo -e "\n=== 最终模型状态 ==="
curl -s $BASE_URL/api/models/status | jq '{
  all_downloaded: .all_downloaded,
  total_size_gb: .total_size_gb,
  downloaded_size_gb: .downloaded_size_gb
}'
