"use client";
import React, { useState } from "react";
import Link from "next/link";
import Image from "next/image";
import { usePathname } from "next/navigation";
import SignOutButton from "@/components/SignOutButton";
import type { ProgramScope } from "@/types/programs";
import { useAdminPermissions } from "@/hooks/useAdminPermissions";
import {
  ADMIN_PAGE_PERMISSIONS,
  ADMIN_PERMISSION_KEYS,
  hasAdminPermission,
} from "@/lib/adminAccess";
import { useTeachingModeContext } from "@/contexts/TeachingModeContext";

type NavbarProps = {
  programScope?: ProgramScope | null;
};

export default function Navbar({ programScope }: NavbarProps) {
  const pathname = usePathname();
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);
  const { isAdmin: isAdminUser, permissions } = useAdminPermissions();
  const { mode: teachingMode, programScope: teachingProgramScope } = useTeachingModeContext();

  // Keep teacher nav mode stable across route transitions by using layout-level scope.
  const isTeacher = pathname.startsWith("/teacher");
  const isParent = pathname.startsWith("/parent");
  const isAdminRoute = pathname.startsWith("/admin");
  const isStaff = pathname.startsWith("/staff");
  const resolvedProgramScope = isTeacher ? teachingProgramScope : programScope;
  const isOnlineAttendancePath = pathname.startsWith("/teacher/online-attendance");

  const isMixedOnline =
    resolvedProgramScope === "mixed" &&
    (teachingMode === "online" || (teachingMode === null && isOnlineAttendancePath));
  const isOnlineOnly = resolvedProgramScope === "online";
  const effectiveOnline = isOnlineOnly || isMixedOnline;
  const hasOnlineScope = resolvedProgramScope === "online" || resolvedProgramScope === "mixed";

  const hasAdminAccess =
    isAdminUser || ADMIN_PERMISSION_KEYS.some((key) => permissions.has(key));

  const adminNavHref = (() => {
    if (isAdminUser || permissions.has("admin:dashboard")) return "/admin";

    const preferredPaths = [
      "/admin/attendance",
      "/admin/reports",
      "/admin/online",
      "/admin/online/reports",
      "/admin/users",
      "/admin/exam",
      "/admin/payments",
      "/admin/crm",
      "/admin/certificates",
      "/admin/historical",
    ];

    for (const path of preferredPaths) {
      const page = ADMIN_PAGE_PERMISSIONS.find((item) => item.path === path);
      if (page && hasAdminPermission(page.key, permissions)) {
        return page.path;
      }
    }

    const firstAccessiblePage = ADMIN_PAGE_PERMISSIONS.find((item) =>
      hasAdminPermission(item.key, permissions)
    );
    return firstAccessiblePage?.path ?? "/admin";
  })();

  const navClasses = isParent
    ? "relative z-50 bg-gradient-to-br from-[#f8fafc]/92 via-white/92 to-[#f8fafc]/92 backdrop-blur-xl border-b border-slate-200/50 shadow-md"
    : "relative z-50 bg-white/20 backdrop-blur-xl border-b border-white/30 shadow-lg";

  const getDashboardInfo = () => {
    if (isParent) {
      return {
        dashboardHref: "/parent",
        dashboardLabel: "Parent Dashboard",
        navItems: [
          { 
            href: "/parent", 
            label: "Dashboard", 
            icon: (
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3m-6 0a1 1 0 001-1v-4a1 1 0 011-1h2a1 1 0 011 1v4a1 1 0 001 1m-6 0h6" />
              </svg>
            )
          },
          ...(hasOnlineScope
            ? [
                {
                  href: "/parent/online",
                  label: "Online Explore",
                  icon: (
                    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 5h18M6 9h12M5 13h14M7 17h10" />
                    </svg>
                  )
                },
              ]
            : []),
          ...(!isOnlineOnly
            ? [
                {
                  href: "/parent/exam",
                  label: "Exam Results",
                  icon: (
                    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                    </svg>
                  )
                },
              ]
            : []),
          {
            href: "/parent/payments",
            label: "Payments",
            icon: (
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 7h16a1 1 0 011 1v8a1 1 0 01-1 1H4a1 1 0 01-1-1V8a1 1 0 011-1z" />
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 10h16M9 15h3.5" />
              </svg>
            )
          },
        ]
      };
    } else if (isTeacher) {
      return {
        dashboardHref: "/teacher",
        dashboardLabel: "Teacher Dashboard",
        navItems: [
          { 
            href: "/teacher", 
            label: "Dashboard", 
            icon: (
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3m-6 0a1 1 0 001-1v-4a1 1 0 011-1h2a1 1 0 011 1v4a1 1 0 001 1m-6 0h6" />
              </svg>
            )
          },
          {
            href: effectiveOnline ? "/teacher/online-attendance" : "/teacher/attendance",
            label: "Attendance",
            icon: (
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <rect x="3" y="4" width="18" height="18" rx="2" ry="2" strokeWidth={2} />
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 2v4M8 2v4M3 10h18" />
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 16l2 2 4-5" />
              </svg>
            )
          },
          ...(!effectiveOnline
            ? [
                {
                  href: "/teacher/leave",
                  label: "Leave",
                  icon: (
                    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <rect x="3" y="4" width="18" height="18" rx="2" ry="2" strokeWidth={2} />
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 2v4M8 2v4M3 10h18" />
                    </svg>
                  )
                },
              ]
            : []),
          ...(!effectiveOnline
            ? [
                {
                  href: "/teacher/payroll",
                  label: "My Payslips",
                  icon: (
                    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2" />
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 6v2m0 8v2" />
                      <circle cx="12" cy="12" r="10" strokeWidth={2} />
                    </svg>
                  )
                },
              ]
            : []),
          ...(!effectiveOnline
            ? [
                {
                  href: "/teacher/lesson",
                  label: "Lessons",
                  icon: (
                    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 5h11a2 2 0 012 2v12H7a2 2 0 01-2-2V5z" />
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 3h9a2 2 0 012 2v14" />
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 9h6M9 13h4" />
                    </svg>
                  )
                },
                {
                  href: "/teacher/exam",
                  label: "Exams",
                  icon: (
                    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                    </svg>
                  )
                },
              ]
            : []),
          ...(hasAdminAccess
            ? [
                {
                  href: adminNavHref,
                  label: "Admin",
                  icon: (
                    <svg
                      className="w-5 h-5"
                      fill="none"
                      stroke="currentColor"
                      viewBox="0 0 24 24"
                    >
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        strokeWidth={2}
                        d="M12 11c1.657 0 3-1.343 3-3S13.657 5 12 5s-3 1.343-3 3 1.343 3 3 3z"
                      />
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        strokeWidth={2}
                        d="M19.4 15a7.97 7.97 0 00-14.8 0"
                      />
                    </svg>
                  ),
                },
              ]
            : []),
          
        ]
      };
    } else if (isStaff) {
      return {
        dashboardHref: "/staff",
        dashboardLabel: "Staff Dashboard",
        navItems: [
          {
            href: "/staff",
            label: "Dashboard",
            icon: (
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3m-6 0a1 1 0 001-1v-4a1 1 0 011-1h2a1 1 0 011 1v4a1 1 0 001 1m-6 0h6" />
              </svg>
            )
          },
          {
            href: "/staff/leave",
            label: "Leave",
            icon: (
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <rect x="3" y="4" width="18" height="18" rx="2" ry="2" strokeWidth={2} />
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 2v4M8 2v4M3 10h18" />
              </svg>
            )
          },
          {
            href: "/staff/payroll",
            label: "My Payslips",
            icon: (
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2" />
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 6v2m0 8v2" />
                <circle cx="12" cy="12" r="10" strokeWidth={2} />
              </svg>
            )
          },
        ]
      };
    } else if (isAdminRoute) {
      return {
        dashboardHref: "/admin",
        dashboardLabel: "Admin Dashboard",
        navItems: [
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
            href: "/admin/payments",
            label: "Payments",
            icon: (
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8c-1.657 0-3 1.343-3 3s1.343 3 3 3 3 1.343 3 3m-3-9V4m0 14v2m-7-7h2m8 0h2" />
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
          }
        ]
      };
    } else {
      // Default fallback
      return {
        dashboardHref: "/",
        dashboardLabel: "Dashboard",
        navItems: []
      };
    }
  };

  const { dashboardHref, dashboardLabel, navItems } = getDashboardInfo();

  const isActive = (href: string) => {
    if (href === dashboardHref) {
      return pathname === dashboardHref;
    }
    return pathname.startsWith(href);
  };

  const mobileMenuClasses = isParent
    ? "md:hidden border-t border-slate-200/50 bg-gradient-to-br from-[#f8fafc]/90 via-white/90 to-[#f8fafc]/90 backdrop-blur-xl"
    : "md:hidden border-t border-white/30 bg-white/10 backdrop-blur-xl";

  return (
    <nav className={navClasses}>
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex justify-between items-center h-16">
          {/* Logo and Brand */}
          <Link href={dashboardHref} className="flex items-center space-x-3 hover:opacity-80 transition-opacity">
            <div className="relative">
              <Image 
                src="/logo-akademi.png" 
                alt="AlKhayr Class Logo" 
                width={40}
                height={40}
                className="object-contain"
              />
            </div>
            <div>
              <h1 className="text-xl font-bold text-gray-800 tracking-tight">AlKhayr Class</h1>
              <p className="text-xs text-gray-600 font-medium">{dashboardLabel}</p>
            </div>
          </Link>

          {/* Desktop Navigation */}
          <div className="hidden md:flex items-center space-x-1">
            {navItems.map((item) => (
              <Link
                key={item.href}
                href={item.href}
                className={`relative px-4 py-2 rounded-lg text-sm font-medium transition-all duration-300 flex items-center space-x-2 group ${
                  isActive(item.href)
                    ? "bg-gradient-to-r from-blue-500/20 to-purple-500/20 text-blue-700 shadow-lg backdrop-blur-sm border border-blue-200/50"
                    : "text-gray-700 hover:bg-white/30 hover:text-gray-900 hover:shadow-md hover:backdrop-blur-sm"
                }`}
              >
                <span className={`transition-transform group-hover:scale-110 ${isActive(item.href) ? 'text-blue-600' : 'text-gray-600'}`}>
                  {item.icon}
                </span>
                <span className="font-semibold">{item.label}</span>
                {isActive(item.href) && (
                  <div className="absolute bottom-0 left-1/2 transform -translate-x-1/2 w-2 h-2 bg-blue-500 rounded-full"></div>
                )}
              </Link>
            ))}
          </div>

          {/* Desktop Sign Out */}
          <div className="hidden md:flex items-center">
            <div className="bg-white/20 backdrop-blur-sm rounded-lg p-1 border border-white/30">
              <SignOutButton />
            </div>
          </div>

          {/* Mobile Menu Button */}
          <button
            onClick={() => setIsMobileMenuOpen(!isMobileMenuOpen)}
            className="md:hidden p-2 rounded-lg bg-white/20 backdrop-blur-sm border border-white/30 text-gray-700 hover:bg-white/30 transition-all duration-200"
          >
            <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              {isMobileMenuOpen ? (
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              ) : (
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16" />
              )}
            </svg>
          </button>
        </div>

        {/* Mobile Navigation Menu */}
        {isMobileMenuOpen && (
          <div className={mobileMenuClasses}>
            <div className="px-2 pt-2 pb-3 space-y-1">
              {navItems.map((item) => (
                <Link
                  key={item.href}
                  href={item.href}
                  onClick={() => setIsMobileMenuOpen(false)}
                  className={`block px-3 py-3 rounded-lg text-base font-medium transition-all duration-200 flex items-center space-x-3 ${
                    isActive(item.href)
                      ? "bg-gradient-to-r from-blue-500/20 to-purple-500/20 text-blue-700 shadow-lg backdrop-blur-sm border border-blue-200/50"
                      : "text-gray-700 hover:bg-white/30 hover:text-gray-900"
                  }`}
                >
                  <span className={`${isActive(item.href) ? 'text-blue-600' : 'text-gray-600'}`}>
                    {item.icon}
                  </span>
                  <span>{item.label}</span>
                </Link>
              ))}
              <div className="mt-3 pt-3 border-t border-white/30">
                <div className="bg-white/20 backdrop-blur-sm rounded-lg p-3 border border-white/30">
                  <SignOutButton />
                </div>
              </div>
            </div>
          </div>
        )}
      </div>
    </nav>
  );
}
