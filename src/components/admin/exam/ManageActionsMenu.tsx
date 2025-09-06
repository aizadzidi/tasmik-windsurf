"use client";
import React from "react";
import * as DropdownMenu from "@radix-ui/react-dropdown-menu";
import { BookOpen, UserCheck, Edit, Database, Settings } from "lucide-react";

interface ManageActionsMenuProps {
  onOpenSubjects: () => void;
  onOpenConduct: () => void;
  onOpenExams: () => void;
}

export default function ManageActionsMenu({
  onOpenSubjects,
  onOpenConduct,
  onOpenExams,
}: ManageActionsMenuProps) {
  return (
    <DropdownMenu.Root>
      <DropdownMenu.Trigger asChild>
        <button
          className="flex items-center gap-2 px-4 py-2 border border-gray-300 bg-white hover:bg-gray-50 text-gray-700 font-medium rounded-lg transition-colors shadow-sm"
          aria-label="Manage"
        >
          <ManageIcon />
          <span className="hidden sm:inline">Manage</span>
        </button>
      </DropdownMenu.Trigger>

      <DropdownMenu.Portal>
        <DropdownMenu.Content
          align="end"
          sideOffset={8}
          className="bg-white rounded-lg border border-gray-200 shadow-lg p-1 min-w-[220px] z-[1000]"
        >
          <MenuItem onSelect={onOpenExams} icon={<Edit className="w-4 h-4" />}>Manage Exams</MenuItem>
          <MenuItem onSelect={onOpenSubjects} icon={<BookOpen className="w-4 h-4" />}>Manage Subjects</MenuItem>
          <MenuItem onSelect={onOpenConduct} icon={<UserCheck className="w-4 h-4" />}>Manage Conduct</MenuItem>
        </DropdownMenu.Content>
      </DropdownMenu.Portal>
    </DropdownMenu.Root>
  );
}

function MenuItem({
  onSelect,
  icon,
  children,
}: {
  onSelect: () => void;
  icon: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <DropdownMenu.Item
      onSelect={() => {
        // Allow Radix to perform its default behavior (close the menu)
        // when an item is selected, then trigger the provided action.
        onSelect();
      }}
      className="flex items-center gap-3 px-3 py-2 rounded-md cursor-pointer outline-none select-none text-gray-700 hover:bg-gray-50 focus:bg-gray-50"
    >
      <span className="text-gray-500">{icon}</span>
      <span className="text-sm">{children}</span>
    </DropdownMenu.Item>
  );
}

function ManageIcon({ className }: { className?: string }) {
  return (
    <span className={`relative inline-block ${className || ''}`} style={{ width: 16, height: 16 }}>
      <Database className="w-4 h-4 text-gray-600" />
      <span
        className="absolute rounded-full bg-white ring-1 ring-gray-200"
        style={{ right: -2, bottom: -2, width: 12, height: 12 }}
      >
        <Settings className="w-3 h-3 text-gray-700" />
      </span>
    </span>
  );
}
