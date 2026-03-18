/** Dashboard record as stored in D1. */
export interface Dashboard {
  id: string;
  org_id: string;
  user_id: string;
  name: string;
  layout: string | null;
  is_shared: boolean;
  created_at: string;
  updated_at: string;
}

/** Dashboard widget record as stored in D1. */
export interface DashboardWidget {
  id: string;
  dashboard_id: string;
  report_id: string;
  position_x: number;
  position_y: number;
  width: number;
  height: number;
  config: string | null;
}
