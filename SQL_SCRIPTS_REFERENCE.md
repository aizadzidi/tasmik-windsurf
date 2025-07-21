# SQL Scripts Reference Guide

## Active Scripts (Current)

### 1. `supabase-complete-setup.sql` (MASTER SCRIPT)
**Purpose:** Complete database setup from scratch  
**When to use:** New installations or complete rebuild  
**What it does:**
- Creates all tables (users, students, classes, reports)
- Sets up all RLS policies
- Inserts seed data (9 classes)
- Creates all indexes
- Includes verification queries

### 2. `classes-rls-only.sql` (ENHANCEMENT SCRIPT)
**Purpose:** Add class system to existing installation  
**When to use:** Adding class functionality to existing memorization system  
**What it does:**
- Creates classes table with 9 Islamic classes
- Sets up proper RLS policies
- Adds class_id column to students table
- Creates performance indexes

### 3. `debug-classes.sql` (DEBUGGING SCRIPT)
**Purpose:** Comprehensive debugging for classes table  
**When to use:** When class dropdowns are empty or not working  
**What it checks:**
- Classes exist in database
- RLS policies are correct
- Current user can access classes
- Students table structure
- Provides troubleshooting information

## Removed Scripts (Cleaned Up)

The following scripts have been consolidated into the master scripts above:
- ❌ `create-classes-only.sql` → Now part of `supabase-complete-setup.sql`
- ❌ `add-class-column.sql` → Now part of `supabase-complete-setup.sql`
- ❌ `check-tables.sql` → Functionality in `debug-classes.sql`
- ❌ `disable-classes-rls.sql` → Removed (security risk)
- ❌ `fix-classes-policy.sql` → Consolidated into working solution
- ❌ `proper-classes-rls.sql` → Consolidated into `classes-rls-only.sql`
- ❌ `supabase-setup-step1.sql` → Consolidated into master script

## Quick Setup Guide

### For New Installation (Complete Setup):
```bash
# 1. Run master setup script
Run: supabase-complete-setup.sql

# 2. Verify everything works
Run: debug-classes.sql

# Done! Complete system ready.
```

### For Existing Installation (Add Class System):
```bash
# 1. Add class functionality
Run: classes-rls-only.sql

# 2. Verify classes work
Run: debug-classes.sql

# Done! Class assignment system added.
```

### For Troubleshooting:
```bash
# 1. Debug classes access
Run: debug-classes.sql

# 2. If issues found, re-run setup
Run: classes-rls-only.sql

# 3. Verify fix
Run: debug-classes.sql
```

## Script Dependencies

```
NEW INSTALLATION:
supabase-complete-setup.sql (master)
    ↓
debug-classes.sql (verification)

EXISTING INSTALLATION:
classes-rls-only.sql (enhancement)
    ↓
debug-classes.sql (verification)
```

## Expected Results

### After `supabase-complete-setup.sql`:
- All tables created (users, students, classes, reports)
- All RLS policies configured
- 9 classes inserted
- All indexes created
- Complete system ready

### After `classes-rls-only.sql`:
- Classes table added to existing system
- class_id column added to students
- RLS policies working correctly
- Class dropdowns populated in UI

### After `debug-classes.sql`:
- Should return 9 classes
- RLS policies listed
- No access errors
- Students table structure confirmed

## Common Error Messages

| Error | Cause | Solution |
|-------|-------|----------|
| `relation "classes" does not exist` | Classes table not created | Run `create-classes-only.sql` |
| `column "class_id" does not exist` | Column not added to students | Run `add-class-column.sql` |
| `permission denied for table classes` | RLS blocking access | Run `classes-rls-only.sql` |
| `relation "subjects" does not exist` | Script references non-existent table | Use `classes-rls-only.sql` instead |

---

**Last Updated:** 2025-01-21  
**Version:** 2.0 (Cleaned up and consolidated)  
**Quick Reference:** Always run `debug-classes.sql` after any changes to verify everything is working correctly!
