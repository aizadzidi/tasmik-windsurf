# 📋 Database Scripts to Run in Supabase

## **Required Scripts (Run in this order):**

### 1. **Update Score Constraints**
**File:** `update-juz-tests-constraints.sql`
**Purpose:** Allow scores up to 5/5 for all categories
```sql
-- Run this first to update existing table constraints
```

### 2. **Remove Surah Category**
**File:** `remove-surah-category.sql`
**Purpose:** Remove unused surah test category
```sql
-- Run this second to clean up database structure
```

## **How to Run:**
1. Open your Supabase Project Dashboard
2. Go to SQL Editor
3. Copy and paste each script
4. Click "Run" for each script
5. Verify no errors in output

## **After Running Scripts:**
- Test the Juz Tests feature
- Verify scoring totals to 100%
- Check that all default scores start at 0
- Confirm mutual exclusivity of test types

---
**Note:** Keep this file for reference. Delete after running scripts successfully.