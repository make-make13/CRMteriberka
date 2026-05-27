import React, { useState, useRef, useEffect } from 'react';
import { motion } from 'framer-motion';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { format, addMonths, subMonths, startOfMonth, endOfMonth, startOfWeek, endOfWeek, eachDayOfInterval, isSameMonth, isSameDay, isToday } from 'date-fns';
import { ru } from 'date-fns/locale';
import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';

function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

interface CustomDatePickerProps {
  selectedDate: Date;
  onChange: (date: Date) => void;
  isDarkMode: boolean;
  isOpen: boolean;
  setIsOpen: (isOpen: boolean) => void;
}

export function CustomDatePicker({ selectedDate, onChange, isDarkMode, isOpen, setIsOpen }: CustomDatePickerProps) {
  const [currentMonth, setCurrentMonth] = useState(startOfMonth(selectedDate));
  const popoverRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (isOpen) {
      setCurrentMonth(startOfMonth(selectedDate));
    }
  }, [selectedDate, isOpen]);

  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (popoverRef.current && !popoverRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    }
    if (isOpen) {
      document.addEventListener('mousedown', handleClickOutside);
    }
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [isOpen, setIsOpen]);

  const handlePrevMonth = () => setCurrentMonth(subMonths(currentMonth, 1));
  const handleNextMonth = () => setCurrentMonth(addMonths(currentMonth, 1));

  const monthStart = startOfMonth(currentMonth);
  const monthEnd = endOfMonth(monthStart);
  const startDate = startOfWeek(monthStart, { weekStartsOn: 1 });
  const endDate = endOfWeek(monthEnd, { weekStartsOn: 1 });

  const dateFormat = "d";
  const days = eachDayOfInterval({
    start: startDate,
    end: endDate
  });

  const weekDays = ['пн', 'вт', 'ср', 'чт', 'пт', 'сб', 'вс'];

  if (!isOpen) return null;

  return (
    <div 
      ref={popoverRef}
      className={cn(
        "absolute top-full left-1/2 -translate-x-1/2 mt-4 p-4 rounded-2xl shadow-2xl z-50 w-[280px]",
        isDarkMode ? "bg-[#1a1a1a] border border-white/5" : "bg-white border border-gray-200"
      )}
    >
      <div className="flex justify-between items-center mb-6 px-2">
        <motion.button 
          onClick={handlePrevMonth}
          whileTap={{ scale: 0.9 }}
          className={cn(
            "w-8 h-8 flex items-center justify-center rounded-full transition-colors",
            isDarkMode ? "hover:bg-white/10 text-gray-400 bg-white/5" : "hover:bg-gray-100 text-gray-600 bg-gray-50"
          )}
        >
          <ChevronLeft size={16} />
        </motion.button>
        <div className={cn(
          "text-sm font-bold capitalize",
          isDarkMode ? "text-white" : "text-gray-900"
        )}>
          {format(currentMonth, 'LLLL yyyy', { locale: ru })}
        </div>
        <motion.button 
          onClick={handleNextMonth}
          whileTap={{ scale: 0.9 }}
          className={cn(
            "w-8 h-8 flex items-center justify-center rounded-full transition-colors",
            isDarkMode ? "hover:bg-white/10 text-gray-400 bg-white/5" : "hover:bg-gray-100 text-gray-600 bg-gray-50"
          )}
        >
          <ChevronRight size={16} />
        </motion.button>
      </div>

      <div className="grid grid-cols-7 gap-y-4 gap-x-1 mb-4">
        {weekDays.map(day => (
          <div key={day} className={cn(
            "text-center text-xs font-medium",
            isDarkMode ? "text-gray-400" : "text-gray-500"
          )}>
            {day}
          </div>
        ))}
        {days.map((day, dayIdx) => {
          const isSelected = isSameDay(day, selectedDate);
          const isCurrentMonth = isSameMonth(day, monthStart);
          const isTodayDate = isToday(day);

          return (
            <div key={day.toString()} className="flex items-center justify-center">
              <motion.button
                onClick={() => {
                  onChange(day);
                  setIsOpen(false);
                }}
                whileTap={{ scale: 0.9 }}
                className={cn(
                  "h-8 w-8 rounded-full flex items-center justify-center text-sm font-medium transition-all relative",
                  !isCurrentMonth && (isDarkMode ? "text-gray-600" : "text-gray-300"),
                  isCurrentMonth && !isSelected && !isTodayDate && (isDarkMode ? "text-white hover:bg-white/10" : "text-gray-900 hover:bg-gray-100"),
                  isTodayDate && !isSelected && (isDarkMode ? "bg-white/10 text-white" : "bg-gray-100 text-gray-900"),
                  isSelected && (isDarkMode ? "bg-[#e5e7eb] text-black ring-2 ring-[#eab308] ring-offset-2 ring-offset-[#1a1a1a]" : "bg-gray-900 text-white ring-2 ring-[#eab308] ring-offset-2 ring-offset-white")
                )}
              >
                {format(day, dateFormat)}
              </motion.button>
            </div>
          );
        })}
      </div>
    </div>
  );
}
