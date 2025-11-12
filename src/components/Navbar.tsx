"use client";
import React, { useState } from "react";
import Link from "next/link";
import Image from "next/image";
import { usePathname } from "next/navigation";
import SignOutButton from "@/components/SignOutButton";

export default function Navbar() {
  const pathname = usePathname();
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);

  // Determine the user role and dashboard info based on current path
  const isParent = pathname.startsWith('/parent');
  const isTeacher = pathname.startsWith('/teacher');
  const isAdmin = pathname.startsWith('/admin');

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
            href: "/teacher/exam", 
            label: "Exams", 
            icon: (
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
              </svg>
            )
          }
        ]
      };
    } else if (isAdmin) {
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

  return (
    <nav className="relative z-50 bg-white/20 backdrop-blur-xl border-b border-white/30 shadow-lg">
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
          <div className="md:hidden border-t border-white/30 bg-white/10 backdrop-blur-xl">
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
