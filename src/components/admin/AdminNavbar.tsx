"use client";
import React, { useEffect, useState } from "react";
import Link from "next/link";
import Image from "next/image";
import { usePathname } from "next/navigation";
import SignOutButton from "@/components/SignOutButton";
import NotificationPanel from "./NotificationPanel";
import { notificationService } from "@/lib/notificationService";
import { AnimatePresence, motion } from "framer-motion";

const AdminNavbar = () => {
  const pathname = usePathname();
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);
  const [showNotifications, setShowNotifications] = useState(false);
  const [unreadCount, setUnreadCount] = useState(0);
  const [isCollapsed, setIsCollapsed] = useState(false);

  const navItems = [
    { 
      href: "/admin", 
      label: "Dashboard", 
      icon: (
        <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3m-6 0a1 1 0 001-1v-4a1 1 0 011-1h2a1 1 0 011 1v4a1 1 0 001 1m-6 0h6" />
        </svg>
      )
    },
    {
      href: "/admin/crm",
      label: "CRM",
      icon: (
        <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16" />
        </svg>
      )
    },
    { 
      href: "/admin/reports", 
      label: "Reports", 
      icon: (
        <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
        </svg>
      )
    },
    { 
      href: "/admin/payments",
      label: "Payments",
      icon: (
        <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 9V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-2m4-3H9m8-4l4 4-4 4" />
        </svg>
      )
    },
    { 
      href: "/admin/attendance", 
      label: "Attendance", 
      icon: (
        <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <rect x="3" y="4" width="18" height="18" rx="2" ry="2" strokeWidth={2} />
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 2v4M8 2v4M3 10h18" />
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 16l2 2 4-5" />
        </svg>
      )
    },
    { 
      href: "/admin/exam", 
      label: "Exams", 
      icon: (
        <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
        </svg>
      )
    },
    {
      href: "/admin/certificates",
      label: "Certificates",
      icon: (
        <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 4h7l4 4v12a2 2 0 01-2 2H7a2 2 0 01-2-2V6a2 2 0 012-2z" />
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M14 4v4h4" />
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 3h6" />
        </svg>
      )
    },
    { 
      href: "/admin/historical", 
      label: "Historical Entry", 
      icon: (
        <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 6v6m0 0v6m0-6h6m-6 0H6" />
        </svg>
      )
    },
    {
      href: "/admin/users",
      label: "User Roles",
      icon: (
        <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 7a4 4 0 11-8 0 4 4 0 018 0z" />
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
        </svg>
      )
    },
  ];

  const isActive = (href: string) => {
    if (href === "/admin") {
      return pathname === "/admin";
    }
    return pathname.startsWith(href);
  };

  useEffect(() => {
    document.body.classList.add("admin-with-sidebar");
    return () => {
      document.body.classList.remove("admin-with-sidebar");
      document.body.classList.remove("admin-sidebar-collapsed");
    };
  }, []);

  useEffect(() => {
    if (isCollapsed) {
      document.body.classList.add("admin-sidebar-collapsed");
    } else {
      document.body.classList.remove("admin-sidebar-collapsed");
    }
  }, [isCollapsed]);

  useEffect(() => {
    const fetchUnreadCount = async () => {
      const result = await notificationService.getUnreadCount();
      if (!result.error) {
        setUnreadCount(result.count);
      }
    };

    fetchUnreadCount();
    
    // Refresh unread count every 30 seconds
    const interval = setInterval(fetchUnreadCount, 30000);
    
    return () => clearInterval(interval);
  }, []);

  const handleNotificationClick = () => {
    setShowNotifications(true);
    setUnreadCount(0); // Optimistically reset count when opening panel
  };

  const toggleCollapse = () => setIsCollapsed((prev) => !prev);

  const sidebarWidth = isCollapsed ? 80 : 288; // px widths for Framer Motion
  const navPadding = isCollapsed ? "px-3 py-3" : "px-4 py-3";
  const iconOnly = isCollapsed;
  const linkAlign = iconOnly ? "justify-center" : "";

  return (
    <>
      {/* Mobile top bar */}
      <div className="md:hidden sticky top-0 z-40 bg-white/90 border-b border-slate-200/70 backdrop-blur-xl shadow-sm">
        <div className="flex items-center justify-between px-4 py-3">
          <Link href="/admin" className="flex items-center space-x-3">
            <div className="relative flex items-center justify-center rounded-2xl bg-slate-100 p-2 shadow-sm ring-1 ring-slate-200">
              <Image
                src="/logo-akademi.png"
                alt="AlKhayr Class Logo"
                width={32}
                height={32}
                className="object-contain"
              />
            </div>
            <div>
              <p className="text-xs font-semibold text-slate-500">Admin</p>
              <p className="text-sm font-bold text-slate-900">AlKhayr Class</p>
            </div>
          </Link>
          <div className="flex items-center gap-2">
            <button
              onClick={handleNotificationClick}
              className="relative rounded-full bg-white px-3 py-2 shadow-sm ring-1 ring-slate-200 transition hover:-translate-y-0.5 hover:shadow"
            >
              <span className="text-lg">🔔</span>
              {unreadCount > 0 && (
                <span className="absolute -top-1 -right-1 flex h-5 w-5 items-center justify-center rounded-full bg-gradient-to-br from-rose-500 to-orange-500 text-[11px] font-bold text-white shadow-md">
                  {unreadCount > 9 ? "9+" : unreadCount}
                </span>
              )}
            </button>
            <button
              onClick={() => setIsMobileMenuOpen(!isMobileMenuOpen)}
              className="rounded-2xl bg-slate-900 px-3 py-2 text-white shadow transition hover:scale-105"
            >
              <svg className="h-6 w-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                {isMobileMenuOpen ? (
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                ) : (
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16" />
                )}
              </svg>
            </button>
          </div>
        </div>
      </div>

      {/* Desktop Sidebar */}
      <motion.aside
        initial={false}
        animate={{ width: sidebarWidth }}
        transition={{ type: "spring", stiffness: 320, damping: 32 }}
        className="fixed inset-y-3 left-3 z-40 hidden overflow-hidden rounded-3xl bg-white/95 border border-slate-200 shadow-xl backdrop-blur-xl md:flex"
      >
        <div className="flex h-full w-full min-h-0 flex-col px-5 py-6">
          <div className="flex items-center space-x-3 pb-6 border-b border-slate-200/70">
            <div className="relative flex items-center justify-center rounded-2xl bg-slate-100 p-2 shadow-sm ring-1 ring-slate-200">
              <Image
                src="/logo-akademi.png"
                alt="AlKhayr Class Logo"
                width={40}
                height={40}
                className="object-contain"
              />
            </div>
            <AnimatePresence initial={false}>
              {!iconOnly && (
                <motion.div
                  key="brand-text"
                  initial={{ opacity: 0, x: -6 }}
                  animate={{ opacity: 1, x: 0 }}
                  exit={{ opacity: 0, x: -6 }}
                  transition={{ duration: 0.18, ease: "easeOut" }}
                >
                  <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Admin Suite</p>
                  <p className="text-lg font-bold text-slate-900">AlKhayr Class</p>
                </motion.div>
              )}
            </AnimatePresence>
            <button
              onClick={toggleCollapse}
              className="ml-auto hidden h-9 w-9 items-center justify-center rounded-2xl border border-slate-200/80 bg-white text-slate-600 shadow-sm transition-all duration-300 ease-out hover:shadow-md hover:border-slate-300 hover:scale-[1.02] md:inline-flex"
              aria-label="Toggle sidebar"
            >
              <motion.svg
                animate={{ rotate: isCollapsed ? 180 : 0 }}
                transition={{ type: "spring", stiffness: 300, damping: 22 }}
                className="h-4 w-4"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
              </motion.svg>
            </button>
          </div>

          <div className="mt-6 flex-1 space-y-2 overflow-y-auto pr-2">
            {navItems.map((item) => {
              const active = isActive(item.href);
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  className={`group relative flex items-center gap-3 rounded-2xl ${navPadding} ${linkAlign} text-sm font-semibold transition-all duration-200 border border-transparent transform-gpu ${
                    active
                      ? "bg-blue-50 text-blue-700 shadow-md border-blue-100"
                    : "text-slate-700 hover:bg-white hover:shadow-lg hover:border-slate-200/90 hover:scale-[1.02]"
                  }`}
                >
                  <span
                    className={`flex h-9 w-9 items-center justify-center rounded-xl border text-[15px] ${
                      active
                        ? "border-blue-100 bg-white text-blue-700"
                        : "border-slate-200 bg-white text-slate-600 group-hover:border-blue-100 group-hover:text-blue-700 group-hover:shadow-sm"
                    }`}
                  >
                    {item.icon}
                  </span>
                  <AnimatePresence initial={false}>
                    {!iconOnly && (
                      <motion.span
                        key={`${item.href}-label`}
                        className="flex-1"
                        initial={{ opacity: 0, x: -6 }}
                        animate={{ opacity: 1, x: 0 }}
                        exit={{ opacity: 0, x: -6 }}
                        transition={{ duration: 0.18, ease: "easeOut" }}
                      >
                        {item.label}
                      </motion.span>
                    )}
                  </AnimatePresence>
                </Link>
              );
            })}
          </div>

          <div className="mt-auto space-y-4 pt-4">
            <button
              onClick={handleNotificationClick}
              className={`group relative flex w-full items-center ${iconOnly ? "justify-center px-3 py-3" : "justify-between px-4 py-3"} rounded-2xl border border-slate-200 bg-white text-sm font-semibold text-slate-800 shadow-sm transition-all duration-200 transform-gpu hover:scale-[1.02] hover:shadow-lg hover:border-slate-200/90 hover:bg-white`}
            >
              <div className="flex items-center gap-3">
                <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-blue-600 text-lg text-white shadow-sm">
                  🔔
                </span>
                {!iconOnly && (
                  <div className="text-left">
                    <p className="text-xs text-slate-500">Notifications</p>
                    <p className="text-sm font-bold text-slate-900">Inbox</p>
                  </div>
                )}
              </div>
              {unreadCount > 0 && (
                <span className="flex h-7 min-w-7 items-center justify-center rounded-full bg-gradient-to-br from-rose-500 to-orange-500 px-2 text-xs font-bold text-white shadow-sm">
                  {unreadCount > 9 ? "9+" : unreadCount}
                </span>
              )}
            </button>

            <div className="rounded-2xl border border-slate-200 bg-white p-2 shadow-sm ring-1 ring-slate-200/70 transition-all duration-200 transform-gpu hover:scale-[1.02] hover:shadow-lg hover:border-slate-200/90">
              <SignOutButton hideLabel={iconOnly} className={iconOnly ? "px-2 py-2" : undefined} />
            </div>
          </div>
        </div>
      </motion.aside>

      {/* Mobile Drawer */}
      {isMobileMenuOpen && (
        <div className="fixed inset-0 z-50 flex md:hidden">
          <div
            className="absolute inset-0 bg-slate-900/50 backdrop-blur-sm"
            onClick={() => setIsMobileMenuOpen(false)}
          />
          <div className="relative ml-auto flex h-full w-80 min-h-0 flex-col gap-2 rounded-l-3xl bg-white/95 px-4 py-6 shadow-2xl">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="rounded-2xl bg-slate-100 p-2 shadow-sm ring-1 ring-slate-200">
                  <Image src="/logo-akademi.png" alt="AlKhayr Class Logo" width={36} height={36} className="object-contain" />
                </div>
                <div>
                  <p className="text-xs font-semibold text-slate-500">Admin</p>
                  <p className="text-sm font-bold text-slate-900">AlKhayr Class</p>
                </div>
              </div>
              <button
                onClick={() => setIsMobileMenuOpen(false)}
                className="rounded-2xl bg-slate-100 p-2 text-slate-600 shadow-sm"
              >
                <svg className="h-6 w-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>

            <div className="mt-4 flex-1 space-y-2 overflow-y-auto pr-2">
              {navItems.map((item) => {
                const active = isActive(item.href);
                return (
                <Link
                  key={item.href}
                    href={item.href}
                    onClick={() => setIsMobileMenuOpen(false)}
                    className={`flex items-center gap-3 rounded-2xl px-4 py-3 text-sm font-semibold transition border border-transparent transform-gpu ${
                      active
                        ? "bg-blue-50 text-blue-700 shadow-sm border-blue-100"
                        : "bg-slate-50 text-slate-800 hover:bg-white hover:shadow-sm hover:border-slate-200/90 hover:scale-[1.02]"
                    }`}
                  >
                    <span
                      className={`flex h-9 w-9 items-center justify-center rounded-xl ${
                        active ? "bg-white text-blue-700 border border-blue-100" : "bg-white text-slate-600 border border-slate-200"
                      }`}
                    >
                      {item.icon}
                    </span>
                    <span>{item.label}</span>
                  </Link>
                );
              })}
            </div>

            <div className="mt-auto space-y-3">
              <button
                onClick={() => {
                  handleNotificationClick();
                  setIsMobileMenuOpen(false);
                }}
                className="flex w-full items-center justify-between rounded-2xl bg-blue-600 px-4 py-3 text-sm font-semibold text-white shadow-sm transition-all duration-200 transform-gpu hover:scale-[1.02] hover:shadow-md"
              >
                <span className="flex items-center gap-3">
                  <span className="text-lg">🔔</span>
                  <span>Notifications</span>
                </span>
                {unreadCount > 0 && (
                  <span className="rounded-full bg-white/20 px-3 py-1 text-xs font-bold">
                    {unreadCount > 9 ? "9+" : unreadCount}
                  </span>
                )}
              </button>

              <div className="rounded-2xl border border-slate-200 bg-white p-3 shadow-sm transition-all duration-200 transform-gpu hover:scale-[1.02] hover:shadow-md hover:border-slate-200/90">
                <SignOutButton />
              </div>
            </div>
          </div>
        </div>
      )}

      <NotificationPanel isVisible={showNotifications} onClose={() => setShowNotifications(false)} />
    </>
  );
};

export default AdminNavbar;
