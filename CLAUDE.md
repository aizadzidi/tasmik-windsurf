# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

**Tasmik Windsurf** is a web application for Islamic schools to track student Quran memorization progress (Tasmik) and conduct assessments. Built with Next.js 15, TypeScript, and Supabase for authentication and database management.

**Core Purpose**: Enable teachers to record student memorization reports, admins to manage users and classes, and prepare for future parent access to view their children's progress.

## Development Commands

### Core Development
- `npm run dev` - Start development server with Turbopack (fastest)
- `npm run build` - Build for production 
- `npm run start` - Start production server
- `npm run lint` - Run ESLint to check code quality

### Database Operations
- Check Supabase connection via environment variables
- Use SQL scripts in root directory for database setup:
  - `supabase-complete-setup.sql` - Complete fresh installation
  - `classes-rls-only.sql` - Add class functionality to existing setup
  - `debug-classes.sql` - Troubleshoot class-related issues

## Architecture & Structure

### Authentication & User Roles
- **Supabase Auth**: Email/password authentication
- **Role-based Access Control**: Three user types with distinct permissions:
  - `admin`: Full system access, user management, student assignment
  - `teacher`: Access to assigned students and classes only
  - `parent`: Access to own children's data (future implementation)

### Database Schema (Supabase)
**Core Tables:**
- `users` - Authentication with role-based permissions
- `students` - Student records with parent/teacher/class assignments
- `classes` - Class definitions (9 Islamic classes: Abu Dawood, Bayhaqi, Bukhari, etc.)
- `reports` - Memorization progress tracking

**Row Level Security (RLS)**: All tables use RLS policies for role-based data access

### Application Structure
**Page Routing:**
- `/` - Landing page with glassmorphism design
- `/login` - Authentication page
- `/admin` - Student management dashboard (admin only)
- `/teacher` - Report creation and class views (teacher only)
- `/parent` - Child progress view (planned for future)
- `/teacher/exam` - Assessment dashboard with data visualization

**Component Architecture:**
- `src/components/ui/` - Reusable UI components (shadcn/ui style)
- `src/components/teacher/` - Teacher-specific components (charts, modals)
- `src/lib/supabaseClient.ts` - Centralized Supabase client configuration

### Key Technologies
- **Frontend**: Next.js 15 (App Router), React 19, TypeScript
- **Styling**: Tailwind CSS with custom configurations, glassmorphism effects
- **UI Components**: Custom implementation inspired by shadcn/ui
- **Database**: Supabase (PostgreSQL with RLS)
- **Data Visualization**: @nivo/line and @nivo/radar for exam dashboards
- **State Management**: React hooks with local state

## Environment Configuration

**Required Environment Variables:**
```env
NEXT_PUBLIC_SUPABASE_URL=your_supabase_project_url
NEXT_PUBLIC_SUPABASE_ANON_KEY=your_supabase_anon_key
```

## Development Patterns

### Database Operations
- Always use the centralized `supabaseClient.ts` for database connections
- Follow RLS patterns for role-based data access
- Use TypeScript interfaces for database entities (Student, Teacher, Parent, Class)

### Component Patterns
- Use TypeScript interfaces for all props and data structures
- Implement loading states and error handling for async operations
- Follow the established glassmorphism design system with backdrop-blur effects

### State Management
- Use React hooks for local component state
- Implement real-time updates using Supabase subscriptions where needed
- Handle form validation and user feedback with success/error messages

### Authentication Flow
- Default user role is 'parent' on signup
- Role-based redirects: admin → `/admin`, teacher → `/teacher`, parent → `/parent`
- Admin can change user roles via Supabase dashboard

## Common Operations

### Adding New Features
1. Check existing patterns in similar components
2. Follow TypeScript typing conventions
3. Implement proper error handling and loading states
4. Update RLS policies if new database operations are needed
5. Test with different user roles

### Database Troubleshooting
- Use `debug-classes.sql` to troubleshoot access issues
- Check RLS policies if users can't access expected data
- Verify environment variables are correctly set
- Use Supabase dashboard to check table structures and policies

### UI Development
- Follow the established color scheme (purple/blue gradients)
- Use glassmorphism effects with `backdrop-blur` classes
- Implement responsive design with mobile-first approach
- Maintain accessibility with proper ARIA labels and keyboard navigation

## Testing & Quality

### Before Deployment
- Run `npm run build` to ensure production build succeeds
- Run `npm run lint` and fix all issues
- Test user flows with different role permissions
- Verify all database operations work correctly
- Check responsive design on multiple screen sizes

### Database Validation
- Ensure RLS policies are working correctly
- Test data access with different user roles
- Verify all required tables and indexes exist
- Check that environment variables are set in deployment

## Known Issues & Solutions

### Empty Dropdowns
**Problem**: Class/parent dropdowns showing no data
**Solution**: Run `classes-rls-only.sql` to fix RLS policies

### Permission Denied Errors
**Problem**: Users can't access expected data
**Solution**: Check RLS policies using `debug-classes.sql`

### Build Failures
**Problem**: TypeScript or linting errors preventing build
**Solution**: Run `npm run lint` and fix all reported issues before deployment

## Future Development

### Planned Features
- Parent dashboard with child progress visualization
- Advanced exam/quiz system with full backend integration
- Real-time notifications and messaging
- Advanced analytics and progress tracking
- Mobile app version

### Database Extensions
- `subjects` table for curriculum management
- `teacher_assignments` for class-subject mappings
- `assessments` and `student_marks` for exam system
- Enhanced reporting with conduct tracking