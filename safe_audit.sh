#!/bin/bash

MODEL="qwen2.5-coder:7b"
OUT="audit_report.txt"
TMP_DIR="audit_chunks"

rm -rf "$TMP_DIR" "$OUT"
mkdir -p "$TMP_DIR"

echo "🔍 Building safe audit chunks..."

# 1. Create clean file list
find . \
  -type f \
  \( -name "*.ts" -o -name "*.js" -o -name "*.py" -o -name "*.go" -o -name "*.java" -o -name "*.cpp" -o -name "*.c" \) \
  -not -path "*/node_modules/*" \
  -not -path "*/dist/*" \
  -not -path "*/build/*" \
  -not -path "*/.git/*" \
  > "$TMP_DIR/files.txt"

# 2. SAFER chunking (IMPORTANT for 8GB RAM)
split -l 3 "$TMP_DIR/files.txt" "$TMP_DIR/group_"

echo "⚙️ Running audit..."

# 3. Process each group safely
for group in $TMP_DIR/group_*; do

  echo "===== Processing $group ====="

  CHUNK_CONTENT=""

  while read file; do
    [ -f "$file" ] || continue
    CHUNK_CONTENT+="\n\n===== FILE: $file =====\n"
    CHUNK_CONTENT+="$(cat "$file")"
  done < "$group"

  # skip empty groups
  if [ -z "$CHUNK_CONTENT" ]; then
    continue
  fi

  # 4. Retry logic (safe)
  for attempt in 1 2; do

    echo "→ Attempt $attempt for $group"

    RESPONSE=$(echo -e "$CHUNK_CONTENT" | ollama run $MODEL "
You are a senior software architect.

IMPORTANT RULES:
- Only analyze this chunk
- Do NOT assume full project context
- Be strict and practical
- Find only real issues

OUTPUT FORMAT:
- ISSUE
- SEVERITY (CRITICAL / HIGH / MEDIUM / LOW)
- EXPLANATION
")

    EXIT_CODE=$?

    # allow model to cool down (CRITICAL for 8GB stability)
    sleep 4
    ollama stop $MODEL >/dev/null 2>&1

    if [ $EXIT_CODE -eq 0 ] && [ -n "$RESPONSE" ]; then
      echo "===== GROUP: $group =====" >> "$OUT"
      echo "$RESPONSE" >> "$OUT"
      echo "" >> "$OUT"
      break
    else
      echo "⚠️ Retry failed for $group (attempt $attempt)"
      sleep 5
    fi

  done

done

echo "🧠 Finalizing report..."

# 5. Final merge pass (deduplicate + structure)
cat "$OUT" | ollama run $MODEL "
You are a senior code auditor.

Merge and deduplicate all findings.

Output FINAL REPORT with sections:
- CRITICAL
- HIGH
- MEDIUM
- LOW

Be concise, remove duplicates, prioritize impact.
" > final_audit_report.txt

echo "✅ DONE"
echo "📄 Output: final_audit_report.txt"
