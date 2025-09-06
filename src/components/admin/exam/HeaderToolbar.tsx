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
  onExamChange: (examId: string) => void;
  exams: Array<{ id: string; name: string; type: string }>;
  subjects: string[];
}


export default function HeaderToolbar({
  selectedClass,
  onClassChange,
  searchQuery,
  onSearchChange,
  classes,
  selectedSubject,
  onSubjectChange,
  selectedExam,
  onExamChange,
  exams,
  subjects
}: HeaderToolbarProps) {
  const [showClassDropdown, setShowClassDropdown] = React.useState(false);
  const [showSubjectDropdown, setShowSubjectDropdown] = React.useState(false);
  const [showExamDropdown, setShowExamDropdown] = React.useState(false);

  // Close dropdowns when clicking outside
  React.useEffect(() => {
    const handleClickOutside = () => {
      setShowClassDropdown(false);
      setShowSubjectDropdown(false);
      setShowExamDropdown(false);
    };
    
    if (showClassDropdown || showSubjectDropdown || showExamDropdown) {
      document.addEventListener('click', handleClickOutside);
      return () => document.removeEventListener('click', handleClickOutside);
    }
  }, [showClassDropdown, showSubjectDropdown, showExamDropdown]);
  
  const selectedClassName = selectedClass && Array.isArray(classes) ? classes.find(c => c?.id === selectedClass)?.name : 'All Classes';
  const selectedSubjectName = selectedSubject || 'All Subjects';
  const selectedExamName = selectedExam && Array.isArray(exams) ? exams.find(e => e?.id === selectedExam)?.name : 'All Exams';
  
  return (
    <motion.div 
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.3 }}
      className="bg-white/90 backdrop-blur-sm border border-gray-100 rounded-2xl p-4 sm:p-6 mb-6 shadow-sm relative z-20"
    >
      <div className="flex flex-col gap-3">
        {/* Filter Row */}
        <div className="flex flex-col sm:flex-row gap-2 sm:gap-4 items-start sm:items-center">
        {/* Exam Filter - moved to first position */}
        <div className="relative">
          <motion.button
            onClick={() => setShowExamDropdown(!showExamDropdown)}
            whileHover={{ scale: 1.01 }}
            whileTap={{ scale: 0.99 }}
            className="flex items-center justify-between w-full px-3 sm:px-4 py-2.5 sm:py-3 rounded-xl border border-gray-200 hover:border-blue-300 transition-all duration-200 bg-white text-left min-w-[100px] sm:min-w-[160px] text-sm sm:text-base"
          >
            <span className="font-medium text-gray-800 truncate pr-2">{selectedExamName}</span>
            <ChevronDown className={`w-4 h-4 sm:w-4 sm:h-4 text-gray-400 transition-transform duration-200 flex-shrink-0 ${showExamDropdown ? 'rotate-180' : ''}`} />
          </motion.button>
          
          <AnimatePresence>
            {showExamDropdown && (
              <motion.div 
                initial={{ opacity: 0, y: -8, scale: 0.95 }}
                animate={{ opacity: 1, y: 0, scale: 1 }}
                exit={{ opacity: 0, y: -8, scale: 0.95 }}
                transition={{ duration: 0.15 }}
                className="absolute top-full left-0 mt-2 w-full bg-white border border-gray-100 rounded-xl shadow-xl z-30"
              >
                <button
                  onClick={() => {
                    onExamChange('');
                    setShowExamDropdown(false);
                  }}
                  className={`w-full text-left px-3 sm:px-4 py-2 sm:py-3 hover:bg-gray-50 transition-colors duration-150 first:rounded-t-xl text-sm sm:text-base ${
                    selectedExam === '' ? 'bg-blue-50 text-blue-700 font-medium' : 'text-gray-700'
                  }`}
                >
                  All Exams
                </button>
                {Array.isArray(exams) ? exams.map((exam) => exam && (
                  <button
                    key={exam.id}
                    onClick={() => {
                      onExamChange(exam.id);
                      setShowExamDropdown(false);
                    }}
                    className={`w-full text-left px-3 sm:px-4 py-2 sm:py-3 hover:bg-gray-50 transition-colors duration-150 last:rounded-b-xl text-sm sm:text-base ${
                      selectedExam === exam.id ? 'bg-blue-50 text-blue-700 font-medium' : 'text-gray-700'
                    }`}
                  >
                    <div className="flex items-center justify-between">
                      <span>{exam.name}</span>
                      <span className={`text-xs px-2 py-1 rounded-full ${
                        (typeof exam.type === 'string' && exam.type.toLowerCase() === 'quiz')
                          ? 'bg-green-100 text-green-700'
                          : 'bg-blue-100 text-blue-700'
                      }`}>
                        {(typeof exam.type === 'string' && exam.type.toLowerCase() === 'quiz') ? 'Quiz' : 'Exam'}
                      </span>
                    </div>
                  </button>
                )) : null}
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
            className="flex items-center justify-between w-full px-3 sm:px-4 py-2.5 sm:py-3 rounded-xl border border-gray-200 hover:border-blue-300 transition-all duration-200 bg-white text-left min-w-[100px] sm:min-w-[160px] text-sm sm:text-base"
          >
            <span className="font-medium text-gray-800 truncate pr-2">{selectedClassName}</span>
            <ChevronDown className={`w-4 h-4 sm:w-4 sm:h-4 text-gray-400 transition-transform duration-200 flex-shrink-0 ${showClassDropdown ? 'rotate-180' : ''}`} />
          </motion.button>
          
          <AnimatePresence>
            {showClassDropdown && (
              <motion.div 
                initial={{ opacity: 0, y: -8, scale: 0.95 }}
                animate={{ opacity: 1, y: 0, scale: 1 }}
                exit={{ opacity: 0, y: -8, scale: 0.95 }}
                transition={{ duration: 0.15 }}
                className="absolute top-full left-0 mt-2 w-full bg-white border border-gray-100 rounded-xl shadow-xl z-30"
              >
                <button
                  onClick={() => {
                    onClassChange('');
                    setShowClassDropdown(false);
                  }}
                  className={`w-full text-left px-3 sm:px-4 py-2 sm:py-3 hover:bg-gray-50 transition-colors duration-150 first:rounded-t-xl text-sm sm:text-base ${
                    selectedClass === '' ? 'bg-blue-50 text-blue-700 font-medium' : 'text-gray-700'
                  }`}
                >
                  All Classes
                </button>
                {Array.isArray(classes) ? classes.map((cls) => cls && (
                  <button
                    key={cls.id}
                    onClick={() => {
                      onClassChange(cls.id);
                      setShowClassDropdown(false);
                    }}
                    className={`w-full text-left px-3 sm:px-4 py-2 sm:py-3 hover:bg-gray-50 transition-colors duration-150 last:rounded-b-xl text-sm sm:text-base ${
                      selectedClass === cls.id ? 'bg-blue-50 text-blue-700 font-medium' : 'text-gray-700'
                    }`}
                  >
                    {cls.name}
                  </button>
                )) : null}
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
            className="flex items-center justify-between w-full px-3 sm:px-4 py-2.5 sm:py-3 rounded-xl border border-gray-200 hover:border-blue-300 transition-all duration-200 bg-white text-left min-w-[100px] sm:min-w-[160px] text-sm sm:text-base"
          >
            <span className="font-medium text-gray-800 truncate pr-2">{selectedSubjectName}</span>
            <ChevronDown className={`w-4 h-4 sm:w-4 sm:h-4 text-gray-400 transition-transform duration-200 flex-shrink-0 ${showSubjectDropdown ? 'rotate-180' : ''}`} />
          </motion.button>
          
          <AnimatePresence>
            {showSubjectDropdown && (
              <motion.div 
                initial={{ opacity: 0, y: -8, scale: 0.95 }}
                animate={{ opacity: 1, y: 0, scale: 1 }}
                exit={{ opacity: 0, y: -8, scale: 0.95 }}
                transition={{ duration: 0.15 }}
                className="absolute top-full left-0 mt-2 w-full bg-white border border-gray-100 rounded-xl shadow-xl z-30"
              >
                <button
                  onClick={() => {
                    onSubjectChange('');
                    setShowSubjectDropdown(false);
                  }}
                  className={`w-full text-left px-3 sm:px-4 py-2 sm:py-3 hover:bg-gray-50 transition-colors duration-150 first:rounded-t-xl text-sm sm:text-base ${
                    selectedSubject === '' ? 'bg-blue-50 text-blue-700 font-medium' : 'text-gray-700'
                  }`}
                >
                  All Subjects
                </button>
                {Array.isArray(subjects) ? subjects.map((subject) => subject && (
                  <button
                    key={subject}
                    onClick={() => {
                      onSubjectChange(subject);
                      setShowSubjectDropdown(false);
                    }}
                    className={`w-full text-left px-3 sm:px-4 py-2 sm:py-3 hover:bg-gray-50 transition-colors duration-150 last:rounded-b-xl text-sm sm:text-base ${
                      selectedSubject === subject ? 'bg-blue-50 text-blue-700 font-medium' : 'text-gray-700'
                    }`}
                  >
                    {subject}
                  </button>
                )) : null}
              </motion.div>
            )}
          </AnimatePresence>
        </div>

        </div>
        
        {/* Search Bar - Full Width Row */}
        <div className="relative w-full">
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
