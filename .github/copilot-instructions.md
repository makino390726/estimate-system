# Copilot Instructions for estimate-system

## Project Overview
**estimate-system** is a Next.js 16 quotation (見積書) management application with Supabase backend and Resend email integration. It manages product catalogs, staff profiles, customer records, and generates PDF estimates with multi-level approval workflows.

**Tech Stack**: Next.js 16 (App Router), TypeScript, Tailwind CSS 4, Supabase (PostgreSQL), Resend API, jsPDF, react-to-print

## Architecture Patterns

### Client-Server Data Flow
- **Client Components** (`'use client'`): All pages are client components that directly import and use `supabaseClient` from `lib/supabaseClient.ts`
- **Supabase Client Pattern**: Single shared client instance used throughout - never create new clients per component
  ```typescript
  import { supabase } from '@/lib/supabaseClient'
  // Use directly: supabase.from('table_name').select(...)
  ```
- **Server-Side API Routes**: Limited use - currently only `app/api/send-approval-email/route.ts` for email dispatching via Resend
  - Environment detection: `isDevelopment = process.env.NODE_ENV !== 'production'`
  - Dev emails route to `smata2696@gmail.com`, production emails to specified recipients

### Core Data Models
**Customers** (`types/customer.ts`): Comprehensive contact/company info with aliases for backward compatibility
- Primary fields: `id`, `name`, `kana`, `phone`/`tel`, `email`, `postal_code`, `prefecture`, `city`, `address`/`address1`, `building`/`address2`
- Note: Multiple field aliases exist (`tel`↔`phone`, `address1`↔`address`) to support schema evolution

**Products**: Merchandise with pricing and specs
- Fields: `id`, `name`, `spec`, `unit`, `unit_price`, `cost_price`
- Usage in cases: Referenced by `product_id` in case detail rows

**Staff**: Team members with approval hierarchy
- Fields: `id`, `name`, `email`, `stamp_path` (digital signature)
- Approval levels: applicant → section_head → senmu (部長/director) → shacho (社長/president)

**Cases** (見積): Master estimate records
- Fields: `case_id` (custom hex), `subject`, `customer_id`, `staff_id`, `discount`, `tax_rate`, `validity_text`, `payment_terms`, delivery info
- Linked details via `case_id` in detail rows (one-to-many)

**Case Details** (見積詳細): Line items within estimates
- Fields: `case_id`, `product_id`, `product_name`, `spec`, `unit`, `quantity`, `unit_price`, `amount`, `cost_price`, `section_id`
- Sections: Organizational groupings within an estimate (for layout/performance tracking)

### Data Query Patterns
All pages use `.select('*')` or column-specific selects with filters:
```typescript
// Typical pattern - immediate execution on mount/state change
const { data, error } = await supabase
  .from('customers')
  .select('*')
  .ilike('name', `%${searchName}%`)

if (error) console.error(error)
// Update state directly: setCustomers(data || [])
```
**No complex joins or RLS policies currently implemented** - frontend filters are applied post-fetch.

### State Management
- **Local Component State** (useState): Preferred approach - all pages manage UI state locally
- **Form Modal Pattern**: Show/hide modals with separate state for search inputs
  ```typescript
  const [showCustomerModal, setShowCustomerModal] = useState(false)
  const [customerSearchName, setCustomerSearchName] = useState('')
  ```
- **Calculated Fields**: Totals, amounts, and gross profit computed in-component (no stored procedures)

## Key Workflows

### Creating an Estimate (`app/cases/new/page.tsx`)
1. **Customer Selection**: Modal search → `setCustomerId()` + `setCustomerName()`
2. **Staff Assignment**: Modal search → `setStaffId()` + `setStaffName()`
3. **Add Line Items**: 
   - Product lookup with quantity/unit_price overrides
   - Amount calculated: `quantity × unit_price`
   - Can assign to `section_id` for organizational tracking
4. **Configure Terms**:
   - Discount % applied → affects subtotal before tax
   - Tax rate (default 0.1/10%) → calculated on subtotal
   - Delivery/Payment terms → free text with template defaults ("お打合せの通り")
5. **Save & Print**:
   - Insert case → `supabase.from('cases').insert()`
   - Insert details rows → bulk `insert([...rows])`
   - Generate PDF via `PrintEstimate` component using jsPDF + react-to-print
6. **Layout Toggle**: `layoutType` state switches between 'vertical' and 'horizontal' print layouts

### Approval Workflow (`app/cases/approval/[caseId]/page.tsx`)
1. **Case Retrieval**: Dynamic route param `[caseId]` → fetch case + details + staffInfo
2. **Approval Chain**:
   - Current user (staff) → Section Manager → Director (senmu) → President (shacho)
   - Each level can approve or reject
3. **Email Dispatch**:
   - POST to `/api/send-approval-email` with case details
   - Resend API sends HTML email with approval link
   - Dev env: All emails route to test account
4. **PDF Preview**: Multiple approval level stamps available - preview before sending approval
5. **Section Performance**: Tracks cost vs. revenue by section for staff evaluation

### Master Data Management
- **Products** (`app/products/page.tsx`): CRUD for inventory
- **Staff** (`app/staffs/page.tsx`): CRUD with stamp/signature image upload
- **Customers** (`app/customers/select/page.tsx`): Selection interface (full CRUD not yet visible in workspace)

## Critical Implementation Details

### Print & PDF Generation
- **Component**: `PrintEstimate.tsx` in case creation/approval pages
- **Library**: `jspdf` + `jspdf-autotable` for tables, `react-to-print` for print trigger
- **Section Rendering**: If `sections` populated, renders with section headers; empty sections collapse
- **Stamps**: Digital signatures placed at approval levels (fetched from `stamp_path`)

### Modal Architecture
All modals follow consistent pattern:
```typescript
{showCustomerModal && (
  <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
    <div className="bg-white rounded-lg p-6 max-h-[80vh] overflow-auto">
      {/* Search input */}
      <input value={customerSearchName} onChange={...} />
      {/* Results table */}
      {/* Selection handler: setCustomerId(id); setShowCustomerModal(false) */}
    </div>
  </div>
)}
```

### Environment Variables Required
```
NEXT_PUBLIC_SUPABASE_URL=https://...supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=eyJ...
RESEND_API_KEY=re_...
NODE_ENV=development|production
```

### Path Inconsistencies (Known Issues)
Multiple import patterns coexist - prefer `@/lib/supabaseClient`:
- ✅ `import { supabase } from '@/lib/supabaseClient'`
- ⚠️ `import { supabase } from '../../../lib/supabaseClient'` (relative - brittle)

## Common Patterns to Follow

1. **Always use `'use client'` at page top** - entire app is client-rendered
2. **useRouter from `'next/navigation'`** not `'next/router'`
3. **Handle Supabase errors explicitly**:
   ```typescript
   if (error) {
     console.error('Error fetching data:', error.message)
     return
   }
   ```
4. **Computed totals in JSX**: `subtotal`, `taxAmount`, `total` derived from rows on-render
5. **Date format**: ISO string (`new Date().toISOString().split('T')[0]`) for HTML date inputs
6. **Inline styles for tables**: `thStyle` & `tdStyle` objects prevent undefined CSS errors
7. **Modal search debouncing**: Not currently implemented - consider adding for large datasets
8. **Form resets**: `setRows([])`, `setCustomerId('')`, etc. after successful insert

## Performance Considerations
- Large product/customer lists loaded entirely into state (no pagination visible)
- No React Query/SWR - consider adding if data fetching becomes complex
- Sections array rebuilt on each case detail fetch - OK for current scale
- PDF generation blocks UI during print dialog - expected behavior with react-to-print

## Testing & Development
```bash
npm run dev          # Start Next.js dev server on localhost:3000
npm run build        # TypeScript compilation check
npm run lint         # ESLint validation
```

No existing test framework - unit/integration tests not yet implemented.

## Files to Reference When Adding Features
- **New case types**: `app/cases/new/page.tsx` (1719 lines - largest file, primary data entry)
- **Approval logic**: `app/cases/approval/[caseId]/page.tsx` (905 lines - complex state, multi-step workflow)
- **Shared UI patterns**: `components/CustomerLookup.tsx` (if enhanced lookup components needed)
- **Email templates**: `app/api/send-approval-email/route.ts` (HTML email composition)
- **Type definitions**: `types/customer.ts` (extend for new entities)

