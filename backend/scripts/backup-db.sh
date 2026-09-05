#!/bin/bash

# Load environment variables
if [ -f .env ]; then
  export $(grep -v '^#' .env | xargs)
fi

DB_URL=${SUPABASE_DATABASE_URL:-$DATABASE_URL}

if [ -z "$DB_URL" ]; then
  echo "❌ [Backup] Error: SUPABASE_DATABASE_URL or DATABASE_URL is not set."
  exit 1
fi

# Define backup directory and filename
BACKUP_DIR="./backups"
mkdir -p "$BACKUP_DIR"
TIMESTAMP=$(date +"%Y%m%d_%H%M%S")
BACKUP_FILE="$BACKUP_DIR/globalpay_backup_$TIMESTAMP.dump"

echo "🚀 Starting database backup..."
echo "📂 Output file: $BACKUP_FILE"

# Run pg_dump using connection string
if pg_dump "$DB_URL" -Fc -f "$BACKUP_FILE"; then
  echo "✅ Database backup created successfully!"
  
  # Optional: Keep only the last 7 days of backups
  echo "🧹 Cleaning up backups older than 7 days..."
  find "$BACKUP_DIR" -type f -name "globalpay_backup_*.dump" -mtime +7 -delete
  echo "✔️ Cleanup complete."
else
  echo "❌ Database backup failed!"
  exit 1
fi
