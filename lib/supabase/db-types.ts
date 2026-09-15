// Minimal DB types matching supabase/migrations/0001_autofair_schema.sql
// Keep in sync with SQL. App-level Car type lives in @/types.

export interface DbVehicle {
  id: string;
  seller_id: string | null;
  reg_number: string;
  make: string;
  model: string;
  variant: string;
  year: number;
  fuel: 'Petrol' | 'Diesel' | 'CNG' | 'Electric' | 'Hybrid';
  transmission: 'Manual' | 'Automatic' | 'AMT' | 'CVT';
  km_driven: number;
  ownership: string;
  location: string;
  price_expected: number;
  status: 'draft' | 'submitted' | 'in_review' | 'verified' | 'rejected' | 'published' | 'sold';
  inspection_id: string;
  created_at: string;
  updated_at: string;
}

export interface DbVehiclePhoto {
  id: string;
  vehicle_id: string;
  storage_path: string;
  public_url: string;
  sort_order: number;
  is_cover: boolean;
  created_at: string;
}

export interface DbListing {
  id: string;
  vehicle_id: string;
  slug: string;
  title: string;
  price: number;
  description: string;
  status: 'DRAFT' | 'IN_REVIEW' | 'LIVE' | 'PAUSED' | 'SOLD';
  views_count: number;
  published_at: string | null;
  expires_at: string | null;
  created_at: string;
}

export interface DbInspection {
  id: string;
  vehicle_id: string;
  inspector_id: string | null;
  score: number | null;
  overall_status: 'pass' | 'attention' | 'fail';
  inspected_at: string | null;
  is_sample: boolean;
  notes: string;
}

export interface DbInspectionSection {
  id: string;
  inspection_id: string;
  title: string;
  passed: number;
  total: number;
}

export interface DbInspectionItem {
  id: string;
  section_id: string;
  name: string;
  result: 'pass' | 'attention' | 'fail';
  note: string;
}

// Joined row used by queries: listing + vehicle + cover photo
export interface ListingWithVehicle extends DbListing {
  vehicle: DbVehicle;
  cover_url: string | null;
}
