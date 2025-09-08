"use client";

import React, { useState, useRef, useEffect } from 'react';
import { X, FileText, Users, CheckSquare, ChevronDown, Calendar } from 'lucide-react';
import { DateRangePicker } from "@/components/ui/date-picker";
import { DateRange } from "react-day-picker";

interface CreateExamModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSubmit: (examData: ExamFormData) => void;
  classes: Array<{ id: string; name: string }>;
  subjects: string[];
}

interface ExamFormData {
  title: string;
  subjects: string[];
  classIds: string[];
  dateRange: DateRange | undefined;
  conductWeightages: { [classId: string]: number };
}

interface ExamFormErrors {
  title?: string;
  subjects?: string;
  classIds?: string;
  dateRange?: string;
  conductWeightages?: string;
}

export default function CreateExamModal({ isOpen, onClose, onSubmit, classes, subjects }: CreateExamModalProps) {
  const [formData, setFormData] = useState<ExamFormData>({
    title: '',
    subjects: [],
    classIds: [],
    dateRange: undefined,
    conductWeightages: {},
  });

  const [errors, setErrors] = useState<ExamFormErrors>({});
  const [isSubjectDropdownOpen, setIsSubjectDropdownOpen] = useState(false);
  const [isClassDropdownOpen, setIsClassDropdownOpen] = useState(false);
  
  const subjectDropdownRef = useRef<HTMLDivElement>(null);
  const classDropdownRef = useRef<HTMLDivElement>(null);

  const handleInputChange = (field: keyof ExamFormData, value: string | number | string[] | Date | DateRange | { [key: string]: number } | undefined) => {
    setFormData(prev => ({
      ...prev,
      [field]: value
    }));
    
    // Clear error when user starts typing
    if (errors[field]) {
      setErrors(prev => ({
        ...prev,
        [field]: undefined
      }));
    }
  };

  const handleConductWeightageChange = (classId: string, weightage: number) => {
    // Enforce limits: 0-50%
    const clampedWeightage = Math.max(0, Math.min(50, weightage));
    
    setFormData(prev => ({
      ...prev,
      conductWeightages: {
        ...prev.conductWeightages,
        [classId]: clampedWeightage
      }
    }));
    // Clear conduct weightages error when user changes weightage
    if (errors.conductWeightages) {
      setErrors(prev => ({
        ...prev,
        conductWeightages: undefined
      }));
    }
  };

  const handleMultiSelectChange = (field: 'subjects' | 'classIds', value: string, isChecked: boolean) => {
    setFormData(prev => {
      const updatedField = isChecked 
        ? [...prev[field], value]
        : prev[field].filter(item => item !== value);
      
      // If we're updating classIds, also update conduct weightages
      if (field === 'classIds') {
        const updatedWeightages = { ...prev.conductWeightages };
        
        if (isChecked) {
          // Set default weightage for newly selected class (default to 20%)
          if (!updatedWeightages[value]) {
            updatedWeightages[value] = 20;
          }
        } else {
          // Remove weightage for deselected class
          delete updatedWeightages[value];
        }
        
        return {
          ...prev,
          [field]: updatedField,
          conductWeightages: updatedWeightages
        };
      }
      
      return {
        ...prev,
        [field]: updatedField
      };
    });

    // Clear error when user starts selecting
    if (errors[field]) {
      setErrors(prev => ({
        ...prev,
        [field]: undefined
      }));
    }
  };

  const handleSelectAll = (field: 'subjects' | 'classIds', items: string[]) => {
    const isAllSelected = items.every(item => formData[field].includes(item));
    
    setFormData(prev => {
      const updatedField = isAllSelected ? [] : items;
      
      // If we're updating classIds, also update conduct weightages
      if (field === 'classIds') {
        const updatedWeightages = { ...prev.conductWeightages };
        
        if (isAllSelected) {
          // Remove all weightages when deselecting all
          items.forEach(classId => delete updatedWeightages[classId]);
        } else {
          // Set default weightage for all selected classes
          items.forEach(classId => {
            if (!updatedWeightages[classId]) {
              updatedWeightages[classId] = 20;
            }
          });
        }
        
        return {
          ...prev,
          [field]: updatedField,
          conductWeightages: updatedWeightages
        };
      }
      
      return {
        ...prev,
        [field]: updatedField
      };
    });

    // Clear error when user starts selecting
    if (errors[field]) {
      setErrors(prev => ({
        ...prev,
        [field]: undefined
      }));
    }
  };

  // Close dropdowns when clicking outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (subjectDropdownRef.current && !subjectDropdownRef.current.contains(event.target as Node)) {
        setIsSubjectDropdownOpen(false);
      }
      if (classDropdownRef.current && !classDropdownRef.current.contains(event.target as Node)) {
        setIsClassDropdownOpen(false);
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, []);

  const validateForm = (): boolean => {
    const newErrors: ExamFormErrors = {};

    if (!formData.title.trim()) newErrors.title = 'Title is required';
    if (formData.subjects.length === 0) newErrors.subjects = 'At least one subject is required';
    if (formData.classIds.length === 0) newErrors.classIds = 'At least one class is required';
    if (!formData.dateRange?.from) newErrors.dateRange = 'Date range is required';
    if (formData.dateRange?.from && formData.dateRange?.to && formData.dateRange.from > formData.dateRange.to) {
      newErrors.dateRange = 'End date must be after start date';
    }
    
    // Validate conduct weightages for selected classes
    const invalidWeightages = formData.classIds.filter(classId => {
      const weightage = formData.conductWeightages[classId];
      return weightage === undefined || weightage < 0 || weightage > 50;
    });
    
    if (invalidWeightages.length > 0) {
      newErrors.conductWeightages = 'All selected classes must have conduct weightage between 0-50%';
    }

    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    
    if (validateForm()) {
      onSubmit(formData);
      handleClose();
    }
  };

  const handleClose = () => {
    setFormData({
      title: '',
      subjects: [],
      classIds: [],
      dateRange: undefined,
      conductWeightages: {},
    });
    setErrors({});
    setIsSubjectDropdownOpen(false);
    setIsClassDropdownOpen(false);
    onClose();
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black/50 backdrop-blur-sm z-[10001] flex items-start justify-center p-4 overflow-y-auto">
      <div className="bg-white rounded-2xl shadow-2xl max-w-2xl w-full my-8 max-h-[calc(100vh-4rem)] overflow-hidden flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between p-6 border-b border-gray-200 flex-shrink-0">
          <div className="flex items-center gap-3">
            <div className="p-2 rounded-lg bg-blue-100">
              <FileText className="w-5 h-5 text-blue-600" />
            </div>
            <div>
              <h2 className="text-xl font-semibold text-gray-900">Create New Exam</h2>
              <p className="text-sm text-gray-600">Set up a new exam or quiz for your students</p>
            </div>
          </div>
          <button
            onClick={handleClose}
            className="p-2 hover:bg-gray-100 rounded-lg transition-colors"
          >
            <X className="w-5 h-5 text-gray-500" />
          </button>
        </div>

        {/* Form Content */}
        <form onSubmit={handleSubmit} className="flex flex-col flex-1 overflow-hidden">
          <div className="p-6 space-y-6 overflow-y-auto flex-1">
          {/* Basic Information */}
          <div className="space-y-4">
            <h3 className="text-lg font-semibold text-gray-900 flex items-center gap-2">
              <FileText className="w-5 h-5" />
              Basic Information
            </h3>
            
            <div>
              <label className="block text-sm font-semibold text-gray-700 mb-1">
                Exam Title *
              </label>
              <input
                type="text"
                value={formData.title}
                onChange={(e) => handleInputChange('title', e.target.value)}
                className={`w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent ${
                  errors.title ? 'border-blue-300 bg-blue-50' : 'border-gray-300'
                }`}
                placeholder="e.g., Mathematics Mid Term Exam"
              />
              {errors.title && <p className="text-red-500 text-xs mt-1">{errors.title}</p>}
            </div>
          </div>

          {/* Subject Selection */}
          <div className="space-y-4">
            <h3 className="text-lg font-semibold text-gray-900 flex items-center gap-2">
              <CheckSquare className="w-5 h-5" />
              Subject Selection
            </h3>
            
            <div className="relative" ref={subjectDropdownRef}>
              <label className="block text-sm font-semibold text-gray-700 mb-1">
                Select Subjects *
              </label>
              <button
                type="button"
                onClick={() => setIsSubjectDropdownOpen(!isSubjectDropdownOpen)}
                className={`w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent text-left flex items-center justify-between ${
                  errors.subjects ? 'border-blue-300 bg-blue-50' : 'border-gray-300'
                }`}
              >
                <span className="text-sm text-gray-700">
                  {formData.subjects.length === 0 ? 'Select subjects...' : 
                   formData.subjects.length === subjects.length ? 'All subjects selected' :
                   `${formData.subjects.length} subject${formData.subjects.length > 1 ? 's' : ''} selected`}
                </span>
                <ChevronDown className={`w-4 h-4 text-gray-500 transition-transform ${
                  isSubjectDropdownOpen ? 'rotate-180' : ''
                }`} />
              </button>
              
              {isSubjectDropdownOpen && (
                <div className="absolute z-50 w-full mt-1 bg-white border border-gray-200 rounded-lg shadow-lg max-h-48 overflow-y-auto">
                  <div className="p-2">
                    <label className="flex items-center space-x-3 cursor-pointer hover:bg-gray-50 p-2 rounded border-b border-gray-100">
                      <input
                        type="checkbox"
                        checked={formData.subjects.length === subjects.length}
                        onChange={() => handleSelectAll('subjects', subjects)}
                        className="rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                      />
                      <span className="text-sm font-semibold text-gray-900">Select All</span>
                    </label>
                    {subjects.map((subject) => (
                      <label key={subject} className="flex items-center space-x-3 cursor-pointer hover:bg-gray-50 p-2 rounded">
                        <input
                          type="checkbox"
                          checked={formData.subjects.includes(subject)}
                          onChange={(e) => handleMultiSelectChange('subjects', subject, e.target.checked)}
                          className="rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                        />
                        <span className="text-sm text-gray-700">{subject}</span>
                      </label>
                    ))}
                  </div>
                </div>
              )}
              {errors.subjects && <p className="text-red-500 text-xs mt-1">{errors.subjects}</p>}
            </div>
          </div>

          {/* Class Selection */}
          <div className="space-y-4">
            <h3 className="text-lg font-semibold text-gray-900 flex items-center gap-2">
              <Users className="w-5 h-5" />
              Class Selection
            </h3>
            
            <div className="relative" ref={classDropdownRef}>
              <label className="block text-sm font-semibold text-gray-700 mb-1">
                Select Classes *
              </label>
              <button
                type="button"
                onClick={() => setIsClassDropdownOpen(!isClassDropdownOpen)}
                className={`w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent text-left flex items-center justify-between ${
                  errors.classIds ? 'border-blue-300 bg-blue-50' : 'border-gray-300'
                }`}
              >
                <span className="text-sm text-gray-700">
                  {formData.classIds.length === 0 ? 'Select classes...' : 
                   formData.classIds.length === classes.length ? 'All classes selected' :
                   `${formData.classIds.length} class${formData.classIds.length > 1 ? 'es' : ''} selected`}
                </span>
                <ChevronDown className={`w-4 h-4 text-gray-500 transition-transform ${
                  isClassDropdownOpen ? 'rotate-180' : ''
                }`} />
              </button>
              
              {isClassDropdownOpen && (
                <div className="absolute z-50 w-full mt-1 bg-white border border-gray-200 rounded-lg shadow-lg max-h-48 overflow-y-auto">
                  <div className="p-2">
                    <label className="flex items-center space-x-3 cursor-pointer hover:bg-gray-50 p-2 rounded border-b border-gray-100">
                      <input
                        type="checkbox"
                        checked={formData.classIds.length === classes.length}
                        onChange={() => handleSelectAll('classIds', classes.map(c => c.id))}
                        className="rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                      />
                      <span className="text-sm font-semibold text-gray-900">Select All</span>
                    </label>
                    {classes.map((cls) => (
                      <label key={cls.id} className="flex items-center space-x-3 cursor-pointer hover:bg-gray-50 p-2 rounded">
                        <input
                          type="checkbox"
                          checked={formData.classIds.includes(cls.id)}
                          onChange={(e) => handleMultiSelectChange('classIds', cls.id, e.target.checked)}
                          className="rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                        />
                        <span className="text-sm text-gray-700">{cls.name}</span>
                      </label>
                    ))}
                  </div>
                </div>
              )}
              {errors.classIds && <p className="text-red-500 text-xs mt-1">{errors.classIds}</p>}
            </div>
          </div>

          {/* Examination Date Range */}
          <div className="space-y-4">
            <h3 className="text-lg font-semibold text-gray-900 flex items-center gap-2">
              <Calendar className="w-5 h-5" />
              Examination Period
            </h3>
            
            <div>
              <label className="block text-sm font-semibold text-gray-700 mb-1">
                Examination Date Range *
              </label>
              <DateRangePicker
                dateRange={formData.dateRange}
                onDateRangeChange={(range) => handleInputChange('dateRange', range)}
                placeholder="Select date range"
                error={!!errors.dateRange}
                numberOfMonths={2}
              />
              {errors.dateRange && <p className="text-red-500 text-xs mt-1">{errors.dateRange}</p>}
            </div>
          </div>


          {/* Conduct Mark Weightages */}
          {formData.classIds.length > 0 && (
            <div className="space-y-4">
              <h3 className="text-lg font-semibold text-gray-800 flex items-center gap-2">
                <div className="w-8 h-8 rounded-full bg-blue-100 flex items-center justify-center">
                  <span className="text-blue-600 font-semibold">%</span>
                </div>
                Conduct Mark Weightages
              </h3>
              
              <div className="space-y-3">
                <p className="text-sm text-gray-600">
                  Set the percentage contribution of conduct marks to the overall mark for each selected class:
                </p>
                
                {formData.classIds.map(classId => {
                  const classData = classes.find(c => c.id === classId);
                  return (
                    <div key={classId} className="flex items-center justify-between p-3 bg-gray-50 rounded-lg">
                      <div className="flex items-center gap-3">
                        <div className="w-3 h-3 rounded-full bg-blue-500"></div>
                        <span className="font-semibold text-gray-700">{classData?.name}</span>
                      </div>
                      
                      <div className="flex items-center gap-2">
                        <input
                          type="number"
                          min="0"
                          max="50"
                          value={formData.conductWeightages[classId] || 0}
                          onChange={(e) => handleConductWeightageChange(classId, parseInt(e.target.value) || 0)}
                          onBlur={(e) => {
                            // Ensure value is within limits when user stops typing
                            const value = parseInt(e.target.value) || 0;
                            if (value > 50 || value < 0) {
                              handleConductWeightageChange(classId, Math.max(0, Math.min(50, value)));
                            }
                          }}
                          className="w-16 px-2 py-1 text-center border rounded focus:ring-2 focus:ring-purple-500 focus:border-transparent"
                          placeholder="0"
                        />
                        <span className="text-gray-600">%</span>
                      </div>
                    </div>
                  );
                })}
                
                {errors.conductWeightages && (
                  <p className="text-red-500 text-xs">{errors.conductWeightages}</p>
                )}
                
                <div className="bg-blue-50 border border-blue-200 rounded-lg p-3">
                  <p className="text-xs text-blue-700">
                    <strong>Note:</strong> Academic marks will contribute the remaining percentage 
                    (e.g., if conduct is 20%, academic marks will be 80% of the total).
                  </p>
                </div>
              </div>
            </div>
          )}

          </div>
          
          {/* Submit Buttons */}
          <div className="flex gap-3 p-6 pt-4 border-t border-gray-200 flex-shrink-0">
            <button
              type="button"
              onClick={handleClose}
              className="flex-1 px-4 py-2 border border-gray-300 rounded-lg text-gray-700 hover:bg-gray-50 transition-colors"
            >
              Cancel
            </button>
            <button
              type="submit"
              className="flex-1 px-4 py-2 bg-blue-500 text-white rounded-lg hover:bg-blue-600 transition-colors"
            >
              Create Exam
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}