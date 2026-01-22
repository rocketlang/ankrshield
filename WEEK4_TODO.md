# Week 4: Frontend Foundation - TODO

**Target Dates**: January 22-26, 2026
**Status**: Ready to Start 🚀
**Dependencies**: Week 3 ✅ (API running on port 4250)

## 📋 Overview

Week 4 focuses on building the React frontend with modern tools:
- **Apollo Client** for GraphQL
- **Zustand** for state management
- **React Router** for navigation
- **TailwindCSS** for styling (already configured ✅)
- **UI Components** library

## ✅ What's Already Done

### Dependencies Installed
- ✅ React 19
- ✅ Vite build tool
- ✅ TailwindCSS + PostCSS + Autoprefixer
- ✅ @apollo/client
- ✅ zustand
- ✅ react-router-dom
- ✅ lucide-react (icons)
- ✅ recharts (for charts/graphs)
- ✅ TypeScript configured

### Configuration Files
- ✅ `vite.config.ts` - Vite configuration
- ✅ `tailwind.config.js` - TailwindCSS setup
- ✅ `postcss.config.js` - PostCSS setup
- ✅ `tsconfig.json` - TypeScript configuration
- ✅ `package.json` - All dependencies listed

### Basic Structure
- ✅ `src/main.tsx` - Entry point
- ✅ `src/App.tsx` - Basic placeholder component
- ✅ `src/index.css` - TailwindCSS imports
- ✅ `index.html` - HTML template

## 📝 TODO List (17 Tasks)

### Phase 1: Apollo Client Setup (3 tasks)
- [ ] **Task 1**: Configure Apollo Client with GraphQL endpoint
  - Create `src/lib/apollo.ts`
  - Connect to `http://localhost:4250/graphql`
  - Setup auth token handling
  - Configure error handling

- [ ] **Task 2**: Create Apollo Provider wrapper in main.tsx
  - Wrap app with `<ApolloProvider>`
  - Import Apollo Client instance
  - Test connection

- [ ] **Task 3**: Setup GraphQL code generation (optional but recommended)
  - Install `@graphql-codegen/cli`
  - Create `codegen.yml`
  - Generate TypeScript types from schema
  - Create npm script for codegen

**Estimated Time**: 2-3 hours

---

### Phase 2: State Management with Zustand (2 tasks)
- [ ] **Task 4**: Create auth store with Zustand
  - Create `src/stores/authStore.ts`
  - State: `user`, `token`, `isAuthenticated`
  - Actions: `login`, `logout`, `setToken`, `loadUser`
  - Persist to localStorage

- [ ] **Task 5**: Create settings store with Zustand
  - Create `src/stores/settingsStore.ts`
  - State: `theme`, `privacyLevel`, `notifications`
  - Actions: `setTheme`, `setPrivacyLevel`, `toggleNotifications`
  - Persist to localStorage

**Estimated Time**: 1-2 hours

---

### Phase 3: React Router Setup (2 tasks)
- [ ] **Task 6**: Setup React Router with routes
  - Install and configure react-router-dom (already installed ✅)
  - Create `src/routes.tsx` with route definitions:
    - `/` - Landing page
    - `/login` - Login page
    - `/register` - Register page
    - `/dashboard` - Dashboard (protected)
    - `/devices` - Devices list (protected)
    - `/analytics` - Analytics page (protected)
    - `/policies` - Policies page (protected)
    - `/settings` - Settings page (protected)

- [ ] **Task 7**: Create ProtectedRoute component
  - Create `src/components/ProtectedRoute.tsx`
  - Check authentication from authStore
  - Redirect to `/login` if not authenticated
  - Handle loading states

**Estimated Time**: 1-2 hours

---

### Phase 4: Layout Components (1 task)
- [ ] **Task 8**: Create layout components
  - **Header** (`src/components/layout/Header.tsx`)
    - Logo
    - Navigation menu
    - User profile dropdown
    - Logout button
  - **Sidebar** (`src/components/layout/Sidebar.tsx`)
    - Navigation links
    - Active route highlighting
    - Collapse/expand functionality
  - **ContentWrapper** (`src/components/layout/ContentWrapper.tsx`)
    - Main content area
    - Breadcrumbs
    - Page title

**Estimated Time**: 2-3 hours

---

### Phase 5: Form Components (1 task)
- [ ] **Task 9**: Create form components
  - **Input** (`src/components/ui/Input.tsx`)
    - Text, email, password variants
    - Error states
    - Labels and helpers
  - **Button** (`src/components/ui/Button.tsx`)
    - Primary, secondary, danger variants
    - Loading states
    - Disabled states
  - **Select** (`src/components/ui/Select.tsx`)
    - Dropdown select
    - Multi-select option
  - **Checkbox** (`src/components/ui/Checkbox.tsx`)
    - Checked/unchecked states
    - Labels

**Estimated Time**: 2-3 hours

---

### Phase 6: Data Display Components (1 task)
- [ ] **Task 10**: Create data display components
  - **Card** (`src/components/ui/Card.tsx`)
    - Header, body, footer
    - Variants (default, highlighted)
  - **Table** (`src/components/ui/Table.tsx`)
    - Headers, rows, cells
    - Sortable columns
    - Pagination
  - **Badge** (`src/components/ui/Badge.tsx`)
    - Status indicators
    - Color variants
  - **Alert** (`src/components/ui/Alert.tsx`)
    - Success, warning, error, info
    - Dismissible option

**Estimated Time**: 2-3 hours

---

### Phase 7: Authentication Pages (2 tasks)
- [ ] **Task 11**: Create Login page
  - Create `src/pages/Login.tsx`
  - Login form with email + password
  - GraphQL mutation for login
  - Store JWT token in authStore
  - Redirect to dashboard on success
  - Show error messages

- [ ] **Task 12**: Create Register page
  - Create `src/pages/Register.tsx`
  - Registration form (email, password, name)
  - GraphQL mutation for register
  - Form validation
  - Redirect to dashboard on success
  - Show error messages

**Estimated Time**: 2-3 hours

---

### Phase 8: Core Pages (2 tasks)
- [ ] **Task 13**: Create Dashboard page
  - Create `src/pages/Dashboard.tsx`
  - Overview cards (total requests, blocked, privacy score)
  - Recent activity chart (using recharts)
  - Quick stats
  - GraphQL queries for dashboard data

- [ ] **Task 14**: Create Devices page
  - Create `src/pages/Devices.tsx`
  - List all user devices
  - Show device status (active/inactive)
  - Last seen timestamp
  - GraphQL query for devices list

**Estimated Time**: 2-3 hours

---

### Phase 9: Testing & Integration (2 tasks)
- [ ] **Task 15**: Test Apollo Client queries and mutations
  - Test register mutation
  - Test login mutation
  - Test `me` query
  - Test `devices` query
  - Verify error handling
  - Check loading states

- [ ] **Task 16**: Start web app on port 5250
  - Update `vite.config.ts` to use port 5250
  - Start via ankr-ctl: `bash ankr-ctl.sh start ankrshield-web`
  - Verify it's accessible
  - Test hot reload
  - Check build process

**Estimated Time**: 1-2 hours

---

### Phase 10: Documentation (1 task)
- [ ] **Task 17**: Create Week 4 completion documentation
  - Create `WEEK4_COMPLETED.md`
  - List all completed tasks
  - Add screenshots
  - Document component structure
  - Note any issues or deviations
  - Outline Week 5 tasks

**Estimated Time**: 1 hour

---

## 📊 Summary

**Total Tasks**: 17
**Estimated Time**: 18-26 hours (2-3 days)
**Priority**: High (blocking Week 5)

## 🎯 Success Criteria

By the end of Week 4, you should have:

1. ✅ **Running Web App**
   - Accessible at `http://localhost:5250`
   - Managed by ankr-ctl

2. ✅ **Working Authentication**
   - Users can register
   - Users can login
   - JWT tokens stored and used
   - Protected routes work

3. ✅ **Core Pages**
   - Login page functional
   - Register page functional
   - Dashboard shows data
   - Devices page shows list

4. ✅ **Apollo Integration**
   - Queries work
   - Mutations work
   - Error handling functional
   - Loading states shown

5. ✅ **UI Components**
   - Reusable component library
   - Consistent styling with TailwindCSS
   - Responsive design

## 🔧 Configuration Reference

### Port Allocation
- **API**: 4250 ✅ (running)
- **Web**: 5250 (to start)
- **Database**: 5432 ✅
- **Redis**: 6379 ✅

### Environment Variables
Create `apps/web/.env`:
```env
VITE_API_URL=http://localhost:4250/graphql
VITE_APP_NAME=ankrshield
VITE_APP_VERSION=0.1.0
```

### Vite Config
Update `apps/web/vite.config.ts`:
```typescript
export default defineConfig({
  plugins: [react()],
  server: {
    port: 5250,
    host: '0.0.0.0',
  },
});
```

## 📚 Key Files to Create

### Directory Structure
```
apps/web/src/
├── components/
│   ├── layout/
│   │   ├── Header.tsx
│   │   ├── Sidebar.tsx
│   │   └── ContentWrapper.tsx
│   ├── ui/
│   │   ├── Button.tsx
│   │   ├── Input.tsx
│   │   ├── Select.tsx
│   │   ├── Checkbox.tsx
│   │   ├── Card.tsx
│   │   ├── Table.tsx
│   │   ├── Badge.tsx
│   │   └── Alert.tsx
│   └── ProtectedRoute.tsx
├── pages/
│   ├── Landing.tsx
│   ├── Login.tsx
│   ├── Register.tsx
│   ├── Dashboard.tsx
│   ├── Devices.tsx
│   ├── Analytics.tsx
│   ├── Policies.tsx
│   └── Settings.tsx
├── stores/
│   ├── authStore.ts
│   └── settingsStore.ts
├── lib/
│   └── apollo.ts
├── routes.tsx
├── App.tsx
└── main.tsx
```

## 🚀 Getting Started

1. **Read this document** thoroughly
2. **Start with Phase 1** (Apollo Client)
3. **Work through phases sequentially**
4. **Test after each phase**
5. **Update todo list** as you progress
6. **Document issues** you encounter

## 💡 Tips

- Use `lucide-react` for icons (already installed)
- Follow TailwindCSS utility-first approach
- Keep components small and focused
- Use TypeScript strictly
- Test with real API data
- Handle loading and error states
- Make components responsive

## 🆘 Common Issues

### Issue 1: CORS Errors
**Solution**: Ensure API has CORS enabled for `http://localhost:5250`

### Issue 2: GraphQL Network Errors
**Solution**: Check API is running on port 4250

### Issue 3: State Not Persisting
**Solution**: Verify localStorage is working in browser

### Issue 4: Hot Reload Not Working
**Solution**: Check Vite config and restart dev server

## 📖 Resources

- [React 19 Docs](https://react.dev)
- [Apollo Client Docs](https://www.apollographql.com/docs/react/)
- [Zustand Docs](https://docs.pmnd.rs/zustand/getting-started/introduction)
- [React Router Docs](https://reactrouter.com/)
- [TailwindCSS Docs](https://tailwindcss.com/docs)
- [Lucide Icons](https://lucide.dev/)

---

**Ready to start? Begin with Task 1: Configure Apollo Client** 🚀

**Jai Guru Ji** 🙏
