export interface Room {
  building_name: string;
  room_number: number;
  number_of_beds: number;
  room_rank: string;
  designated_department: string;
  departments: string[];
  gender: string;
  occupant_ids: string[];
  occupant_names: Record<string, string>;
  available_beds: number;
  occupant_count: number;
}

export interface PersonLink {
  person_id: string;
  building_name: string;
  room_number: number;
}

export interface Personnel {
  person_id: string;
  full_name: string;
  department: string;
  gender: string;
  rank: string;
}

export interface AssignResponse {
  assigned: boolean;
  room?: {
    building_name: string;
    room_number: number;
    room_rank_used: string;
  };
  error_code?: string;
  error_message?: string;
}

export interface BuildingSummary {
  name: string;
  totalRooms: number;
  totalBeds: number;
  occupiedBeds: number;
  availableBeds: number;
  occupancyRate: number;
  departments: string[];
  ranks: string[];
}

export interface DepartmentSummary {
  name: string;
  totalRooms: number;
  totalBeds: number;
  occupiedBeds: number;
  availableBeds: number;
  occupancyRate: number;
  buildings: string[];
}

export interface GenderSummary {
  name: string;
  totalRooms: number;
  totalBeds: number;
  occupiedBeds: number;
  availableBeds: number;
  occupancyRate: number;
}

export interface RankSummary {
  name: string;
  totalRooms: number;
  totalBeds: number;
  occupiedBeds: number;
  availableBeds: number;
  occupancyRate: number;
}

export type ViewMode = "buildings" | "departments" | "gender" | "rank";
