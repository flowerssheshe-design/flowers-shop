// Shapes for staff requests to the owners ("פניות עובדים").

export type StaffRequestView = {
  id: string;
  employee_id: string | null;
  employee_name: string;
  body: string;
  created_at: string;
  resolved_at: string | null;
  reply: string | null;
};

export type StaffRequestsResponse = { ready: boolean; requests: StaffRequestView[]; isOwner: boolean };
