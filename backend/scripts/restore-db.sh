#!/bin/bash

# Load environment variables
if [ -f .env ]; then
  export $(grep -v '^#' .env | xargs)
fi

DB_URL=${SUPABASE_DATABASE_URL:-$DATABASE_URL}
BACKUP_FILE=$1

if [ -z "$DB_URL" ]; then
  echo "❌ [Restore] Error: SUPABASE_DATABASE_URL or DATABASE_URL is not set."
  exit 1
fi

if [ -z "$BACKUP_FILE" ]; then
  echo "❌ [Restore] Error: Please specify the backup file to restore."
  echo "Usage: ./restore-db.sh <path_to_backup_file>"
  exit 1
fi

if [ ! -f "$BACKUP_FILE" ]; then
  echo "❌ [Restore] Error: Backup file not found: $BACKUP_FILE"
  exit 1
fi

echo "⚠️ WARNING: This will overwrite tables in the database with the backup content."
read -p "Are you sure you want to proceed? (y/n) " -n 1 -r
echo
if [[ ! $REPLY =~ ^[Yy]$ ]]
then
    echo "❌ Restore cancelled by user."
    exit 1
fi

echo "🚀 Starting database restore..."
echo "📂 Source file: $BACKUP_FILE"

# Run pg_restore using connection string
# --clean: drop database objects before recreating them
# --no-owner: skip restoration of object ownership
# --no-acl: skip restoration of access privileges (roles/grants)
if pg_restore --clean --no-owner --no-acl -d "$DB_URL" "$BACKUP_FILE"; then
  echo "✅ Database restore completed successfully!"
else
  echo "❌ Database restore failed!"
  exit 1
fi
