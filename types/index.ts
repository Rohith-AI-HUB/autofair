export interface Verification {
  verified: boolean;
  inspection: string;
  documents: string;
  accidentHistory: string;
}

export interface Car {
  id: string;
  slug: string;
  make: string;
  model: string;
  variant: string;
  year: number;
  price: number;
  mileageKm: number;
  fuel: 'Petrol' | 'Diesel' | 'CNG' | 'Electric' | 'Hybrid';
  transmission: 'Manual' | 'Automatic' | 'AMT' | 'CVT';
  ownership: string;
  location: string;
  registration: string;
  images: string[];
  inspectionId: string;
  score: number;
  condition: {
    mechanical: string;
    exterior: string;
    interior: string;
    tyres: string;
  };
  verification: Verification;
  docsPending?: boolean;
}

export interface InspectionItem {
  name: string;
  result: 'pass' | 'attention' | 'fail';
  note: string;
}

export interface InspectionCategory {
  id: string;
  title: string;
  passed: number;
  total: number;
  items: InspectionItem[];
}
