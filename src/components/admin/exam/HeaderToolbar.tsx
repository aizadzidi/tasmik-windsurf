"use client";

import React from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Search, ChevronDown } from 'lucide-react';

interface HeaderToolbarProps {
  selectedClass: string;
  onClassChange: (classId: string) => void;
  searchQuery: string;
  onSearchChange: (query: string) => void;
  classes: Array<{ id: string; name: string }>;
  selectedSubject: string;
  onSubjectChange: (subject: string) => void;
  selectedExam: string;
  onExamChange: (exam: string) => void;
}

const subjects = ['Math', 'English', 'Science', 'BM', 'BI', 'Quran', 'Arabic', 'History'];
const exams = ['Midterm Exam', 'Final Exam', 'Quiz 1', 'Quiz 2', 'Assignment 1', 'Monthly Test'];

export default function HeaderToolbar({
  selectedClass,
  onClassChange,
  searchQuery,
  onSearchChange,
  classes,
  selectedSubject,
  onSubjectChange,
  selectedExam,
  onExamChange
}: HeaderToolbarProps) {
  const [showClassDropdown, setShowClassDropdown] = React.useState(false);
  const [showSubjectDropdown, setShowSubjectDropdown] = React.useState(false);
  const [showExamDropdown, setShowExamDropdown] = React.useState(false);
  
  const selectedClassName = selectedClass ? classes.find(c => c.id === selectedClass)?.name : 'All Classes';
  const selectedSubjectName = selectedSubject || 'All Subjects';
  const selectedExamName = selectedExam || 'All Exams';
  
  return (
    <motion.div 
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.3 }}
      className="bg-white/90 backdrop-blur-sm border border-gray-100 rounded-2xl p-6 mb-6 shadow-sm relative z-[10000]"
    >
      <div className="flex flex-col sm:flex-row gap-4 items-start sm:items-center">
        {/* Exam Filter - moved to first position */}
        <div className="relative">
          <motion.button
            onClick={() => setShowExamDropdown(!showExamDropdown)}
            whileHover={{ scale: 1.01 }}
            whileTap={{ scale: 0.99 }}
            className="flex items-center justify-between w-full px-4 py-3 rounded-xl border border-gray-200 hover:border-blue-300 transition-all duration-200 bg-white text-left min-w-[180px]"
          >
            <span className="font-medium text-gray-800">{selectedExamName}</span>
            <ChevronDown className={`w-4 h-4 text-gray-400 transition-transform duration-200 ${showExamDropdown ? 'rotate-180' : ''}`} />
          </motion.button>
          
          <AnimatePresence>
            {showExamDropdown && (
              <motion.div 
                initial={{ opacity: 0, y: -8, scale: 0.95 }}
                animate={{ opacity: 1, y: 0, scale: 1 }}
                exit={{ opacity: 0, y: -8, scale: 0.95 }}
                transition={{ duration: 0.15 }}
                className="absolute top-full left-0 mt-2 w-full bg-white border border-gray-100 rounded-xl shadow-xl z-[9999]"
              >
                <button
                  onClick={() => {
                    onExamChange('');
                    setShowExamDropdown(false);
                  }}
                  className={`w-full text-left px-4 py-3 hover:bg-gray-50 transition-colors duration-150 first:rounded-t-xl ${
                    selectedExam === '' ? 'bg-blue-50 text-blue-700 font-medium' : 'text-gray-700'
                  }`}
                >
                  All Exams
                </button>
                {exams.map((exam) => (
                  <button
                    key={exam}
                    onClick={() => {
                      onExamChange(exam);
                      setShowExamDropdown(false);
                    }}
                    className={`w-full text-left px-4 py-3 hover:bg-gray-50 transition-colors duration-150 last:rounded-b-xl ${
                      selectedExam === exam ? 'bg-blue-50 text-blue-700 font-medium' : 'text-gray-700'
                    }`}
                  >
                    {exam}
                  </button>
                ))}
              </motion.div>
            )}
          </AnimatePresence>
        </div>

        {/* Class Filter */}
        <div className="relative">
          <motion.button
            onClick={() => setShowClassDropdown(!showClassDropdown)}
            whileHover={{ scale: 1.01 }}
            whileTap={{ scale: 0.99 }}
            className="flex items-center justify-between w-full px-4 py-3 rounded-xl border border-gray-200 hover:border-blue-300 transition-all duration-200 bg-white text-left min-w-[180px]"
          >
            <span className="font-medium text-gray-800">{selectedClassName}</span>
            <ChevronDown className={`w-4 h-4 text-gray-400 transition-transform duration-200 ${showClassDropdown ? 'rotate-180' : ''}`} />
          </motion.button>
          
          <AnimatePresence>
            {showClassDropdown && (
              <motion.div 
                initial={{ opacity: 0, y: -8, scale: 0.95 }}
                animate={{ opacity: 1, y: 0, scale: 1 }}
                exit={{ opacity: 0, y: -8, scale: 0.95 }}
                transition={{ duration: 0.15 }}
                className="absolute top-full left-0 mt-2 w-full bg-white border border-gray-100 rounded-xl shadow-xl z-[9999]"
              >
                <button
                  onClick={() => {
                    onClassChange('');
                    setShowClassDropdown(false);
                  }}
                  className={`w-full text-left px-4 py-3 hover:bg-gray-50 transition-colors duration-150 first:rounded-t-xl ${
                    selectedClass === '' ? 'bg-blue-50 text-blue-700 font-medium' : 'text-gray-700'
                  }`}
                >
                  All Classes
                </button>
                {classes.map((cls) => (
                  <button
                    key={cls.id}
                    onClick={() => {
                      onClassChange(cls.id);
                      setShowClassDropdown(false);
                    }}
                    className={`w-full text-left px-4 py-3 hover:bg-gray-50 transition-colors duration-150 last:rounded-b-xl ${
                      selectedClass === cls.id ? 'bg-blue-50 text-blue-700 font-medium' : 'text-gray-700'
                    }`}
                  >
                    {cls.name}
                  </button>
                ))}
              </motion.div>
            )}
          </AnimatePresence>
        </div>

        {/* Subject Filter */}
        <div className="relative">
          <motion.button
            onClick={() => setShowSubjectDropdown(!showSubjectDropdown)}
            whileHover={{ scale: 1.01 }}
            whileTap={{ scale: 0.99 }}
            className="flex items-center justify-between w-full px-4 py-3 rounded-xl border border-gray-200 hover:border-blue-300 transition-all duration-200 bg-white text-left min-w-[180px]"
          >
            <span className="font-medium text-gray-800">{selectedSubjectName}</span>
            <ChevronDown className={`w-4 h-4 text-gray-400 transition-transform duration-200 ${showSubjectDropdown ? 'rotate-180' : ''}`} />
          </motion.button>
          
          <AnimatePresence>
            {showSubjectDropdown && (
              <motion.div 
                initial={{ opacity: 0, y: -8, scale: 0.95 }}
                animate={{ opacity: 1, y: 0, scale: 1 }}
                exit={{ opacity: 0, y: -8, scale: 0.95 }}
                transition={{ duration: 0.15 }}
                className="absolute top-full left-0 mt-2 w-full bg-white border border-gray-100 rounded-xl shadow-xl z-[9999]"
              >
                <button
                  onClick={() => {
                    onSubjectChange('');
                    setShowSubjectDropdown(false);
                  }}
                  className={`w-full text-left px-4 py-3 hover:bg-gray-50 transition-colors duration-150 first:rounded-t-xl ${
                    selectedSubject === '' ? 'bg-blue-50 text-blue-700 font-medium' : 'text-gray-700'
                  }`}
                >
                  All Subjects
                </button>
                {subjects.map((subject) => (
                  <button
                    key={subject}
                    onClick={() => {
                      onSubjectChange(subject);
                      setShowSubjectDropdown(false);
                    }}
                    className={`w-full text-left px-4 py-3 hover:bg-gray-50 transition-colors duration-150 last:rounded-b-xl ${
                      selectedSubject === subject ? 'bg-blue-50 text-blue-700 font-medium' : 'text-gray-700'
                    }`}
                  >
                    {subject}
                  </button>
                ))}
              </motion.div>
            )}
          </AnimatePresence>
        </div>

        {/* Search Bar */}
        <div className="relative flex-1 min-w-[240px]">
          <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 w-4 h-4" />
          <input
            type="text"
            placeholder="Search students..."
            value={searchQuery}
            onChange={(e) => onSearchChange(e.target.value)}
            className="w-full pl-10 pr-4 py-3 rounded-xl border border-gray-200 focus:ring-2 focus:ring-blue-500 focus:border-transparent text-sm bg-white transition-all duration-200"
          />
        </div>
      </div>
    </motion.div>
  );
}