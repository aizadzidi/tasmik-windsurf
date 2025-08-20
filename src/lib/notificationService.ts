import { supabase } from './supabaseClient';

export interface JuzTestNotification {
  id: string;
  teacher_id: string;
  student_id: string;
  student_name: string;
  teacher_name: string;
  suggested_juz: number;
  status: 'pending' | 'acknowledged' | 'completed';
  teacher_notes?: string;
  created_at: string;
  updated_at: string;
}

export interface CreateNotificationData {
  student_id: string;
  student_name: string;
  teacher_id: string;
  teacher_name: string;
  suggested_juz: number;
  teacher_notes?: string;
}

export const notificationService = {
  // Create a new Juz test notification
  async createNotification(data: CreateNotificationData): Promise<{ success: boolean; error?: string }> {
    try {
      // If names aren't provided, fetch them from the database
      let studentName = data.student_name;
      let teacherName = data.teacher_name;

      if (!studentName || !teacherName) {
        const [studentResult, teacherResult] = await Promise.all([
          !studentName ? supabase
            .from('students')
            .select('name')
            .eq('id', data.student_id)
            .single() : Promise.resolve({ data: { name: studentName }, error: null }),
          !teacherName ? supabase
            .from('users')
            .select('name')
            .eq('id', data.teacher_id)
            .single() : Promise.resolve({ data: { name: teacherName }, error: null })
        ]);

        studentName = studentResult.data?.name || data.student_name || 'Unknown Student';
        teacherName = teacherResult.data?.name || data.teacher_name || 'Unknown Teacher';
      }

      const { error } = await supabase
        .from('juz_test_notifications')
        .insert([{
          student_id: data.student_id,
          teacher_id: data.teacher_id,
          student_name: studentName,
          teacher_name: teacherName,
          suggested_juz: data.suggested_juz,
          teacher_notes: data.teacher_notes,
          status: 'pending'
        }]);

      if (error) {
        console.error('Error creating notification:', error);
        return { success: false, error: error.message };
      }

      return { success: true };
    } catch (err) {
      console.error('Error creating notification:', err);
      return { success: false, error: 'Failed to create notification' };
    }
  },

  // Get all notifications for admin (pending first, then by date)
  async getNotificationsForAdmin(): Promise<{ notifications: JuzTestNotification[]; error?: string }> {
    try {
      // Fetch notifications without joins to avoid RLS/join issues
      const { data: notifications, error } = await supabase
        .from('juz_test_notifications')
        .select('*')
        .order('status', { ascending: true }) // pending first
        .order('created_at', { ascending: false });

      if (error) {
        console.error('Error fetching notifications:', error);
        return { notifications: [], error: error.message };
      }

      const notificationsSafe = notifications || [];

      // Find which names are missing and batch fetch them
      const missingStudentIds = Array.from(new Set(
        notificationsSafe
          .filter(n => !n.student_name)
          .map(n => n.student_id)
          .filter(Boolean)
      ));
      const missingTeacherIds = Array.from(new Set(
        notificationsSafe
          .filter(n => !n.teacher_name)
          .map(n => n.teacher_id)
          .filter(Boolean)
      ));

      const [studentsLookupRes, teachersLookupRes] = await Promise.all([
        missingStudentIds.length > 0
          ? supabase.from('students').select('id, name').in('id', missingStudentIds)
          : Promise.resolve({ data: [], error: null } as any),
        missingTeacherIds.length > 0
          ? supabase.from('users').select('id, name').in('id', missingTeacherIds)
          : Promise.resolve({ data: [], error: null } as any)
      ]);

      const studentIdToName: Record<string, string> = Object.fromEntries(
        (studentsLookupRes.data || []).map((s: any) => [s.id, s.name])
      );
      const teacherIdToName: Record<string, string> = Object.fromEntries(
        (teachersLookupRes.data || []).map((u: any) => [u.id, u.name])
      );

      // Build processed notifications with resolved names
      const processedNotifications: JuzTestNotification[] = notificationsSafe.map((n: any) => {
        const studentName = n.student_name || studentIdToName[n.student_id] || 'Unknown Student';
        const teacherName = n.teacher_name || teacherIdToName[n.teacher_id] || 'Unknown Teacher';
        return { ...n, student_name: studentName, teacher_name: teacherName } as JuzTestNotification;
      });

      // Persist back any newly resolved names to avoid future lookups
      const updates = processedNotifications
        .filter((n, idx) => (
          (!notificationsSafe[idx]?.student_name && n.student_name && n.student_name !== 'Unknown Student') ||
          (!notificationsSafe[idx]?.teacher_name && n.teacher_name && n.teacher_name !== 'Unknown Teacher')
        ))
        .map(n => ({ id: n.id, student_name: n.student_name, teacher_name: n.teacher_name }));

      if (updates.length > 0) {
        // Best-effort update; ignore errors to keep UI responsive
        await Promise.all(
          updates.map(u =>
            supabase
              .from('juz_test_notifications')
              .update({ student_name: u.student_name, teacher_name: u.teacher_name })
              .eq('id', u.id)
          )
        ).catch(() => {});
      }

      console.log('Notifications with resolved names:', processedNotifications);
      return { notifications: processedNotifications };
    } catch (err) {
      console.error('Error fetching notifications:', err);
      return { notifications: [], error: 'Failed to fetch notifications' };
    }
  },

  // Mark notification as acknowledged
  async markAsAcknowledged(notificationId: string): Promise<{ success: boolean; error?: string }> {
    try {
      const { error } = await supabase
        .from('juz_test_notifications')
        .update({ 
          status: 'acknowledged'
        })
        .eq('id', notificationId);

      if (error) {
        console.error('Error marking notification as acknowledged:', error);
        return { success: false, error: error.message };
      }

      return { success: true };
    } catch (err) {
      console.error('Error marking notification as acknowledged:', err);
      return { success: false, error: 'Failed to mark notification as acknowledged' };
    }
  },

  // Mark notification as completed
  async markAsCompleted(notificationId: string): Promise<{ success: boolean; error?: string }> {
    try {
      const { error } = await supabase
        .from('juz_test_notifications')
        .update({ 
          status: 'completed'
        })
        .eq('id', notificationId);

      if (error) {
        console.error('Error marking notification as completed:', error);
        return { success: false, error: error.message };
      }

      return { success: true };
    } catch (err) {
      console.error('Error marking notification as completed:', err);
      return { success: false, error: 'Failed to mark notification as completed' };
    }
  },

  // Get pending count for admin
  async getUnreadCount(): Promise<{ count: number; error?: string }> {
    try {
      const { count, error } = await supabase
        .from('juz_test_notifications')
        .select('*', { count: 'exact', head: true })
        .eq('status', 'pending');

      if (error) {
        console.error('Error getting pending count:', error);
        return { count: 0, error: error.message };
      }

      return { count: count || 0 };
    } catch (err) {
      console.error('Error getting pending count:', err);
      return { count: 0, error: 'Failed to get pending count' };
    }
  },

  // Create examiner request notification
  async createExaminerRequest(
    studentId: string,
    studentName: string,
    teacherId: string,
    teacherName: string,
    suggestedJuz: number,
    currentMemorizedJuz: number
  ): Promise<{ success: boolean; error?: string }> {
    return await this.createNotification({
      student_id: studentId,
      student_name: studentName,
      teacher_id: teacherId,
      teacher_name: teacherName,
      suggested_juz: suggestedJuz,
      teacher_notes: `Student ready for Juz ${suggestedJuz} test. Current memorization: Juz ${currentMemorizedJuz}.`
    });
  }
};