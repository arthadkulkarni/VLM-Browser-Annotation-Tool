#!/usr/bin/env python3
"""
Database Migration Script for Browser Annotation Tool

This script migrates the database schema to add new fields:
- Query table:
  - Migrates 'tag' or 'query_type' column to 'query_types' (TEXT storing JSON array)
  - Converts single query type values to JSON array format (e.g., "identity" -> '["identity"]')
  - Changes status from pending/finished to unverified/verified
- Annotation table: adds 'is_annotated' column

The script preserves all existing data and only modifies the schema.
It is safe to run multiple times - it will skip already completed migrations.

Usage:
    python migrate_schema.py

Requirements:
    - PostgreSQL database must be running
    - DATABASE_URL environment variable must be set (or .env file present)
"""

import os
import sys
from dotenv import load_dotenv
import psycopg2
from psycopg2 import sql

# Load environment variables
load_dotenv()

def get_database_connection():
    """Create and return a database connection."""
    database_url = os.environ.get('DATABASE_URL')
    if not database_url:
        print("Error: DATABASE_URL environment variable is not set.")
        print("Please configure PostgreSQL connection in .env file")
        sys.exit(1)

    try:
        conn = psycopg2.connect(database_url)
        return conn
    except psycopg2.Error as e:
        print(f"Error connecting to database: {e}")
        sys.exit(1)

def column_exists(cursor, table_name, column_name):
    """Check if a column exists in a table."""
    cursor.execute("""
        SELECT EXISTS (
            SELECT 1
            FROM information_schema.columns
            WHERE table_name = %s AND column_name = %s
        )
    """, (table_name, column_name))
    return cursor.fetchone()[0]

def migrate_queries_table(cursor):
    """
    Migrate the queries table:
    1. Handle 'tag' to 'query_type' column rename (if upgrading from old schema)
    2. Add 'query_type' column with default 'negative' (if fresh install)
    3. Migrate 'query_type' to 'query_types' (TEXT column storing JSON array)
    4. Migrate status values: 'pending' -> 'unverified', 'finished' -> 'verified'
    """
    print("\n--- Migrating 'queries' table ---")

    # Check for old 'tag' column and new 'query_type'/'query_types' columns
    has_tag_column = column_exists(cursor, 'queries', 'tag')
    has_query_type_column = column_exists(cursor, 'queries', 'query_type')
    has_query_types_column = column_exists(cursor, 'queries', 'query_types')

    if has_tag_column and not has_query_type_column and not has_query_types_column:
        # Upgrade scenario: rename 'tag' to 'query_types' and convert to JSON array
        print("Found old 'tag' column, migrating to 'query_types' as JSON array...")
        cursor.execute("""
            ALTER TABLE queries
            ADD COLUMN query_types TEXT DEFAULT '["negative"]'
        """)
        # Convert existing tag values to JSON array format
        cursor.execute("""
            UPDATE queries
            SET query_types = '["' || COALESCE(tag, 'negative') || '"]'
        """)
        cursor.execute("""
            ALTER TABLE queries
            DROP COLUMN tag
        """)
        print("  - Migrated 'tag' column to 'query_types' as JSON array")
    elif has_query_type_column and not has_query_types_column:
        # Upgrade scenario: migrate 'query_type' to 'query_types' as JSON array
        print("Found 'query_type' column, migrating to 'query_types' as JSON array...")
        cursor.execute("""
            ALTER TABLE queries
            ADD COLUMN query_types TEXT DEFAULT '["negative"]'
        """)
        # Convert existing query_type values to JSON array format
        cursor.execute("""
            UPDATE queries
            SET query_types = '["' || COALESCE(query_type, 'negative') || '"]'
        """)
        cursor.execute("""
            ALTER TABLE queries
            DROP COLUMN query_type
        """)
        print("  - Migrated 'query_type' column to 'query_types' as JSON array")
    elif not has_query_types_column:
        # Fresh install: add 'query_types' column
        print("Adding 'query_types' column to queries table...")
        cursor.execute("""
            ALTER TABLE queries
            ADD COLUMN query_types TEXT DEFAULT '["negative"]'
        """)
        print("  - Added 'query_types' column with default value '[\"negative\"]'")
    else:
        print("  - 'query_types' column already exists, skipping...")

    # Migrate status values
    print("Migrating query status values...")

    # Count records to be migrated
    cursor.execute("SELECT COUNT(*) FROM queries WHERE status = 'pending'")
    pending_count = cursor.fetchone()[0]

    cursor.execute("SELECT COUNT(*) FROM queries WHERE status = 'finished'")
    finished_count = cursor.fetchone()[0]

    # Update 'pending' to 'unverified'
    cursor.execute("""
        UPDATE queries
        SET status = 'unverified'
        WHERE status = 'pending'
    """)
    print(f"  - Migrated {pending_count} queries from 'pending' to 'unverified'")

    # Update 'finished' to 'verified'
    cursor.execute("""
        UPDATE queries
        SET status = 'verified'
        WHERE status = 'finished'
    """)
    print(f"  - Migrated {finished_count} queries from 'finished' to 'verified'")

    # Update any NULL query_types to default
    cursor.execute("""
        UPDATE queries
        SET query_types = '["negative"]'
        WHERE query_types IS NULL OR query_types = ''
    """)
    print("  - Set default query_types '[\"negative\"]' for any NULL/empty values")

    print("Queries table migration complete!")

def migrate_annotations_table(cursor):
    """
    Migrate the annotations table:
    1. Add 'is_annotated' column with default 'unannotated'
    """
    print("\n--- Migrating 'annotations' table ---")

    # Add 'is_annotated' column if it doesn't exist
    if not column_exists(cursor, 'annotations', 'is_annotated'):
        print("Adding 'is_annotated' column to annotations table...")
        cursor.execute("""
            ALTER TABLE annotations
            ADD COLUMN is_annotated VARCHAR(20) DEFAULT 'unannotated'
        """)
        print("  - Added 'is_annotated' column with default value 'unannotated'")
    else:
        print("  - 'is_annotated' column already exists, skipping...")

    # Update any NULL values to 'unannotated'
    cursor.execute("""
        UPDATE annotations
        SET is_annotated = 'unannotated'
        WHERE is_annotated IS NULL
    """)
    print("  - Set default 'unannotated' for any NULL values")

    print("Annotations table migration complete!")

def print_table_stats(cursor):
    """Print statistics about the tables after migration."""
    print("\n--- Migration Statistics ---")

    # Queries stats
    cursor.execute("SELECT COUNT(*) FROM queries")
    total_queries = cursor.fetchone()[0]

    cursor.execute("SELECT COUNT(*) FROM queries WHERE status = 'verified'")
    verified_queries = cursor.fetchone()[0]

    cursor.execute("SELECT COUNT(*) FROM queries WHERE status = 'unverified'")
    unverified_queries = cursor.fetchone()[0]

    cursor.execute("SELECT query_types, COUNT(*) FROM queries GROUP BY query_types ORDER BY query_types")
    query_types_counts = cursor.fetchall()

    print(f"\nQueries Table:")
    print(f"  Total queries: {total_queries}")
    print(f"  Verified: {verified_queries}")
    print(f"  Unverified: {unverified_queries}")
    print(f"  Query types distribution:")
    for query_types, count in query_types_counts:
        print(f"    - {query_types or 'NULL'}: {count}")

    # Annotations stats
    cursor.execute("SELECT COUNT(*) FROM annotations")
    total_annotations = cursor.fetchone()[0]

    cursor.execute("SELECT COUNT(*) FROM annotations WHERE is_annotated = 'annotated'")
    annotated_count = cursor.fetchone()[0]

    cursor.execute("SELECT COUNT(*) FROM annotations WHERE is_annotated = 'unannotated'")
    unannotated_count = cursor.fetchone()[0]

    print(f"\nAnnotations Table:")
    print(f"  Total annotations: {total_annotations}")
    print(f"  Annotated: {annotated_count}")
    print(f"  Unannotated: {unannotated_count}")

def main():
    """Main migration function."""
    print("=" * 60)
    print("Database Schema Migration Script")
    print("=" * 60)
    print("\nThis script will:")
    print("  1. Migrate to 'query_types' column (JSON array) from 'tag' or 'query_type'")
    print("  2. Migrate query status: 'pending' -> 'unverified', 'finished' -> 'verified'")
    print("  3. Add 'is_annotated' column to annotations table (default: 'unannotated')")
    print("\nAll existing data will be preserved. Safe to run multiple times.")

    # Ask for confirmation
    response = input("\nDo you want to proceed? (y/N): ").strip().lower()
    if response != 'y':
        print("Migration cancelled.")
        sys.exit(0)

    # Connect to database
    print("\nConnecting to database...")
    conn = get_database_connection()
    cursor = conn.cursor()

    try:
        # Run migrations
        migrate_queries_table(cursor)
        migrate_annotations_table(cursor)

        # Commit changes
        conn.commit()
        print("\n" + "=" * 60)
        print("Migration completed successfully!")
        print("=" * 60)

        # Print statistics
        print_table_stats(cursor)

    except Exception as e:
        # Rollback on error
        conn.rollback()
        print(f"\nError during migration: {e}")
        print("All changes have been rolled back.")
        sys.exit(1)
    finally:
        cursor.close()
        conn.close()

if __name__ == '__main__':
    main()
