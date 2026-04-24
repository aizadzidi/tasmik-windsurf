import { NextRequest, NextResponse } from 'next/server';
import { adminOperationSimple } from '@/lib/supabaseServiceClientSimple';
import { ensureUserProfile, resolveTenantIdFromRequest } from '@/lib/tenantProvisioning';
import { requireAdminPermission } from '@/lib/adminPermissions';
import {
  formatSupabaseAuthDeleteError,
  isSupabaseAuthUserNotFoundError,
} from '@/lib/supabaseAuthAdmin';
import { isMissingColumnError, isMissingRelationError } from "@/lib/online/db";
import {
  enforceTenantPlanLimit,
  TenantPlanLimitExceededError,
} from "@/lib/planLimits";
import { filterTeachersByTeachingScope, type TeachingScope } from "@/lib/adminTeacherScope";

type SupabaseMutationErrorLike = {
  code?: string | null;
  details?: string | null;
  message?: string | null;
};

type FilterableMutationQuery = PromiseLike<{ error: SupabaseMutationErrorLike | null }> & {
  eq: (column: string, value: unknown) => FilterableMutationQuery;
};

const isIgnorableMissingSchemaError = (
  error: SupabaseMutationErrorLike | null | undefined,
  table: string,
  columns: string[] = []
) =>
  Boolean(error) &&
  (isMissingRelationError(error, table) ||
    columns.some((column) => isMissingColumnError(error, column, table)));

// GET - Fetch users by role (admin only)
export async function GET(request: NextRequest) {
  try {
    const guard = await requireAdminPermission(request, [
      'admin:dashboard',
      'admin:crm',
      'admin:users',
    ]);
    if (!guard.ok) return guard.response;

    const { searchParams } = new URL(request.url);
    const role = searchParams.get('role');
    const teachingScopeParam = searchParams.get("teaching_scope");
    const teachingScope: TeachingScope | null =
      teachingScopeParam === "campus" || teachingScopeParam === "online"
        ? teachingScopeParam
        : null;
    const includeParentCandidates =
      searchParams.get('include_parent_candidates') === 'true';

    const data = await adminOperationSimple(async (client) => {
      const tenantId = await resolveTenantIdFromRequest(request, client);
      let tenantUserIds: string[] | null = null;
      if (tenantId) {
        const { data: tenantProfiles, error: tenantProfilesError } = await client
          .from('user_profiles')
          .select('user_id')
          .eq('tenant_id', tenantId);
        if (tenantProfilesError) throw tenantProfilesError;
        tenantUserIds = (tenantProfiles ?? [])
          .map((profile) => profile.user_id)
          .filter((value): value is string => Boolean(value));
      }

      if (tenantUserIds && tenantUserIds.length === 0) {
        return includeParentCandidates
          ? { users: [], parent_candidates: [] }
          : [];
      }

      let query = client
        .from('users')
        .select('*')
        .order('name');

      if (tenantUserIds) {
        query = query.in('id', tenantUserIds);
      }

      if (role) {
        query = query.eq('role', role);
      }

      const { data: users, error } = await query;
      if (error) throw error;
      if (!Array.isArray(users) || users.length === 0) {
        return [];
      }

      const scopedUsers =
        role === "teacher" && teachingScope
          ? await filterTeachersByTeachingScope(
              client,
              users
                .filter((user): user is typeof users[number] & { id: string } => Boolean(user?.id))
                .map((user) => ({ ...user, id: String(user.id) })),
              teachingScope,
              tenantId
            )
          : users;

      const parentIds = scopedUsers
        .filter((user) => user?.role === 'parent' && Boolean(user?.id))
        .map((user) => String(user.id));

      if (parentIds.length === 0) {
        return scopedUsers;
      }

      let studentsQuery = client
        .from('students')
        .select('id, name, parent_id, class_id, record_type')
        .in('parent_id', parentIds)
        .order('name');

      if (tenantId) {
        studentsQuery = studentsQuery.eq('tenant_id', tenantId);
      }

      const { data: students, error: studentsError } = await studentsQuery;
      if (studentsError) throw studentsError;

      const filteredStudents = (students ?? []).filter(
        (student) => student.record_type !== 'prospect'
      );
      const classIds = Array.from(
        new Set(
          filteredStudents
            .map((student) => student.class_id)
            .filter((value): value is string => Boolean(value))
        )
      );

      const classNameById: Record<string, string> = {};
      if (classIds.length > 0) {
        let classesQuery = client
          .from('classes')
          .select('id, name')
          .in('id', classIds);

        if (tenantId) {
          classesQuery = classesQuery.eq('tenant_id', tenantId);
        }

        const { data: classes, error: classesError } = await classesQuery;
        if (classesError) throw classesError;
        (classes ?? []).forEach((row) => {
          if (!row?.id) return;
          classNameById[String(row.id)] = String(row.name ?? '');
        });
      }

      const childrenByParent: Record<
        string,
        Array<{ id: string; name: string | null; class_name: string | null }>
      > = {};

      filteredStudents.forEach((student) => {
        if (!student?.parent_id || !student?.id) return;
        const parentId = String(student.parent_id);
        if (!childrenByParent[parentId]) childrenByParent[parentId] = [];
        childrenByParent[parentId].push({
          id: String(student.id),
          name: student.name ? String(student.name) : null,
          class_name: student.class_id ? classNameById[String(student.class_id)] || null : null,
        });
      });

      const enrichedUsers = scopedUsers.map((user) => {
        if (user?.role !== 'parent') return user;
        return {
          ...user,
          linked_children: childrenByParent[String(user.id)] ?? [],
        };
      });

      if (!includeParentCandidates) {
        return enrichedUsers;
      }

      let parentCandidatesQuery = client
        .from('students')
        .select('id, name, parent_id, class_id, record_type')
        .order('name');

      if (tenantId) {
        parentCandidatesQuery = parentCandidatesQuery.eq('tenant_id', tenantId);
      }

      const { data: parentCandidatesRows, error: parentCandidatesError } =
        await parentCandidatesQuery;
      if (parentCandidatesError) throw parentCandidatesError;

      const parentCandidateStudents = (parentCandidatesRows ?? []).filter(
        (student) => student.record_type !== 'prospect'
      );

      const missingClassIds = Array.from(
        new Set(
          parentCandidateStudents
            .map((student) => student.class_id)
            .filter(
              (value): value is string => Boolean(value) && !classNameById[String(value)]
            )
        )
      );

      if (missingClassIds.length > 0) {
        let extraClassesQuery = client
          .from('classes')
          .select('id, name')
          .in('id', missingClassIds);

        if (tenantId) {
          extraClassesQuery = extraClassesQuery.eq('tenant_id', tenantId);
        }

        const { data: extraClasses, error: extraClassesError } = await extraClassesQuery;
        if (extraClassesError) throw extraClassesError;
        (extraClasses ?? []).forEach((row) => {
          if (!row?.id) return;
          classNameById[String(row.id)] = String(row.name ?? '');
        });
      }

      const parentCandidates = parentCandidateStudents.map((student) => ({
        id: String(student.id),
        name: student.name ? String(student.name) : null,
        parent_id: student.parent_id ? String(student.parent_id) : null,
        class_name: student.class_id ? classNameById[String(student.class_id)] || null : null,
      }));

      return {
        users: enrichedUsers,
        parent_candidates: parentCandidates,
      };
    });
    
    return NextResponse.json(data);
  } catch (error: unknown) {
    console.error('Admin users fetch error:', error);
    const message = error instanceof Error ? error.message : 'Failed to fetch users';
    const status = message.includes('Admin access required') ? 403 : 500;
    return NextResponse.json(
      { error: message },
      { status }
    );
  }
}

// POST - Parent child linking actions (admin only)
export async function POST(request: NextRequest) {
  try {
    const guard = await requireAdminPermission(request, ['admin:users']);
    if (!guard.ok) return guard.response;

    const body = await request.json();
    const action = body?.action as string | undefined;
    const parentId = body?.parent_id as string | undefined;
    const childId = body?.child_id as string | undefined;

    if (!action || !parentId || !childId) {
      return NextResponse.json(
        { error: 'action, parent_id, and child_id are required' },
        { status: 400 }
      );
    }

    if (!['link-child', 'unlink-child'].includes(action)) {
      return NextResponse.json(
        { error: 'Invalid action. Must be link-child or unlink-child' },
        { status: 400 }
      );
    }

    const data = await adminOperationSimple(async (client) => {
      const { data: parentUser, error: parentUserError } = await client
        .from('users')
        .select('id, role')
        .eq('id', parentId)
        .maybeSingle();
      if (parentUserError) throw parentUserError;
      if (!parentUser?.id || parentUser.role !== 'parent') {
        throw new Error('Parent user not found');
      }

      const { data: parentProfile, error: parentProfileError } = await client
        .from('user_profiles')
        .select('tenant_id')
        .eq('user_id', parentId)
        .eq('tenant_id', guard.tenantId)
        .maybeSingle();
      if (parentProfileError) throw parentProfileError;
      if (!parentProfile?.tenant_id) {
        throw new Error('Parent does not belong to this tenant');
      }

      const { data: student, error: studentError } = await client
        .from('students')
        .select('id, name, parent_id, class_id, record_type')
        .eq('id', childId)
        .eq('tenant_id', guard.tenantId)
        .maybeSingle();
      if (studentError) throw studentError;
      if (!student?.id || student.record_type === 'prospect') {
        throw new Error('Child not found');
      }

      if (action === 'link-child') {
        if (student.parent_id && student.parent_id !== parentId) {
          throw new Error('Child is already linked to another parent');
        }

        const { error: linkError } = await client
          .from('students')
          .update({ parent_id: parentId })
          .eq('id', childId)
          .eq('tenant_id', guard.tenantId);
        if (linkError) throw linkError;
      }

      if (action === 'unlink-child') {
        if (student.parent_id !== parentId) {
          throw new Error('Child is not linked to this parent');
        }

        const { error: unlinkError } = await client
          .from('students')
          .update({ parent_id: null })
          .eq('id', childId)
          .eq('tenant_id', guard.tenantId)
          .eq('parent_id', parentId);
        if (unlinkError) throw unlinkError;
      }

      let className: string | null = null;
      if (student.class_id) {
        const { data: classRow, error: classError } = await client
          .from('classes')
          .select('name')
          .eq('tenant_id', guard.tenantId)
          .eq('id', student.class_id)
          .maybeSingle();
        if (classError) throw classError;
        className = classRow?.name ? String(classRow.name) : null;
      }

      return {
        id: String(student.id),
        name: student.name ? String(student.name) : null,
        parent_id: action === 'link-child' ? parentId : null,
        class_name: className,
      };
    });

    return NextResponse.json(data);
  } catch (error: unknown) {
    console.error('Admin parent-child action error:', error);
    const message =
      error instanceof Error ? error.message : 'Failed to update parent-child link';
    const status =
      message.includes('Admin access required')
        ? 403
        : message.includes('not found')
          ? 404
          : message.includes('already linked')
            ? 409
            : 500;
    return NextResponse.json({ error: message }, { status });
  }
}

// PUT - Update user role (admin only)
export async function PUT(request: NextRequest) {
  try {
    const guard = await requireAdminPermission(request, ['admin:users']);
    if (!guard.ok) return guard.response;

    const body = await request.json();
    const { id, role } = body;

    if (!id || !role) {
      return NextResponse.json(
        { error: 'User ID and role are required' },
        { status: 400 }
      );
    }

    if (!['admin', 'teacher', 'parent', 'general_worker', 'student'].includes(role)) {
      return NextResponse.json(
        { error: 'Invalid role. Must be admin, teacher, parent, general_worker, or student' },
        { status: 400 }
      );
    }

    const data = await adminOperationSimple(async (client) => {
      const profile = await ensureUserProfile({
        request,
        userId: id,
        supabaseAdmin: client,
      });
      if (!profile) {
        throw new Error(`Missing user profile for userId=${id}`);
      }
      if (!profile.tenant_id) {
        throw new Error(`User profile missing tenant_id for userId=${id}`);
      }

      const { data: currentUserRow, error: currentUserError } = await client
        .from("users")
        .select("role")
        .eq("id", id)
        .maybeSingle();
      if (currentUserError) throw currentUserError;

      const wasStaff =
        currentUserRow?.role === "admin" || currentUserRow?.role === "teacher";
      const willBeStaff = role === "admin" || role === "teacher";
      if (!wasStaff && willBeStaff) {
        await enforceTenantPlanLimit({
          client,
          tenantId: profile.tenant_id,
          addStaff: 1,
        });
      }

      const { data, error } = await client
        .from('users')
        .update({ role })
        .eq('id', id)
        .select()
        .single();

      if (error) throw error;

      try {
        const refreshedProfile = await ensureUserProfile({
          request,
          userId: id,
          supabaseAdmin: client,
        });
        if (!refreshedProfile?.tenant_id) {
          console.warn('Admin role update: missing tenant profile', { userId: id });
        }
      } catch (profileError) {
        console.warn('Admin role update: failed to refresh profile', profileError);
      }

      return data;
    });
    
    return NextResponse.json(data);
  } catch (error: unknown) {
    if (error instanceof TenantPlanLimitExceededError) {
      return NextResponse.json(error.payload, { status: error.status });
    }
    console.error('Admin user update error:', error);
    const message = error instanceof Error ? error.message : 'Failed to update user';
    const status = message.includes('Admin access required') ? 403 : 500;
    return NextResponse.json(
      { error: message },
      { status }
    );
  }
}

// DELETE - Delete user (admin only)
export async function DELETE(request: NextRequest) {
  try {
    const guard = await requireAdminPermission(request, ['admin:users']);
    if (!guard.ok) return guard.response;

    const { searchParams } = new URL(request.url);
    const id = searchParams.get('id');

    if (!id) {
      return NextResponse.json(
        { error: 'User ID is required' },
        { status: 400 }
      );
    }

    if (id === guard.userId) {
      return NextResponse.json(
        { error: 'You cannot delete your own account' },
        { status: 400 }
      );
    }

    await adminOperationSimple(async (client) => {
      const { data: targetProfile, error: targetProfileError } = await client
        .from('user_profiles')
        .select('tenant_id')
        .eq('user_id', id)
        .eq('tenant_id', guard.tenantId)
        .maybeSingle();
      if (targetProfileError) throw targetProfileError;
      if (!targetProfile?.tenant_id) {
        throw new Error('User not found in current tenant');
      }

      const tenantId = targetProfile.tenant_id;

      const runUpdate = async (
        table: string,
        values: Record<string, unknown>,
        filters: Array<[string, unknown]>,
        options?: { optional?: boolean; missingColumns?: string[] }
      ) => {
        if (filters.length === 0) {
          throw new Error('Refusing to run update without filters');
        }
        let query = client.from(table).update(values) as unknown as FilterableMutationQuery;
        for (const [column, value] of filters) {
          query = query.eq(column, value);
        }
        const { error } = await query;
        if (
          error &&
          !(
            options?.optional &&
            isIgnorableMissingSchemaError(error, table, options.missingColumns ?? [])
          )
        ) {
          throw error;
        }
      };

      const runDelete = async (
        table: string,
        filters: Array<[string, unknown]>,
        options?: { optional?: boolean; missingColumns?: string[] }
      ) => {
        if (filters.length === 0) {
          throw new Error('Refusing to run delete without filters');
        }
        let query = client.from(table).delete() as unknown as FilterableMutationQuery;
        for (const [column, value] of filters) {
          query = query.eq(column, value);
        }
        const { error } = await query;
        if (
          error &&
          !(
            options?.optional &&
            isIgnorableMissingSchemaError(error, table, options.missingColumns ?? [])
          )
        ) {
          throw error;
        }
      };

      const { error: unlinkParentError } = await client
        .from('students')
        .update({ parent_id: null })
        .eq('tenant_id', tenantId)
        .eq('parent_id', id);
      if (unlinkParentError) throw unlinkParentError;

      const { error: unlinkTeacherError } = await client
        .from('students')
        .update({ assigned_teacher_id: null })
        .eq('tenant_id', tenantId)
        .eq('assigned_teacher_id', id);
      if (unlinkTeacherError) throw unlinkTeacherError;

      const { error: deleteAuthUserError } = await client.auth.admin.deleteUser(id, true);
      if (deleteAuthUserError && !isSupabaseAuthUserNotFoundError(deleteAuthUserError)) {
        throw new Error(
          `Failed to delete auth user: ${formatSupabaseAuthDeleteError(deleteAuthUserError)}`
        );
      }

      await runUpdate('reports', { teacher_id: null }, [
        ['tenant_id', tenantId],
        ['teacher_id', id],
      ]);

      await runUpdate('exams', { created_by: null }, [
        ['tenant_id', tenantId],
        ['created_by', id],
      ]);

      await runUpdate('juz_tests', { examiner_id: null }, [
        ['tenant_id', tenantId],
        ['examiner_id', id],
      ]);

      await runUpdate('school_holidays', { created_by: null }, [
        ['tenant_id', tenantId],
        ['created_by', id],
      ]);

      await runUpdate('test_sessions', { scheduled_by: null }, [
        ['tenant_id', tenantId],
        ['scheduled_by', id],
      ]);

      await runDelete(
        'online_attendance_sessions',
        [
          ['tenant_id', tenantId],
          ['teacher_id', id],
        ],
        { optional: true, missingColumns: ['tenant_id', 'teacher_id'] }
      );

      await runDelete(
        'online_recurring_occurrences',
        [
          ['tenant_id', tenantId],
          ['teacher_id', id],
        ],
        { optional: true, missingColumns: ['tenant_id', 'teacher_id'] }
      );

      await runDelete(
        'online_recurring_packages',
        [
          ['tenant_id', tenantId],
          ['teacher_id', id],
        ],
        { optional: true, missingColumns: ['tenant_id', 'teacher_id'] }
      );

      await runDelete(
        'online_student_package_assignments',
        [
          ['tenant_id', tenantId],
          ['teacher_id', id],
        ],
        { optional: true, missingColumns: ['tenant_id', 'teacher_id'] }
      );

      await runDelete(
        'online_slot_claims',
        [
          ['tenant_id', tenantId],
          ['assigned_teacher_id', id],
        ],
        { optional: true, missingColumns: ['tenant_id', 'assigned_teacher_id'] }
      );

      await runDelete(
        'online_slot_claims',
        [
          ['tenant_id', tenantId],
          ['parent_id', id],
        ],
        { optional: true, missingColumns: ['tenant_id', 'parent_id'] }
      );

      await runDelete('teacher_assignments', [
        ['tenant_id', tenantId],
        ['teacher_id', id],
      ]);

      await runDelete(
        'conduct_entries',
        [
          ['tenant_id', tenantId],
          ['teacher_id', id],
        ],
        { optional: true, missingColumns: ['tenant_id', 'teacher_id'] }
      );

      await runUpdate(
        'grading_systems',
        { created_by: null },
        [
          ['tenant_id', tenantId],
          ['created_by', id],
        ],
        { optional: true, missingColumns: ['tenant_id', 'created_by'] }
      );

      await runUpdate(
        'monthly_payroll',
        { finalized_by: null },
        [
          ['tenant_id', tenantId],
          ['finalized_by', id],
        ],
        { optional: true, missingColumns: ['tenant_id', 'finalized_by'] }
      );

      await runDelete(
        'monthly_payroll',
        [
          ['tenant_id', tenantId],
          ['user_id', id],
        ],
        { optional: true, missingColumns: ['tenant_id', 'user_id'] }
      );

      await runDelete(
        'staff_salary_config',
        [
          ['tenant_id', tenantId],
          ['user_id', id],
        ],
        { optional: true, missingColumns: ['tenant_id', 'user_id'] }
      );

      await runDelete(
        'tenant_invites',
        [
          ['tenant_id', tenantId],
          ['created_by', id],
        ],
        { optional: true, missingColumns: ['tenant_id', 'created_by'] }
      );

      await runUpdate(
        'user_permissions',
        { created_by: null },
        [
          ['tenant_id', tenantId],
          ['created_by', id],
        ],
        { optional: true, missingColumns: ['tenant_id', 'created_by'] }
      );

      await runDelete(
        'user_permissions',
        [
          ['tenant_id', tenantId],
          ['user_id', id],
        ],
        { optional: true, missingColumns: ['tenant_id', 'user_id'] }
      );

      await runDelete('user_profiles', [
        ['tenant_id', tenantId],
        ['user_id', id],
      ]);

      await runDelete('users', [['id', id]]);
    });

    return NextResponse.json({ success: true });
  } catch (error: unknown) {
    console.error('Admin user deletion error:', error);
    const message = error instanceof Error ? error.message : 'Failed to delete user';
    const status =
      message.includes('Admin access required')
        ? 403
        : message.includes('not found')
          ? 404
          : message.includes('foreign key')
            ? 409
            : 500;
    return NextResponse.json({ error: message }, { status });
  }
}
