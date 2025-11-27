"use client";
import React, { useState, useEffect } from 'react';
import { notificationService, type JuzTestNotification } from '@/lib/notificationService';
import { Card } from '@/components/ui/Card';

interface NotificationPanelProps {
  isVisible: boolean;
  onClose: () => void;
}

export default function NotificationPanel({ isVisible, onClose }: NotificationPanelProps) {
  const [notifications, setNotifications] = useState<JuzTestNotification[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (isVisible) {
      fetchNotifications();
    }
  }, [isVisible]);

  const fetchNotifications = async () => {
    setLoading(true);
    setError(null);
    try {
      // Prefer server API (service role) for consistent names; fallback to client service
      const res = await fetch('/api/admin/notifications');
      if (res.ok) {
        const data = await res.json();
        setNotifications(data.notifications || []);
      } else {
        const result = await notificationService.getNotificationsForAdmin();
        if (result.error) setError(result.error);
        else setNotifications(result.notifications);
      }
    } catch {
      const result = await notificationService.getNotificationsForAdmin();
      if (result.error) setError(result.error);
      else setNotifications(result.notifications);
    } finally {
      setLoading(false);
    }
  };

  const handleMarkAsAcknowledged = async (notificationId: string) => {
    const result = await notificationService.markAsAcknowledged(notificationId);
    if (result.success) {
      setNotifications(prev => 
        prev.map(notif => 
          notif.id === notificationId 
            ? { ...notif, status: 'acknowledged' }
            : notif
        )
      );
    }
  };

  const handleMarkAsCompleted = async (notificationId: string) => {
    const result = await notificationService.markAsCompleted(notificationId);
    if (result.success) {
      setNotifications(prev => 
        prev.map(notif => 
          notif.id === notificationId 
            ? { ...notif, status: 'completed' }
            : notif
        )
      );
    }
  };

  const formatDate = (dateString: string) => {
    const date = new Date(dateString);
    const now = new Date();
    const diffInMinutes = Math.floor((now.getTime() - date.getTime()) / (1000 * 60));
    
    if (diffInMinutes < 1) return 'Just now';
    if (diffInMinutes < 60) return `${diffInMinutes}m ago`;
    if (diffInMinutes < 1440) return `${Math.floor(diffInMinutes / 60)}h ago`;
    return date.toLocaleDateString();
  };

  if (!isVisible) return null;

  return (
    <>
      {/* Full screen overlay */}
      <div className="fixed inset-0 bg-black/60 z-50"></div>
      <div className="fixed inset-0 z-50 flex items-start justify-center pt-24 pb-8 px-4">
      <Card className="bg-white w-full max-w-4xl max-h-[calc(100vh-8rem)] overflow-hidden flex flex-col shadow-xl border border-gray-100 rounded-2xl animate-in fade-in-0 slide-in-from-bottom-4 duration-300">
        {/* Header */}
        <div className="flex items-center justify-between p-6 border-b border-gray-100">
          <div className="flex items-center gap-4">
            <div className="w-12 h-12 bg-gradient-to-br from-blue-500 to-indigo-600 rounded-xl flex items-center justify-center shadow-lg">
              <svg className="w-6 h-6 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
              </svg>
            </div>
            <div>
              <h2 className="text-xl font-semibold text-gray-900">
                Test Requests
              </h2>
              <p className="text-sm text-gray-500 mt-0.5">
                {notifications.filter(n => n.status === 'pending').length} pending • {notifications.length} total
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="w-10 h-10 rounded-xl bg-gray-50 hover:bg-gray-100 flex items-center justify-center text-gray-400 hover:text-gray-600 transition-all duration-200"
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto">
          {loading ? (
            <div className="flex flex-col items-center justify-center py-16">
              <div className="w-8 h-8 border-2 border-gray-200 border-t-blue-500 rounded-full animate-spin mb-4"></div>
              <div className="text-gray-600 text-sm">Loading requests...</div>
            </div>
          ) : error ? (
            <div className="flex flex-col items-center justify-center py-16">
              <div className="w-12 h-12 bg-red-50 rounded-full flex items-center justify-center mb-4">
                <svg className="w-6 h-6 text-red-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
              </div>
              <div className="text-gray-900 font-medium mb-1">Unable to load requests</div>
              <div className="text-gray-500 text-sm">{error}</div>
            </div>
          ) : notifications.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-16">
              <div className="w-16 h-16 bg-gray-50 rounded-2xl flex items-center justify-center mb-4">
                <svg className="w-8 h-8 text-gray-300" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                </svg>
              </div>
              <div className="text-gray-900 font-medium mb-2">No test requests</div>
              <div className="text-gray-500 text-sm text-center max-w-xs">
                Test requests from teachers will appear here when students are ready for examination.
              </div>
            </div>
          ) : (
            <div className="px-6 pb-6">
              <div className="space-y-3">
                {notifications.map((notification) => (
                  <div
                    key={notification.id}
                    className="bg-white border border-gray-100 rounded-xl p-5 hover:shadow-sm transition-all duration-200 group"
                  >
                    <div className="flex items-center justify-between">
                      {/* Left side - Main content */}
                      <div className="flex items-center gap-4 flex-1">
                        {/* Juz Badge */}
                        <div className={`w-12 h-12 rounded-xl flex items-center justify-center font-semibold text-white text-lg shadow-sm ${
                          notification.status === 'completed' 
                            ? 'bg-green-500' 
                            : notification.status === 'acknowledged'
                              ? 'bg-amber-500'
                              : 'bg-blue-500'
                        }`}>
                          {notification.suggested_juz}
                        </div>

                        {/* Content */}
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-3 mb-1">
                            <h3 className="font-semibold text-gray-900 text-base">
                              Juz {notification.suggested_juz} Test Request
                            </h3>
                            
                            {/* Status badge */}
                            <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${
                              notification.status === 'pending'
                                ? 'bg-red-50 text-red-700 border border-red-200'
                                : notification.status === 'acknowledged'
                                  ? 'bg-amber-50 text-amber-700 border border-amber-200'
                                  : 'bg-green-50 text-green-700 border border-green-200'
                            }`}>
                              {notification.status === 'pending' && (
                                <div className="w-1.5 h-1.5 bg-red-400 rounded-full mr-1.5 animate-pulse"></div>
                              )}
                              {notification.status.charAt(0).toUpperCase() + notification.status.slice(1)}
                            </span>
                          </div>

                          {/* Details */}
                          <div className="flex items-center gap-4 text-sm text-gray-600">
                            <span>
                              <span className="font-medium">{notification.student_name || 'Unknown Student'}</span>
                            </span>
                            <span className="text-gray-400">•</span>
                            <span>by {notification.teacher_name || 'Unknown Teacher'}</span>
                            <span className="text-gray-400">•</span>
                            <span>{formatDate(notification.created_at)}</span>
                          </div>

                          {/* Notes */}
                          {notification.teacher_notes && (
                            <div className="mt-2 p-3 bg-gray-50 rounded-lg">
                              <p className="text-sm text-gray-700 leading-relaxed">
                                {notification.teacher_notes}
                              </p>
                            </div>
                          )}
                        </div>
                      </div>

                      {/* Right side - Action buttons */}
                      <div className="flex items-center gap-2 ml-4">
                        {notification.status === 'pending' && (
                          <>
                            <button
                              onClick={() => handleMarkAsAcknowledged(notification.id)}
                              className="inline-flex items-center px-3 py-1.5 text-sm font-medium text-amber-700 bg-amber-50 border border-amber-200 rounded-lg hover:bg-amber-100 transition-colors duration-200"
                            >
                              Acknowledge
                            </button>
                            <button
                              onClick={() => handleMarkAsCompleted(notification.id)}
                              className="inline-flex items-center px-3 py-1.5 text-sm font-medium text-green-700 bg-green-50 border border-green-200 rounded-lg hover:bg-green-100 transition-colors duration-200"
                            >
                              Complete
                            </button>
                          </>
                        )}
                        {notification.status === 'acknowledged' && (
                          <button
                            onClick={() => handleMarkAsCompleted(notification.id)}
                            className="inline-flex items-center px-3 py-1.5 text-sm font-medium text-green-700 bg-green-50 border border-green-200 rounded-lg hover:bg-green-100 transition-colors duration-200"
                          >
                            Complete
                          </button>
                        )}
                        {notification.status === 'completed' && (
                          <span className="inline-flex items-center px-3 py-1.5 text-sm font-medium text-gray-500">
                            <svg className="w-4 h-4 mr-1.5 text-green-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                            </svg>
                            Completed
                          </span>
                        )}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="border-t border-gray-100 px-6 py-4 bg-gray-50/50">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2 text-sm text-gray-500">
              <div className="w-2 h-2 bg-green-400 rounded-full animate-pulse"></div>
              <span>Auto-refresh every 30s</span>
            </div>
            <button
              onClick={fetchNotifications}
              disabled={loading}
              className="inline-flex items-center gap-2 px-4 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-200 rounded-lg hover:bg-gray-50 hover:border-gray-300 disabled:opacity-50 disabled:cursor-not-allowed transition-all duration-200"
            >
              <svg className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
              </svg>
              {loading ? 'Refreshing...' : 'Refresh'}
            </button>
          </div>
        </div>
      </Card>
      </div>
    </>
  );
}
