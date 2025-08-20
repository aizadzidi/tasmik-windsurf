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
      const { error } = await supabase
        .from('juz_test_notifications')
        .insert([{
          student_id: data.student_id,
          teacher_id: data.teacher_id,
          student_name: data.student_name,
          teacher_name: data.teacher_name,
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
      // Simple query - no joins needed since names are stored in the table
      const { data: notifications, error } = await supabase
        .from('juz_test_notifications')
        .select('*')
        .order('status', { ascending: true }) // pending first
        .order('created_at', { ascending: false });

      if (error) {
        console.error('Error fetching notifications:', error);
        return { notifications: [], error: error.message };
      }

      console.log('Notifications with stored names:', notifications);
      return { notifications: notifications || [] };
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